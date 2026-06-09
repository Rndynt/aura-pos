/**
 * Tenant Repository
 * Handles tenant CRUD operations
 */

import { Database } from '../../database';
import { BaseRepository } from '../BaseRepository';
import {
  tenants,
  type Tenant,
  type InsertTenant,
} from '@pos/infrastructure/db/schema';
import type { Tenant as DomainTenant } from '@pos/domain/tenants/types';
import { eq } from 'drizzle-orm';

/**
 * Map database tenant to domain tenant (camelCase -> snake_case)
 */
function mapTenantToDomain(dbTenant: Tenant): DomainTenant {
  return {
    id: dbTenant.id,
    name: dbTenant.name,
    slug: dbTenant.slug,
    business_name: dbTenant.businessName || undefined,
    business_address: dbTenant.businessAddress || undefined,
    business_phone: dbTenant.businessPhone || undefined,
    business_email: dbTenant.businessEmail || undefined,
    business_type: dbTenant.businessType as import('@pos/core').BusinessType,
    settings: dbTenant.settings || null,
    plan_tier: (dbTenant.planTier === 'free' ? 'starter' : dbTenant.planTier) as 'starter' | 'growth' | 'pro',
    subscription_status: dbTenant.subscriptionStatus as 'active' | 'trial' | 'suspended' | 'cancelled',
    trial_ends_at: dbTenant.trialEndsAt || undefined,
    timezone: dbTenant.timezone,
    currency: dbTenant.currency,
    locale: dbTenant.locale,
    is_active: dbTenant.isActive,
    created_at: dbTenant.createdAt,
    updated_at: dbTenant.updatedAt,
  };
}

/**
 * Input type for creating a new tenant
 * Maps snake_case domain type to database requirements
 */
export type CreateTenantInput = {
  name: string;
  slug: string;
  business_name?: string;
  business_address?: string;
  business_phone?: string;
  business_email?: string;
  business_type: import('@pos/core').BusinessType;
  settings?: Record<string, any> | null;
  plan_tier: 'starter' | 'growth' | 'pro';
  subscription_status: 'active' | 'trial' | 'suspended' | 'cancelled';
  trial_ends_at?: Date;
  timezone?: string;
  currency?: string;
  locale?: string;
  is_active?: boolean;
};

/**
 * Map domain CreateTenantInput to database InsertTenant
 */
function mapCreateTenantToDb(input: CreateTenantInput): InsertTenant {
  return {
    name: input.name,
    slug: input.slug,
    businessName: input.business_name,
    businessAddress: input.business_address,
    businessPhone: input.business_phone,
    businessEmail: input.business_email,
    businessType: input.business_type,
    settings: input.settings || null,
    planTier: input.plan_tier,
    subscriptionStatus: input.subscription_status,
    trialEndsAt: input.trial_ends_at,
    timezone: input.timezone || 'UTC',
    currency: input.currency || 'USD',
    locale: input.locale || 'en-US',
    isActive: input.is_active !== undefined ? input.is_active : true,
  };
}

export interface ITenantRepository {
  findById(id: string): Promise<DomainTenant | null>;
  findBySlug(slug: string): Promise<DomainTenant | null>;
  create(input: CreateTenantInput): Promise<DomainTenant>;
  delete(tenantId: string): Promise<void>;
}

export class TenantRepository
  extends BaseRepository<Tenant, InsertTenant>
  implements ITenantRepository
{
  protected table = tenants;
  protected entityName = 'Tenant';

  constructor(db: Database) {
    super(db);
  }

  /**
   * Find tenant by ID
   */
  async findById(id: string): Promise<DomainTenant | null> {
    try {
      const result = await this.db
        .select()
        .from(tenants)
        .where(eq(tenants.id, id))
        .limit(1);

      return result[0] ? mapTenantToDomain(result[0]) : null;
    } catch (error) {
      this.handleError('find tenant by id', error);
    }
  }

  /**
   * Find tenant by slug
   */
  async findBySlug(slug: string): Promise<DomainTenant | null> {
    try {
      const result = await this.db
        .select()
        .from(tenants)
        .where(eq(tenants.slug, slug))
        .limit(1);

      return result[0] ? mapTenantToDomain(result[0]) : null;
    } catch (error) {
      this.handleError('find tenant by slug', error);
    }
  }

  /**
   * Create a new tenant
   */
  async create(input: CreateTenantInput): Promise<DomainTenant> {
    try {
      const dbInput = mapCreateTenantToDb(input);
      
      const result = await this.db
        .insert(tenants)
        .values(dbInput)
        .returning();

      if (!result || result.length === 0) {
        throw new Error('Failed to create tenant - no result returned');
      }

      return mapTenantToDomain(result[0]);
    } catch (error) {
      this.handleError('create tenant', error);
    }
  }

  /**
   * Delete a tenant by ID
   * Used for rollback in case of tenant creation failure
   */
  async delete(tenantId: string): Promise<void> {
    try {
      await this.db
        .delete(tenants)
        .where(eq(tenants.id, tenantId));
    } catch (error) {
      this.handleError('delete tenant', error);
    }
  }
}
