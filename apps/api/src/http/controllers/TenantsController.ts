/**
 * Tenants Controller
 * Handles tenant feature management endpoints
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { container } from '../../container';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { db } from '@pos/infrastructure/database';
import { tenants, tenantFeatures } from '@shared/schema';
import {
  invalidateFeatureAccessCache,
  invalidateModuleAccessCache,
  invalidateTenantFeatureModuleAndOutletCaches,
  invalidateTenantResolutionCache,
} from '../../services/cacheInvalidation';

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
 * Deprecated tenant-only registration endpoint. Production onboarding must use
 * POST /api/register so tenant, owner, outlet, modules, features, order types,
 * and starter catalog are created by one canonical flow.
 */
export const registerTenant = asyncHandler(async (_req: Request, res: Response) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', '2026-09-01');
  res.setHeader('Link', '</api/register>; rel="successor-version"');
  res.setHeader('Location', '/api/register');
  res.status(308).json({
    success: false,
    error: 'POST /api/tenants/register is deprecated. Use POST /api/register for tenant onboarding.',
    code: 'ENDPOINT_DEPRECATED',
    location: '/api/register',
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
    updated = await repo.upsertByTenantAndFeature({
      tenantId,
      featureCode: feature_code,
      source: 'purchase',
      isActive: true,
    } as any);
  } else {
    updated = await repo.update(existing.id, { isActive: !existing.is_active } as any);
  }

  await invalidateFeatureAccessCache(tenantId, feature_code, 'tenant_feature_toggle');

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

  await invalidateModuleAccessCache(tenantId, undefined, 'tenant_module_config_update');

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

  // 3. Upsert fresh plan_default features for the new plan. This keeps plan
  // switches idempotent after tenant_features enforces one row per feature.
  const repo = container.tenantFeatureRepository;
  for (const fc of newFeatures) {
    await repo.upsertByTenantAndFeature({
      tenantId,
      featureCode: fc,
      source: 'plan_default',
      isActive: true,
    } as any);
  }

  await Promise.all([
    invalidateTenantResolutionCache(tenantId, [tenantId], 'tenant_plan_tier_update'),
    invalidateTenantFeatureModuleAndOutletCaches(tenantId, 'tenant_plan_tier_update'),
  ]);

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
