/**
 * Tenants Controller
 *
 * Entitlement-aware tenant endpoints. All tenant access state is derived from
 * the entitlement SOT (packages/application/entitlements) + tenant_entitlements
 * grants. No legacy feature/module tables are read here.
 */

import { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { db, tenants } from '../../composition/modules/httpApplicationBoundaryModule';
import { ENTITLEMENT_CATALOG } from '@pos/application/entitlements';
import { resolveBusinessProfileFromBusinessType, resolveBusinessProfileSource } from '@pos/application/business-flows';
import {
  getEffectiveEntitlementMap,
  loadTenantEntitlementContext,
} from '../../services/tenantEntitlements';

/**
 * Builds the canonical entitlement response shape shared by
 * GET /api/me/entitlements and GET /api/tenants/profile.
 */
async function buildEntitlementProfile(tenantId: string) {
  const [tenantRow] = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      businessName: tenants.businessName,
      businessAddress: tenants.businessAddress,
      businessPhone: tenants.businessPhone,
      businessEmail: tenants.businessEmail,
      businessType: tenants.businessType,
      planTier: tenants.planTier,
      subscriptionStatus: tenants.subscriptionStatus,
      currency: tenants.currency,
      timezone: tenants.timezone,
      locale: tenants.locale,
      settings: tenants.settings,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenantRow) {
    throw createError('Tenant not found', 404, 'TENANT_NOT_FOUND');
  }

  const context = await loadTenantEntitlementContext(tenantId);
  const entitlements = await getEffectiveEntitlementMap(tenantId);
  const businessType = context?.businessType ?? tenantRow.businessType;
  const businessProfileInput = { businessType, businessTypeCode: businessType };
  const businessProfile = resolveBusinessProfileFromBusinessType(businessProfileInput);
  const businessProfileSource = resolveBusinessProfileSource(businessProfileInput);

  return {
    tenant: {
      id: tenantRow.id,
      name: tenantRow.name,
      slug: tenantRow.slug,
      business_name: tenantRow.businessName,
      business_address: tenantRow.businessAddress,
      business_phone: tenantRow.businessPhone,
      business_email: tenantRow.businessEmail,
      businessType,
      business_type: businessType,
      businessProfile,
      business_profile: businessProfile,
      businessProfileSource,
      business_profile_source: businessProfileSource,
      planTier: context?.planCode ?? tenantRow.planTier,
      plan_tier: context?.planCode ?? tenantRow.planTier,
      subscription_status: tenantRow.subscriptionStatus,
      currency: tenantRow.currency,
      timezone: tenantRow.timezone,
      locale: tenantRow.locale,
      settings: tenantRow.settings,
    },
    entitlements,
    grants: (context?.grants ?? []).map((grant) => ({
      entitlement_code: grant.entitlementCode,
      status: grant.status,
      source: grant.source,
      expires_at: grant.expiresAt ?? null,
    })),
    catalog: {
      plans: ENTITLEMENT_CATALOG.plans,
      entitlements: ENTITLEMENT_CATALOG.entitlements,
      offers: ENTITLEMENT_CATALOG.offers,
      businessTypes: ENTITLEMENT_CATALOG.businessTypes,
    },
  };
}

/**
 * GET /api/me/entitlements
 * Canonical entitlement endpoint for frontend consumption.
 */
export const getMyEntitlements = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const profile = await buildEntitlementProfile(tenantId);
  res.status(200).json({ success: true, data: profile });
});

/**
 * GET /api/tenants/profile
 * Tenant profile including effective entitlements + catalog (same shape as
 * /api/me/entitlements for frontend stability).
 */
export const getTenantProfile = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const profile = await buildEntitlementProfile(tenantId);
  res.status(200).json({ success: true, data: profile });
});

/**
 * GET /api/tenants/entitlements
 * Effective entitlement map only (lightweight).
 */
export const getTenantEntitlements = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const entitlements = await getEffectiveEntitlementMap(tenantId);
  res.status(200).json({ success: true, data: { entitlements } });
});

/**
 * POST /api/tenants/register
 * Deprecated tenant-only registration endpoint. Production onboarding must use
 * POST /api/register.
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
