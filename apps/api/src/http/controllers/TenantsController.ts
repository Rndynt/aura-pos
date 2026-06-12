/**
 * Tenants Controller
 * Handles tenant entitlement/profile endpoints.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import {
  ENTITLEMENT_CATALOG,
  canPurchaseOffer,
  getEffectiveEntitlements,
  type BusinessTypeCode,
  type EntitlementCode,
  type PlanCode,
  type TenantEntitlementGrant,
} from '@pos/application/entitlements';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { db } from '@pos/infrastructure/database';
import { tenantEntitlements, tenants } from '@pos/infrastructure/db/schema';
import {
  invalidateFeatureAccessCache,
  invalidateTenantFeatureModuleAndOutletCaches,
  invalidateTenantResolutionCache,
} from '../../services/cacheInvalidation';

const DEFAULT_PLAN: PlanCode = 'starter';
const DEFAULT_BUSINESS_TYPE: BusinessTypeCode = 'CAFE_RESTAURANT';

function toPlanCode(planTier: string | null | undefined): PlanCode {
  if (planTier === 'starter' || planTier === 'growth' || planTier === 'pro') return planTier;
  if (planTier === 'free') return 'starter';
  return DEFAULT_PLAN;
}

function toBusinessTypeCode(businessType: string | null | undefined): BusinessTypeCode {
  if (businessType && businessType in ENTITLEMENT_CATALOG.businessTypes) {
    return businessType as BusinessTypeCode;
  }
  return DEFAULT_BUSINESS_TYPE;
}

function isEntitlementCode(code: string): code is EntitlementCode {
  return code in ENTITLEMENT_CATALOG.entitlements;
}

async function loadTenantContext(tenantId: string) {
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) {
    throw createError('Tenant not found', 404, 'TENANT_NOT_FOUND');
  }

  const grants = await db
    .select({
      id: tenantEntitlements.id,
      entitlementCode: tenantEntitlements.entitlementCode,
      status: tenantEntitlements.status,
      expiresAt: tenantEntitlements.expiresAt,
      source: tenantEntitlements.source,
      config: tenantEntitlements.config,
    })
    .from(tenantEntitlements)
    .where(eq(tenantEntitlements.tenantId, tenantId));

  return {
    tenant,
    planCode: toPlanCode(tenant.planTier),
    businessType: toBusinessTypeCode(tenant.businessType),
    grants: grants.map((grant): TenantEntitlementGrant => ({
      entitlementCode: grant.entitlementCode,
      status: grant.status as TenantEntitlementGrant['status'],
      expiresAt: grant.expiresAt,
      source: grant.source as TenantEntitlementGrant['source'],
    })),
    grantRows: grants,
  };
}

async function buildEntitlementResponse(tenantId: string) {
  const context = await loadTenantContext(tenantId);
  const effective = await getEffectiveEntitlements({
    planCode: context.planCode,
    businessType: context.businessType,
    grants: context.grants,
  });

  const entitlements = Object.fromEntries(
    (Object.keys(ENTITLEMENT_CATALOG.entitlements) as EntitlementCode[]).map((code) => [code, effective.has(code)]),
  ) as Record<EntitlementCode, boolean>;

  return {
    tenant: {
      id: context.tenant.id,
      name: context.tenant.name,
      slug: context.tenant.slug,
      planTier: context.planCode,
      businessType: context.businessType,
      subscriptionStatus: context.tenant.subscriptionStatus,
      settings: context.tenant.settings,
    },
    entitlements,
    plans: ENTITLEMENT_CATALOG.plans,
    offers: ENTITLEMENT_CATALOG.offers,
    catalog: ENTITLEMENT_CATALOG.entitlements,
    grants: context.grantRows,
  };
}

/**
 * GET /api/tenants/features
 * Get effective commercial entitlements for tenant.
 */
export const getActiveFeatures = asyncHandler(async (req: Request, res: Response) => {
  const profile = await buildEntitlementResponse(req.tenantId!);
  const features = Object.entries(profile.entitlements)
    .filter(([, enabled]) => enabled)
    .map(([feature_code]) => ({
      enabled: true,
      feature_code,
      reason: 'Entitlement is effective for this tenant',
      expires_at: null,
      config: undefined,
    }));

  res.status(200).json({
    success: true,
    data: {
      features,
      entitlements: profile.entitlements,
      total: features.length,
    },
  });
});

/**
 * POST /api/tenants/features/check
 * Check entitlement access for tenant.
 */
export const checkFeatureAccess = asyncHandler(async (req: Request, res: Response) => {
  const bodySchema = z.object({
    feature_code: z.string().min(1),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw createError('Invalid request body: ' + parsed.error.message, 400, 'VALIDATION_ERROR');
  }

  const { feature_code } = parsed.data;
  const profile = await buildEntitlementResponse(req.tenantId!);
  const enabled = isEntitlementCode(feature_code) ? profile.entitlements[feature_code] : false;

  res.status(200).json({
    success: true,
    data: {
      enabled,
      feature_code,
      reason: enabled
        ? 'Entitlement is effective for this tenant'
        : 'Unknown or unavailable commercial entitlement',
      expires_at: null,
    },
  });
});

/**
 * POST /api/tenants/register
 * Deprecated tenant-only registration endpoint. Production onboarding must use
 * POST /api/register so tenant, owner, outlet, order types, and starter catalog
 * are created by one canonical flow.
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
 * Grant/cancel a purchased commercial entitlement for the current tenant.
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

  const entitlementCode = parsed.data.feature_code;
  if (!isEntitlementCode(entitlementCode)) {
    throw createError(`Unknown commercial entitlement '${entitlementCode}'.`, 400, 'UNKNOWN_ENTITLEMENT');
  }

  const context = await loadTenantContext(tenantId);
  const catalogOffer = Object.entries(ENTITLEMENT_CATALOG.offers).find(([, offer]) => offer.entitlement === entitlementCode);
  if (catalogOffer && !canPurchaseOffer({ offerCode: catalogOffer[0] as keyof typeof ENTITLEMENT_CATALOG.offers, planCode: context.planCode })) {
    throw createError(
      `Entitlement '${entitlementCode}' is not purchasable for plan ${context.planCode}.`,
      403,
      'PLAN_RESTRICTION',
    );
  }

  const [existing] = await db
    .select({ id: tenantEntitlements.id, status: tenantEntitlements.status })
    .from(tenantEntitlements)
    .where(and(
      eq(tenantEntitlements.tenantId, tenantId),
      eq(tenantEntitlements.entitlementCode, entitlementCode),
    ))
    .limit(1);

  let isActive: boolean;
  if (existing?.status === 'active') {
    await db
      .update(tenantEntitlements)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(tenantEntitlements.id, existing.id));
    isActive = false;
  } else if (existing) {
    await db
      .update(tenantEntitlements)
      .set({ status: 'active', startsAt: new Date(), expiresAt: null, updatedAt: new Date() })
      .where(eq(tenantEntitlements.id, existing.id));
    isActive = true;
  } else {
    await db.insert(tenantEntitlements).values({
      tenantId,
      entitlementCode,
      source: 'purchase',
      status: 'active',
    });
    isActive = true;
  }

  await invalidateFeatureAccessCache(tenantId, entitlementCode, 'tenant_entitlement_toggle');

  res.status(200).json({
    success: true,
    data: { feature_code: entitlementCode, entitlement_code: entitlementCode, is_active: isActive },
  });
});

/**
 * PATCH /api/tenants/modules
 * Legacy module toggles are no longer persisted. Return current effective
 * entitlements so callers can migrate to entitlement-code based controls.
 */
export const updateModuleConfig = asyncHandler(async (req: Request, res: Response) => {
  const bodySchema = z.object({}).passthrough();
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw createError('Invalid request body: ' + parsed.error.message, 400, 'VALIDATION_ERROR');
  }

  res.status(410).json({
    success: false,
    error: 'Legacy module configuration flags have been removed. Use entitlement codes from /api/tenants/profile or /api/tenants/features.',
    code: 'LEGACY_MODULE_CONFIG_REMOVED',
    data: await buildEntitlementResponse(req.tenantId!),
  });
});

/**
 * Returns true only if the request carries a valid internal billing secret.
 * Used to restrict plan-tier mutations to the billing/admin system.
 */
export function isBillingPlanChangeAuthorized(req: Request): boolean {
  const configuredSecret = process.env.BILLING_INTERNAL_SECRET;
  if (!configuredSecret) return false;
  const provided = req.headers['x-internal-billing-secret'];
  return typeof provided === 'string' && provided === configuredSecret;
}

/**
 * PATCH /api/tenants/plan
 * Switch plan tier only. Default plan/business entitlements are derived at
 * runtime from the entitlement catalog and are not persisted as grant rows.
 */
export const updatePlanTier = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;

  if (!isBillingPlanChangeAuthorized(req)) {
    res.status(403).json({
      success: false,
      error: 'Plan changes are restricted to the billing/admin system.',
      code: 'BILLING_AUTH_REQUIRED',
    });
    return;
  }

  const bodySchema = z.object({
    plan_tier: z.enum(['starter', 'growth', 'pro']),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw createError('Invalid plan tier. Must be one of: starter, growth, pro', 400, 'VALIDATION_ERROR');
  }

  const { plan_tier } = parsed.data;

  await db
    .update(tenants)
    .set({ planTier: plan_tier, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));

  await Promise.all([
    invalidateTenantResolutionCache(tenantId, [tenantId], 'tenant_plan_tier_update'),
    invalidateTenantFeatureModuleAndOutletCaches(tenantId, 'tenant_plan_tier_update'),
  ]);

  const profile = await buildEntitlementResponse(tenantId);

  res.status(200).json({
    success: true,
    data: {
      plan_tier,
      activated_entitlements: Object.keys(profile.entitlements)
        .filter((code) => profile.entitlements[code as EntitlementCode]),
    },
  });
});

/**
 * GET /api/tenants/profile
 * Get tenant profile with effective entitlement data.
 */
export const getTenantProfile = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: await buildEntitlementResponse(req.tenantId!),
  });
});
