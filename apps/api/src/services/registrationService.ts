import { eq, inArray, sql } from 'drizzle-orm';
import type { BusinessType } from '@pos/core';
import { getBusinessTypeTemplate } from '@pos/application/tenants';
import { db } from '@pos/infrastructure/database';
import {
  outlets,
  tenantFeatures,
  tenantModuleConfigs,
  tenants,
  userOutletAssignments,
} from '@shared/schema';
import { auth, authDb } from '../lib/auth';
import { account, session, user as authUser } from '../lib/auth-schema';

export type RegisterTenantOwnerInput = {
  slug: string;
  businessName: string;
  businessType?: BusinessType;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  ownerUsername: string;
  timezone?: string;
  currency?: string;
  locale?: string;
};

export type RegisteredTenantOwner = {
  tenant: {
    id: string;
    slug: string;
    name: string;
    url: string;
  };
  ownerUserId: string;
  defaultOutletId: string;
};

type BetterAuthSignUpResult = {
  user?: {
    id?: string | null;
  } | null;
};

export class RegistrationError extends Error {
  constructor(
    message: string,
    public readonly code: 'DUPLICATE_SLUG' | 'DUPLICATE_EMAIL' | 'OWNER_SIGNUP_FAILED' | 'REGISTRATION_FAILED',
    public readonly status: number,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'RegistrationError';
  }
}

type RegistrationDeps = {
  baseDomain: string;
  generateId: () => string;
  runTransaction: <T>(callback: (tx: any) => Promise<T>) => Promise<T>;
  signUpOwner: (input: RegisterTenantOwnerInput) => Promise<BetterAuthSignUpResult>;
  cleanupAuthUser: (userId: string) => Promise<void>;
  cleanupTenant: (tenantId: string) => Promise<void>;
};

const DEFAULT_BUSINESS_TYPE: BusinessType = 'CAFE_RESTAURANT';

export const isUniqueViolation = (error: unknown): boolean => {
  const err = error as { code?: unknown; cause?: { code?: unknown }; message?: unknown } | null;
  return (
    err?.code === '23505' ||
    err?.cause?.code === '23505' ||
    String(err?.message ?? '').includes('unique')
  );
};

const isSlugUniqueViolation = (error: unknown): boolean => {
  const err = error as { constraint?: unknown; cause?: { constraint?: unknown }; detail?: unknown; message?: unknown } | null;
  const text = [err?.constraint, err?.cause?.constraint, err?.detail, err?.message]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return isUniqueViolation(error) && (text.includes('tenant') || text.includes('slug'));
};

const isDuplicateEmailError = (error: unknown): boolean => {
  const err = error as { code?: unknown; message?: unknown; cause?: { code?: unknown; message?: unknown } } | null;
  const text = [err?.message, err?.cause?.message].filter(Boolean).join(' ').toLowerCase();
  return (
    err?.code === 'USER_ALREADY_EXISTS' ||
    err?.cause?.code === 'USER_ALREADY_EXISTS' ||
    (isUniqueViolation(error) && text.includes('email')) ||
    text.includes('email already') ||
    text.includes('email sudah')
  );
};

const toDbModuleConfig = (tenantId: string, businessType: BusinessType) => {
  const template = getBusinessTypeTemplate(businessType);
  return {
    tenantId,
    enableTableManagement: template.moduleConfig.enable_table_management,
    enableKitchenTicket: template.moduleConfig.enable_kitchen_ticket,
    enableLoyalty: template.moduleConfig.enable_loyalty,
    enableDelivery: template.moduleConfig.enable_delivery,
    enableInventory: template.moduleConfig.enable_inventory,
    enableInventoryAdvanced: template.moduleConfig.enable_inventory_advanced,
    enableAppointments: template.moduleConfig.enable_appointments,
    enableMultiLocation: template.moduleConfig.enable_multi_location,
    config: template.moduleConfig.config ?? null,
  };
};

const createDefaultDeps = (baseDomain: string): RegistrationDeps => ({
  baseDomain,
  generateId: () => crypto.randomUUID(),
  runTransaction: (callback) => db.transaction(callback),
  signUpOwner: (input) =>
    auth.api.signUpEmail({
      body: {
        name: input.ownerName,
        email: input.ownerEmail,
        username: input.ownerUsername,
        password: input.ownerPassword,
      },
    }) as Promise<BetterAuthSignUpResult>,
  cleanupAuthUser: async (userId) => {
    await authDb.delete(session).where(eq(session.userId, userId));
    await authDb.delete(account).where(eq(account.userId, userId));
    await authDb.delete(authUser).where(eq(authUser.id, userId));
  },
  cleanupTenant: async (tenantId) => {
    const outletRows = await db
      .select({ id: outlets.id })
      .from(outlets)
      .where(eq(outlets.tenantId, tenantId));

    const outletIds = outletRows.map((outlet) => outlet.id);
    if (outletIds.length > 0) {
      await db.delete(userOutletAssignments).where(inArray(userOutletAssignments.outletId, outletIds));
    }

    await db.delete(tenantFeatures).where(eq(tenantFeatures.tenantId, tenantId));
    await db.delete(tenantModuleConfigs).where(eq(tenantModuleConfigs.tenantId, tenantId));
    await db.delete(outlets).where(eq(outlets.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  },
});

export async function registerTenantOwner(
  input: RegisterTenantOwnerInput,
  deps: RegistrationDeps = createDefaultDeps(process.env.BASE_DOMAIN || 'aurapos.my.id'),
): Promise<RegisteredTenantOwner> {
  const businessType = input.businessType ?? DEFAULT_BUSINESS_TYPE;
  let createdTenantId: string | null = null;
  let createdOwnerUserId: string | null = null;

  try {
    return await deps.runTransaction(async (tx) => {
      const tenantId = deps.generateId();
      const template = getBusinessTypeTemplate(businessType);

      const [tenant] = await tx
        .insert(tenants)
        .values({
          id: tenantId,
          name: input.businessName,
          slug: input.slug,
          businessName: input.businessName,
          businessType,
          settings: template.tenantDefaults.settings,
          planTier: template.tenantDefaults.plan_tier,
          subscriptionStatus: template.tenantDefaults.subscription_status,
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          timezone: input.timezone ?? 'Asia/Jakarta',
          currency: input.currency ?? 'IDR',
          locale: input.locale ?? 'id-ID',
          isActive: true,
        })
        .returning();

      createdTenantId = tenant.id;

      const [defaultOutlet] = await tx
        .insert(outlets)
        .values({
          tenantId: tenant.id,
          name: 'Cabang Utama',
          slug: 'main',
          isDefault: true,
          isActive: true,
        })
        .returning();

      await tx.insert(tenantModuleConfigs).values(toDbModuleConfig(tenant.id, businessType));

      const signUpResult = await deps.signUpOwner(input);
      const ownerUserId = signUpResult?.user?.id;
      if (!ownerUserId) {
        throw new RegistrationError('Failed to create owner account', 'OWNER_SIGNUP_FAILED', 400, signUpResult);
      }

      createdOwnerUserId = ownerUserId;

      await tx
        .update(authUser)
        .set({ tenantId: tenant.id, role: 'owner', updatedAt: new Date() })
        .where(eq(authUser.id, ownerUserId));

      await tx
        .insert(userOutletAssignments)
        .values({
          userId: ownerUserId,
          outletId: defaultOutlet.id,
          role: 'owner',
          isActive: true,
        })
        .onConflictDoUpdate({
          target: [userOutletAssignments.userId, userOutletAssignments.outletId],
          set: { role: 'owner', isActive: true, updatedAt: sql`CURRENT_TIMESTAMP` },
        });

      return {
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
          url: `https://${tenant.slug}.${deps.baseDomain}`,
        },
        ownerUserId,
        defaultOutletId: defaultOutlet.id,
      };
    });
  } catch (error) {
    if (createdOwnerUserId) {
      try {
        await deps.cleanupAuthUser(createdOwnerUserId);
      } catch (cleanupError) {
        console.error('[register] Failed to cleanup Better Auth user after registration failure:', cleanupError);
      }
    }

    if (createdTenantId) {
      try {
        await deps.cleanupTenant(createdTenantId);
      } catch (cleanupError) {
        console.error('[register] Failed to cleanup tenant resources after registration failure:', cleanupError);
      }
    }

    if (error instanceof RegistrationError) {
      throw error;
    }

    if (isSlugUniqueViolation(error)) {
      throw new RegistrationError('Slug already taken', 'DUPLICATE_SLUG', 409, error);
    }

    if (isDuplicateEmailError(error)) {
      throw new RegistrationError('Email sudah terdaftar', 'DUPLICATE_EMAIL', 409, error);
    }

    throw new RegistrationError('Internal server error', 'REGISTRATION_FAILED', 500, error);
  }
}
