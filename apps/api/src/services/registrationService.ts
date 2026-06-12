import { eq, inArray, sql } from 'drizzle-orm';
import type { BusinessType } from '@pos/core';
import {
  ENTITLEMENT_CATALOG,
  getBusinessTypeDefaultEntitlements,
  getPlanIncludedEntitlements,
} from '@pos/application/entitlements';
import { db } from '@pos/infrastructure/database';
import {
  orderTypes,
  outlets,
  productCategories,
  products,
  tenantOrderTypes,
  tenants,
  userOutletAssignments,
} from '@pos/infrastructure/db/schema';
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
  featureCodes: string[];
  orderTypeCodes: string[];
  catalogSeed: {
    categories: number;
    products: number;
  };
};

type BetterAuthSignUpResult = {
  user?: {
    id?: string | null;
  } | null;
};

export class RegistrationError extends Error {
  constructor(
    message: string,
    public readonly code: 'DUPLICATE_SLUG' | 'DUPLICATE_EMAIL' | 'OWNER_SIGNUP_FAILED' | 'REGISTRATION_FAILED' | 'TEMPLATE_PLAN_MISMATCH',
    public readonly status: number,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'RegistrationError';
  }
}

/**
 * BILLING SAFETY: New tenants always start on the free plan regardless of
 * what the business-type template specifies. Only the billing/admin system
 * may upgrade a tenant to a paid tier after payment is confirmed.
 */
const DEFAULT_ONBOARDING_PLAN_TIER = 'starter' as const;

type RegistrationDeps = {
  baseDomain: string;
  generateId: () => string;
  runTransaction: <T>(callback: (tx: any) => Promise<T>) => Promise<T>;
  signUpOwner: (input: RegisterTenantOwnerInput) => Promise<BetterAuthSignUpResult>;
  /** Link the Better Auth user row to a tenant. Runs outside the transaction (authDb pool). */
  linkOwnerToTenant: (userId: string, tenantId: string) => Promise<void>;
  cleanupAuthUser: (userId: string) => Promise<void>;
  cleanupTenant: (tenantId: string) => Promise<void>;
};

const DEFAULT_BUSINESS_TYPE: BusinessType = 'CAFE_RESTAURANT';

type CatalogSeedProduct = {
  name: string;
  basePrice: string;
  description?: string;
};

type CatalogSeedCategory = {
  name: string;
  displayOrder: number;
  products: CatalogSeedProduct[];
};

const DEFAULT_CATALOG_SEEDS: Record<BusinessType, CatalogSeedCategory[]> = {
  CAFE_RESTAURANT: [
    {
      name: 'Makanan',
      displayOrder: 1,
      products: [
        { name: 'Nasi Goreng', basePrice: '15000' },
        { name: 'Mie Goreng', basePrice: '13000' },
        { name: 'Gado-Gado', basePrice: '14000' },
      ],
    },
    {
      name: 'Minuman',
      displayOrder: 2,
      products: [
        { name: 'Es Teh Manis', basePrice: '5000' },
        { name: 'Es Jeruk', basePrice: '7000' },
        { name: 'Kopi Tubruk', basePrice: '8000' },
      ],
    },
  ],
  RETAIL_MINIMARKET: [
    {
      name: 'Sembako',
      displayOrder: 1,
      products: [
        { name: 'Beras 5kg', basePrice: '68000' },
        { name: 'Gula Pasir 1kg', basePrice: '17000' },
        { name: 'Minyak Goreng 1L', basePrice: '19000' },
      ],
    },
    {
      name: 'Minuman',
      displayOrder: 2,
      products: [
        { name: 'Air Mineral 600ml', basePrice: '4000' },
        { name: 'Teh Botol', basePrice: '6000' },
      ],
    },
  ],
  LAUNDRY: [
    {
      name: 'Laundry Kiloan',
      displayOrder: 1,
      products: [
        { name: 'Cuci Kering per Kg', basePrice: '7000' },
        { name: 'Cuci Setrika per Kg', basePrice: '10000' },
        { name: 'Setrika Saja per Kg', basePrice: '6000' },
      ],
    },
    {
      name: 'Laundry Satuan',
      displayOrder: 2,
      products: [
        { name: 'Cuci Sepatu', basePrice: '25000' },
        { name: 'Bed Cover', basePrice: '35000' },
      ],
    },
  ],
  SERVICE_APPOINTMENT: [
    {
      name: 'Layanan',
      displayOrder: 1,
      products: [
        { name: 'Konsultasi', basePrice: '50000' },
        { name: 'Perawatan Standar', basePrice: '75000' },
        { name: 'Paket Premium', basePrice: '150000' },
      ],
    },
  ],
  DIGITAL_PPOB: [
    {
      name: 'Pulsa & Data',
      displayOrder: 1,
      products: [
        { name: 'Pulsa 25.000', basePrice: '27000' },
        { name: 'Paket Data 5GB', basePrice: '45000' },
      ],
    },
    {
      name: 'Tagihan',
      displayOrder: 2,
      products: [
        { name: 'Token PLN 50.000', basePrice: '52000' },
        { name: 'Admin BPJS', basePrice: '2500' },
      ],
    },
  ],
};

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
  linkOwnerToTenant: async (userId, tenantId) => {
    await authDb
      .update(authUser)
      .set({ tenantId, role: 'owner', updatedAt: new Date() })
      .where(eq(authUser.id, userId));
  },
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
      const businessTypeDefaults = ENTITLEMENT_CATALOG.businessTypes[businessType];
      const defaultPlan = businessTypeDefaults.defaultPlan ?? DEFAULT_ONBOARDING_PLAN_TIER;

      const [tenant] = await tx
        .insert(tenants)
        .values({
          id: tenantId,
          name: input.businessName,
          slug: input.slug,
          businessName: input.businessName,
          businessType,
          settings: businessTypeDefaults.settings,
          planTier: defaultPlan,
          subscriptionStatus: 'active',
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

      const featureCodes = [...new Set([
        ...getPlanIncludedEntitlements(defaultPlan),
        ...getBusinessTypeDefaultEntitlements(businessType),
      ])];

      const orderTypeRows = businessTypeDefaults.orderTypes.length > 0
        ? await tx
            .select({ id: orderTypes.id, code: orderTypes.code })
            .from(orderTypes)
            .where(inArray(orderTypes.code, [...businessTypeDefaults.orderTypes]))
        : [];
      const foundOrderTypeCodes = new Set(orderTypeRows.map((orderType: { code: string }) => orderType.code));
      const missingOrderTypes = businessTypeDefaults.orderTypes.filter((code) => !foundOrderTypeCodes.has(code));
      if (missingOrderTypes.length > 0) {
        throw new RegistrationError(
          `Required order types are not seeded: ${missingOrderTypes.join(', ')}`,
          'REGISTRATION_FAILED',
          500,
          { missingOrderTypes },
        );
      }

      if (orderTypeRows.length > 0) {
        await tx.insert(tenantOrderTypes).values(
          orderTypeRows.map((orderType: { id: string }) => ({
            tenantId: tenant.id,
            orderTypeId: orderType.id,
            outletId: null,
            isEnabled: true,
          })),
        );
      }

      let seededCategoryCount = 0;
      let seededProductCount = 0;
      for (const categorySeed of DEFAULT_CATALOG_SEEDS[businessType]) {
        const [category] = await tx
          .insert(productCategories)
          .values({
            tenantId: tenant.id,
            name: categorySeed.name,
            displayOrder: categorySeed.displayOrder,
            isActive: true,
          })
          .returning();
        seededCategoryCount += 1;

        await tx.insert(products).values(
          categorySeed.products.map((productSeed, index) => ({
            tenantId: tenant.id,
            categoryId: category.id,
            category: category.name,
            name: productSeed.name,
            description: productSeed.description,
            basePrice: productSeed.basePrice,
            hasVariants: false,
            stockTrackingEnabled: false,
            isActive: true,
            metadata: { seededBy: 'registration', displayOrder: index },
          })),
        );
        seededProductCount += categorySeed.products.length;
      }

      const signUpResult = await deps.signUpOwner(input);
      const ownerUserId = signUpResult?.user?.id;
      if (!ownerUserId) {
        throw new RegistrationError('Failed to create owner account', 'OWNER_SIGNUP_FAILED', 400, signUpResult);
      }

      createdOwnerUserId = ownerUserId;

      // Better Auth creates the user outside the transaction scope (uses shared pool connection).
      // Use deps.linkOwnerToTenant so tests can mock this call without needing a real DB.
      await deps.linkOwnerToTenant(ownerUserId, tenant.id);

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
        featureCodes,
        orderTypeCodes: [...businessTypeDefaults.orderTypes],
        catalogSeed: {
          categories: seededCategoryCount,
          products: seededProductCount,
        },
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
