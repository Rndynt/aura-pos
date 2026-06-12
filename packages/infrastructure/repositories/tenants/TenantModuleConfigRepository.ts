/**
 * Legacy tenant module config repository.
 *
 * Entitlement Phase 2 removed module-config persistence. Active code should read
 * effective commercial access from the entitlement engine.
 */

import { Database } from '../../database';
import type { TenantModuleConfig } from '@pos/domain/tenants/types';

export type CreateTenantModuleConfig = Omit<TenantModuleConfig, 'updated_at'>;

export interface ITenantModuleConfigRepository {
  findByTenantId(tenantId: string): Promise<TenantModuleConfig | null>;
  create(config: CreateTenantModuleConfig): Promise<TenantModuleConfig>;
  update(tenantId: string, config: Partial<TenantModuleConfig>): Promise<TenantModuleConfig>;
  delete(tenantId: string): Promise<void>;
}

function removed(): never {
  throw new Error('Legacy tenant module config persistence has been removed. Use entitlement engine and tenant_entitlements.');
}

export class TenantModuleConfigRepository implements ITenantModuleConfigRepository {
  constructor(private readonly _db: Database) {}

  async findByTenantId(_tenantId: string): Promise<TenantModuleConfig | null> {
    return null;
  }

  async create(_config: CreateTenantModuleConfig): Promise<TenantModuleConfig> {
    removed();
  }

  async update(_tenantId: string, _config: Partial<TenantModuleConfig>): Promise<TenantModuleConfig> {
    removed();
  }

  async delete(_tenantId: string): Promise<void> {
    return undefined;
  }
}
