/**
 * Tenants Controller
 * Handles tenant feature management endpoints
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { container } from '../../container';
import { asyncHandler, createError } from '../middleware/errorHandler';
import type { BusinessType } from '@pos/core';
import { auth, authDb } from '../../lib/auth';
import { user as authUser } from '../../lib/auth-schema';
import { fromNodeHeaders } from 'better-auth/node';
import { db } from '@pos/infrastructure/database';
import { tenants, tenantFeatures } from '@shared/schema';

// ─── Plan → Feature mapping (must stay in sync with marketplace.tsx PLANS) ────
const PLAN_FEATURE_MAP: Record<string, string[]> = {
  free: [
    'product_variants', 'partial_payment', 'discounts', 'order_queue',
    'receipt_printer', 'sales_reports',
  ],
  growth: [
    'product_variants', 'partial_payment', 'discounts', 'order_queue',
    'receipt_printer', 'sales_reports',
    'kitchen_ticket', 'kitchen_display', 'kitchen_printer',
    'order_notifications', 'analytics_dashboard', 'label_printer', 'barcode_scanner',
    'inventory_tracking', 'inventory_reports',
  ],
  pro: [
    'product_variants', 'partial_payment', 'discounts', 'order_queue',
    'receipt_printer', 'sales_reports',
    'kitchen_ticket', 'kitchen_display', 'kitchen_printer',
    'order_notifications', 'analytics_dashboard', 'label_printer', 'barcode_scanner',
    'inventory_tracking', 'inventory_reports',
    'payment_gateway', 'api_integration', 'online_booking', 'calendar_sync',
  ],
};

/**
 * GET /api/tenants/features
 * Get active features for tenant
 */
export const getActiveFeatures = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;

  // Execute use case
  const result = await container.getActiveFeaturesForTenant.execute({
    tenant_id: tenantId,
  });

  res.status(200).json({
    success: true,
    data: {
      features: result.features,
      total: result.total,
    },
  });
});

/**
 * POST /api/tenants/features/check
 * Check feature access for tenant
 */
export const checkFeatureAccess = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;

  // Validate request body
  const bodySchema = z.object({
    feature_code: z.string().min(1),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw createError('Invalid request body: ' + parsed.error.message, 400, 'VALIDATION_ERROR');
  }

  const { feature_code } = parsed.data;

  // Execute use case
  const result = await container.checkFeatureAccess.execute({
    tenant_id: tenantId,
    feature_code,
  });

  res.status(200).json({
    success: true,
    data: result.result,
  });
});

/**
 * POST /api/tenants/register
 * Create new tenant with business type
 */
export const registerTenant = asyncHandler(async (req: Request, res: Response) => {
  // Validate request body
  const bodySchema = z.object({
    name: z.string().min(1, 'Name is required'),
    slug: z
      .string()
      .min(1, 'Slug is required')
      .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
    business_type: z.enum([
      'CAFE_RESTAURANT',
      'RETAIL_MINIMARKET',
      'LAUNDRY',
      'SERVICE_APPOINTMENT',
      'DIGITAL_PPOB',
    ] as const, {
      errorMap: () => ({ message: 'Invalid business type' }),
    }),
    business_name: z.string().optional(),
    business_address: z.string().optional(),
    business_phone: z.string().optional(),
    business_email: z.preprocess(
      (val) => (val === '' || val === null ? undefined : val),
      z.string().email('Invalid email format').optional()
    ),
    timezone: z.string().optional(),
    currency: z.string().optional(),
    locale: z.string().optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw createError('Invalid request body: ' + parsed.error.message, 400, 'VALIDATION_ERROR');
  }

  const data = parsed.data;

  // Execute use case
  const result = await container.createTenant.execute({
    name: data.name,
    slug: data.slug,
    business_type: data.business_type as BusinessType,
    business_name: data.business_name,
    business_address: data.business_address,
    business_phone: data.business_phone,
    business_email: data.business_email || undefined,
    timezone: data.timezone,
    currency: data.currency,
    locale: data.locale,
  });

  const tenantId = result.profile.tenant.id;

  // Link the new tenant to the authenticated user so /api/auth/me returns tenantId
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (session?.user?.id) {
      await authDb
        .update(authUser)
        .set({ tenantId })
        .where(eq(authUser.id, session.user.id));
    }
  } catch (linkErr) {
    console.error('[registerTenant] Failed to link tenantId to user:', linkErr);
    // Non-fatal: tenant was created, user can still log in
  }

  res.status(201).json({
    success: true,
    data: {
      tenant: result.profile.tenant,
      features: result.profile.features,
      moduleConfig: result.profile.moduleConfig,
    },
  });
});

/**
 * POST /api/tenants/features/toggle
 * Activate or deactivate a single feature code for the current tenant.
 * Enforces plan tier — a tenant cannot activate a feature that requires a higher plan.
 */
export const toggleFeature = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;

  const bodySchema = z.object({
    feature_code: z.string().min(1),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw createError('Invalid request body: ' + parsed.error.message, 400, 'VALIDATION_ERROR');
  }

  const { feature_code } = parsed.data;

  // ── Plan tier enforcement ──────────────────────────────────────────────────
  const [tenantRow] = await db
    .select({ planTier: tenants.planTier })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const planTier = tenantRow?.planTier ?? 'free';
  const allowedFeatures = PLAN_FEATURE_MAP[planTier] ?? PLAN_FEATURE_MAP.free;

  if (!allowedFeatures.includes(feature_code)) {
    throw createError(
      `Fitur '${feature_code}' tidak tersedia pada paket ${planTier}. Upgrade paket untuk mengaktifkan fitur ini.`,
      403,
      'PLAN_RESTRICTION',
    );
  }

  const repo = container.tenantFeatureRepository;
  const existing = await repo.findByTenantAndFeature(tenantId, feature_code);

  let updated;
  if (!existing) {
    updated = await repo.create({
      tenantId,
      featureCode: feature_code,
      source: 'purchase',
      isActive: true,
    } as any);
  } else {
    updated = await repo.update(existing.id, { isActive: !existing.is_active } as any);
  }

  res.status(200).json({
    success: true,
    data: { feature_code: updated.feature_code, is_active: updated.is_active },
  });
});

/**
 * PATCH /api/tenants/modules
 * Update module config flags for the current tenant
 */
export const updateModuleConfig = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { db } = await import('@pos/infrastructure/database');
  const { tenantModuleConfigs } = await import('@shared/schema');
  const { eq } = await import('drizzle-orm');

  const bodySchema = z.object({
    enableTableManagement: z.boolean().optional(),
    enableKitchenTicket: z.boolean().optional(),
    enableLoyalty: z.boolean().optional(),
    enableDelivery: z.boolean().optional(),
    enableInventory: z.boolean().optional(),
    enableInventoryAdvanced: z.boolean().optional(),
    enableAppointments: z.boolean().optional(),
    enableMultiLocation: z.boolean().optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw createError('Invalid request body: ' + parsed.error.message, 400, 'VALIDATION_ERROR');
  }

  const updates = parsed.data;

  // Dependency enforcement:
  // - Enabling Stok Lanjutan (advanced) auto-enables Stok Dasar (basic)
  // - Disabling Stok Dasar (basic) auto-disables Stok Lanjutan (advanced)
  if (updates.enableInventoryAdvanced === true) {
    updates.enableInventory = true;
  }
  if (updates.enableInventory === false) {
    updates.enableInventoryAdvanced = false;
  }

  const existing = await db
    .select()
    .from(tenantModuleConfigs)
    .where(eq(tenantModuleConfigs.tenantId, tenantId))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(tenantModuleConfigs).values({ tenantId, ...updates });
  } else {
    await db
      .update(tenantModuleConfigs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tenantModuleConfigs.tenantId, tenantId));
  }

  const [updated] = await db
    .select()
    .from(tenantModuleConfigs)
    .where(eq(tenantModuleConfigs.tenantId, tenantId))
    .limit(1);

  res.status(200).json({ success: true, data: updated });
});

/**
 * PATCH /api/tenants/plan
 * Switch plan tier and sync all plan_default features accordingly
 */
export const updatePlanTier = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;

  const bodySchema = z.object({
    plan_tier: z.enum(['free', 'growth', 'pro']),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw createError('Invalid plan tier. Must be one of: free, growth, pro', 400, 'VALIDATION_ERROR');
  }

  const { plan_tier } = parsed.data;
  const newFeatures = PLAN_FEATURE_MAP[plan_tier] ?? [];

  // 1. Update plan tier on tenant row
  await db
    .update(tenants)
    .set({ planTier: plan_tier, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));

  // 2. Remove all existing plan_default features (clean slate for this plan)
  await db
    .delete(tenantFeatures)
    .where(
      and(
        eq(tenantFeatures.tenantId, tenantId),
        eq(tenantFeatures.source, 'plan_default'),
      ),
    );

  // 3. Insert fresh plan_default features for the new plan
  if (newFeatures.length > 0) {
    await db.insert(tenantFeatures).values(
      newFeatures.map((fc) => ({
        tenantId,
        featureCode: fc,
        source: 'plan_default' as const,
        isActive: true,
      })),
    );
  }

  res.status(200).json({
    success: true,
    data: {
      plan_tier,
      activated_features: newFeatures,
    },
  });
});

/**
 * GET /api/tenants/profile
 * Get tenant profile with modules
 */
export const getTenantProfile = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;

  // Execute use case
  const result = await container.getTenantProfile.execute({
    tenant_id: tenantId,
  });

  res.status(200).json({
    success: true,
    data: result.profile,
  });
});
