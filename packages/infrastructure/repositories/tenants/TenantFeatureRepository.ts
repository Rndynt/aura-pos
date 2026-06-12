/**
 * Legacy tenant feature repository.
 *
 * Entitlement Phase 2 removed the old tenant feature table. This adapter remains
 * only as a compile-time compatibility boundary for older imports; active API
 * code must use `tenant_entitlements` through the entitlement engine instead.
 */

import { Database } from '../../database';
import type { TenantFeature } from '../../../domain/tenants/types';

type LegacyTenantFeatureInput = Partial<TenantFeature> & {
  tenantId?: string;
  featureCode?: string;
  source?: string;
  isActive?: boolean;
};

export interface ITenantFeatureRepository {
  findActiveByTenant(tenantId: string): Promise<TenantFeature[]>;
  findByTenantAndFeature(tenantId: string, featureCode: string): Promise<TenantFeature | null>;
  findByTenantId(tenantId: string): Promise<TenantFeature[]>;
  create(input: LegacyTenantFeatureInput): Promise<TenantFeature>;
  upsertByTenantAndFeature(input: LegacyTenantFeatureInput): Promise<TenantFeature>;
  update(id: string, input: LegacyTenantFeatureInput): Promise<TenantFeature>;
  deleteByTenantId(tenantId: string): Promise<void>;
}

function removed(): never {
  throw new Error('Legacy tenant feature persistence has been removed. Use entitlement engine and tenant_entitlements.');
}

export class TenantFeatureRepository implements ITenantFeatureRepository {
  constructor(private readonly _db: Database) {}

  async findActiveByTenant(_tenantId: string): Promise<TenantFeature[]> {
    return [];
  }

  async findByTenantAndFeature(_tenantId: string, _featureCode: string): Promise<TenantFeature | null> {
    return null;
  }

  async findByTenantId(_tenantId: string): Promise<TenantFeature[]> {
    return [];
  }

  async create(_input: LegacyTenantFeatureInput): Promise<TenantFeature> {
    removed();
  }

  async upsertByTenantAndFeature(_input: LegacyTenantFeatureInput): Promise<TenantFeature> {
    removed();
  }

  async update(_id: string, _input: LegacyTenantFeatureInput): Promise<TenantFeature> {
    removed();
  }

  async deleteByTenantId(_tenantId: string): Promise<void> {
    return undefined;
  }
}
