/**
 * Tenant Module Config Repository
 * Handles tenant module configuration CRUD operations
 */

import { Database } from '../../database';
import { BaseRepository, RepositoryError } from '../BaseRepository';
import {
  tenantModuleConfigs,
  type TenantModuleConfig as DBTenantModuleConfig,
  type InsertTenantModuleConfig,
} from '../../../../shared/schema';
import type { TenantModuleConfig } from '@pos/domain/tenants/types';
import { eq } from 'drizzle-orm';

/**
 * Map database TenantModuleConfig to domain TenantModuleConfig (camelCase -> snake_case)
 */
function mapTenantModuleConfigToDomain(dbConfig: DBTenantModuleConfig): TenantModuleConfig {
  return {
    tenant_id: dbConfig.tenantId,
    enable_table_management: dbConfig.enableTableManagement,
    enable_kitchen_ticket: dbConfig.enableKitchenTicket,
    enable_loyalty: dbConfig.enableLoyalty,
    enable_delivery: dbConfig.enableDelivery,
    enable_inventory: dbConfig.enableInventory,
    enable_inventory_advanced: dbConfig.enableInventoryAdvanced,
    enable_appointments: dbConfig.enableAppointments,
    enable_multi_location: dbConfig.enableMultiLocation,
    config: dbConfig.config || undefined,
    updated_at: dbConfig.updatedAt,
  };
}

/**
 * Map domain TenantModuleConfig for creation to database InsertTenantModuleConfig
 * All required fields must be present
 */
function mapCreateTenantModuleConfigToDb(domainConfig: CreateTenantModuleConfig): InsertTenantModuleConfig {
  return {
    tenantId: domainConfig.tenant_id,
    enableTableManagement: domainConfig.enable_table_management,
    enableKitchenTicket: domainConfig.enable_kitchen_ticket,
    enableLoyalty: domainConfig.enable_loyalty,
    enableDelivery: domainConfig.enable_delivery,
    enableInventory: domainConfig.enable_inventory,
    enableInventoryAdvanced: domainConfig.enable_inventory_advanced,
    enableAppointments: domainConfig.enable_appointments,
    enableMultiLocation: domainConfig.enable_multi_location,
    config: domainConfig.config || undefined,
  };
}

/**
 * Map partial domain TenantModuleConfig to database for updates (snake_case -> camelCase)
 */
function mapUpdateTenantModuleConfigToDb(domainConfig: Partial<TenantModuleConfig>): Partial<InsertTenantModuleConfig> {
  const dbConfig: Partial<InsertTenantModuleConfig> = {};
  
  if (domainConfig.tenant_id !== undefined) dbConfig.tenantId = domainConfig.tenant_id;
  if (domainConfig.enable_table_management !== undefined) dbConfig.enableTableManagement = domainConfig.enable_table_management;
  if (domainConfig.enable_kitchen_ticket !== undefined) dbConfig.enableKitchenTicket = domainConfig.enable_kitchen_ticket;
  if (domainConfig.enable_loyalty !== undefined) dbConfig.enableLoyalty = domainConfig.enable_loyalty;
  if (domainConfig.enable_delivery !== undefined) dbConfig.enableDelivery = domainConfig.enable_delivery;
  if (domainConfig.enable_inventory !== undefined) dbConfig.enableInventory = domainConfig.enable_inventory;
  if (domainConfig.enable_inventory_advanced !== undefined) dbConfig.enableInventoryAdvanced = domainConfig.enable_inventory_advanced;
  if (domainConfig.enable_appointments !== undefined) dbConfig.enableAppointments = domainConfig.enable_appointments;
  if (domainConfig.enable_multi_location !== undefined) dbConfig.enableMultiLocation = domainConfig.enable_multi_location;
  if (domainConfig.config !== undefined) dbConfig.config = domainConfig.config === null ? undefined : domainConfig.config;
  
  return dbConfig;
}

/**
 * Input type for creating a new tenant module config
 * Excludes DB-generated fields (updated_at)
 */
export type CreateTenantModuleConfig = Omit<TenantModuleConfig, 'updated_at'>;

export interface ITenantModuleConfigRepository {
  findByTenantId(tenantId: string): Promise<TenantModuleConfig | null>;
  create(config: CreateTenantModuleConfig): Promise<TenantModuleConfig>;
  update(tenantId: string, config: Partial<TenantModuleConfig>): Promise<TenantModuleConfig>;
  delete(tenantId: string): Promise<void>;
}

export class TenantModuleConfigRepository
  extends BaseRepository<DBTenantModuleConfig, InsertTenantModuleConfig>
  implements ITenantModuleConfigRepository
{
  protected table = tenantModuleConfigs;
  protected entityName = 'TenantModuleConfig';

  constructor(db: Database) {
    super(db);
  }

  /**
   * Find module configuration by tenant ID
   */
  async findByTenantId(tenantId: string): Promise<TenantModuleConfig | null> {
    try {
      const result = await this.db
        .select()
        .from(tenantModuleConfigs)
        .where(eq(tenantModuleConfigs.tenantId, tenantId))
        .limit(1);

      return result[0] ? mapTenantModuleConfigToDomain(result[0]) : null;
    } catch (error) {
      this.handleError('find module config by tenant id', error);
    }
  }

  /**
   * Create a new tenant module configuration
   */
  async create(config: CreateTenantModuleConfig): Promise<TenantModuleConfig> {
    try {
      const dbConfig = mapCreateTenantModuleConfigToDb(config);
      
      const result = await this.db
        .insert(tenantModuleConfigs)
        .values(dbConfig)
        .returning();
      
      return mapTenantModuleConfigToDomain(result[0]);
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      this.handleError('create tenant module config', error);
    }
  }

  /**
   * Update an existing tenant module configuration
   */
  async update(
    tenantId: string,
    config: Partial<TenantModuleConfig>
  ): Promise<TenantModuleConfig> {
    try {
      const dbConfig = mapUpdateTenantModuleConfigToDb(config);
      const result = await this.db
        .update(tenantModuleConfigs)
        .set({ ...dbConfig, updatedAt: new Date() })
        .where(eq(tenantModuleConfigs.tenantId, tenantId))
        .returning();

      if (!result || result.length === 0) {
        throw new RepositoryError('Tenant module config not found', 'NOT_FOUND', null);
      }

      return mapTenantModuleConfigToDomain(result[0]);
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      this.handleError('update tenant module config', error);
    }
  }

  /**
   * Delete tenant module configuration by tenant ID
   * Used for rollback in case of tenant creation failure
   */
  async delete(tenantId: string): Promise<void> {
    try {
      await this.db
        .delete(tenantModuleConfigs)
        .where(eq(tenantModuleConfigs.tenantId, tenantId));
    } catch (error) {
      this.handleError('delete tenant module config', error);
    }
  }
}
