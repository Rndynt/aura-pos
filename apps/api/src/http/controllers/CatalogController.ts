/**
 * Catalog Controller
 * Handles product catalog endpoints with tenant isolation
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { container } from '../../container';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { db } from '@pos/infrastructure/database';
import { productCategories } from '@pos/infrastructure/db/schema';
import { and, eq } from 'drizzle-orm';
import { enrichCatalogProductsWithStock } from '../helpers/catalogStockEnrichment';

/**
 * GET /api/catalog/products
 * List products with option groups
 * Query params: category, isActive
 */
export const listProducts = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;

  // Validate query params
  const querySchema = z.object({
    category: z.string().optional(),
    isActive: z.enum(['true', 'false']).optional().transform(val => val ? val === 'true' : undefined),
    // Management mode: skip outlet availability filter (shows all products for config)
    includeUnavailable: z.enum(['true', 'false']).optional().transform(val => val === 'true'),
  });

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    throw createError('Invalid query parameters', 400, 'VALIDATION_ERROR');
  }

  const { category, isActive, includeUnavailable } = parsed.data;
  const outletId = req.outletId;

  // Execute use case
  const result = await container.getProducts.execute({
    tenantId,
    category,
    isActive,
  });

  // Filter by outlet availability: exclude products explicitly marked unavailable at this outlet.
  // Skip when includeUnavailable=true (management pages need all products for configuration).
  let filteredProducts = result.products;
  if (outletId && !includeUnavailable && filteredProducts.length > 0) {
    const productIds = filteredProducts.map(p => p.id);
    const unavailableIds = await container.catalogHandlers.listUnavailableOutletProductIds(outletId, productIds);
    if (unavailableIds.size > 0) {
      filteredProducts = filteredProducts.filter(p => !unavailableIds.has(p.id));
    }
  }

  // POS stock enforcement (P5): enrich tracked products with active-outlet
  // balance fields from `inventory_balances`. Management mode (includeUnavailable)
  // also receives the enrichment so the UI can surface stock state consistently.
  let enrichedProducts: any[] = filteredProducts;
  if (filteredProducts.length > 0) {
    const balances = outletId
      ? await container.inventoryHandlers.listBalances(tenantId, outletId)
      : [];
    enrichedProducts = enrichCatalogProductsWithStock({
      products: filteredProducts,
      balances,
      outletId: outletId ?? null,
    });
  }

  res.status(200).json({
    success: true,
    data: {
      products: enrichedProducts,
      total: enrichedProducts.length,
    },
  });
});

/**
 * GET /api/catalog/products/:id
 * Get single product with full details
 */
export const getProductById = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { id } = req.params;

  if (!id) {
    throw createError('Product ID is required', 400, 'MISSING_PARAMETER');
  }

  // Execute use case
  const result = await container.getProductById.execute({
    productId: id,
    tenantId,
  });

  if (!result.product) {
    throw createError('Product not found', 404, 'PRODUCT_NOT_FOUND');
  }

  res.status(200).json({
    success: true,
    data: result.product,
  });
});

/**
 * POST /api/catalog/products - Create new product
 * PUT /api/catalog/products/:id - Update existing product
 */
export const createOrUpdateProduct = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const productId = req.params.id;

  // Validate request body
  const optionInputSchema = z.object({
    name: z.string(),
    price_delta: z.number(),
    inventory_sku: z.string().optional(),
    is_available: z.boolean().optional(),
    display_order: z.number().optional(),
  });

  const optionGroupInputSchema = z.object({
    name: z.string(),
    selection_type: z.enum(['single', 'multiple']),
    min_selections: z.number().default(0),
    max_selections: z.number().default(1),
    is_required: z.boolean(),
    display_order: z.number().optional(),
    options: z.array(optionInputSchema),
  });

  const bodySchema = z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    base_price: z.number().optional(),
    category: z.string().optional(),
    category_id: z.string().optional(),
    image_url: z.string().optional(),
    metadata: z.record(z.any()).optional(),
    has_variants: z.boolean().optional(),
    stock_tracking_enabled: z.boolean().optional(),
    stock_qty: z.number().optional(),
    sku: z.string().optional(),
    is_active: z.boolean().optional(),
    option_groups: z.array(optionGroupInputSchema).optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw createError('Invalid request body: ' + parsed.error.message, 400, 'VALIDATION_ERROR');
  }

  // Execute use case
  let category = parsed.data.category;
  if (parsed.data.category_id && !category) {
    const found = await db
      .select({ name: productCategories.name })
      .from(productCategories)
      .where(and(eq(productCategories.tenantId, tenantId), eq(productCategories.id, parsed.data.category_id)))
      .limit(1);
    if (!found[0]) throw createError('Category not found', 404, 'CATEGORY_NOT_FOUND');
    category = found[0].name;
  }

  const result = await container.createOrUpdateProduct.execute({
    tenant_id: tenantId,
    product_id: productId,
    ...parsed.data,
    category,
  });

  res.status(result.isNew ? 201 : 200).json({
    success: true,
    data: result.product,
  });
});

/**
 * POST /api/catalog/products/:id/availability
 * Check stock availability
 */
export const checkAvailability = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { id } = req.params;

  if (!id) {
    throw createError('Product ID is required', 400, 'MISSING_PARAMETER');
  }

  // Validate request body
  const bodySchema = z.object({
    quantity: z.number().int().positive(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw createError('Invalid request body: ' + parsed.error.message, 400, 'VALIDATION_ERROR');
  }

  const { quantity } = parsed.data;

  // Execute use case (P5: outlet-scoped against inventory_balances)
  const result = await container.checkProductAvailability.execute({
    productId: id,
    tenantId,
    outletId: req.outletId ?? null,
    requestedQuantity: quantity,
  });

  res.status(200).json({
    success: true,
    data: {
      isAvailable: result.isAvailable,
      product: result.product,
      availableQuantity: result.availableQuantity,
      reason: result.reason,
    },
  });
});
