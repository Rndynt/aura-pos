/**
 * Tenants Controller
 * Handles tenant feature management endpoints
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { container } from '../../container';
import { asyncHandler, createError } from '../middleware/errorHandler';
import type { BusinessType } from '@pos/core';
import { auth, authDb } from '../../lib/auth';
import { user as authUser } from '../../lib/auth-schema';
import { fromNodeHeaders } from 'better-auth/node';

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
    enableAppointments: z.boolean().optional(),
    enableMultiLocation: z.boolean().optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw createError('Invalid request body: ' + parsed.error.message, 400, 'VALIDATION_ERROR');
  }

  const updates = parsed.data;

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
