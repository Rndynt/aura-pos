/**
 * CreateTenant Use Case
 * Creates a new tenant with business type defaults
 */

import type { BusinessType } from '@pos/core';
import type { Tenant, TenantFeature, TenantModuleConfig } from '@pos/domain/tenants/types';
import { getBusinessTypeTemplate } from './businessTypeTemplates';

/**
 * Tenant profile DTO combining all tenant-related data
 */
export interface TenantProfileDTO {
  tenant: Tenant;
  features: TenantFeature[];
  moduleConfig: TenantModuleConfig;
}

/**
 * Repository input types (internal)
 */
type RepositoryCreateTenantInput = {
  name: string;
  slug: string;
  business_name?: string;
  business_address?: string;
  business_phone?: string;
  business_email?: string;
  business_type: BusinessType;
  settings?: Record<string, any> | null;
  plan_tier: 'starter' | 'growth' | 'pro';
  subscription_status: 'active' | 'trial' | 'suspended' | 'cancelled';
  trial_ends_at?: Date;
  timezone?: string;
  currency?: string;
  locale?: string;
  is_active?: boolean;
};

type RepositoryCreateModuleConfigInput = {
  tenant_id: string;
  enable_table_management: boolean;
  enable_kitchen_ticket: boolean;
  enable_loyalty: boolean;
  enable_delivery: boolean;
  enable_inventory: boolean;
  enable_inventory_advanced: boolean;
  enable_appointments: boolean;
  enable_multi_location: boolean;
  config?: Record<string, any>;
};

type RepositoryCreateFeatureInput = {
  tenantId: string;
  featureCode: string;
  activatedAt: Date;
  expiresAt?: Date | null;
  source: 'plan_default' | 'purchase' | 'manual_grant' | 'trial';
  isActive: boolean;
};

/**
 * Repository interfaces
 */
export interface ITenantRepository {
  findBySlug(slug: string): Promise<Tenant | null>;
  create(input: RepositoryCreateTenantInput): Promise<Tenant>;
  delete(tenantId: string): Promise<void>;
}

export interface ITenantModuleConfigRepository {
  create(config: RepositoryCreateModuleConfigInput): Promise<TenantModuleConfig>;
  delete(tenantId: string): Promise<void>;
}

export interface ITenantFeatureRepository {
  create(feature: RepositoryCreateFeatureInput): Promise<TenantFeature>;
  deleteByTenantId(tenantId: string): Promise<void>;
}

export interface IOrderTypeRepository {
  findByCode(code: string): Promise<{ id: string } | null>;
  enableForTenant(tenantId: string, orderTypeId: string, config?: Record<string, any>): Promise<any>;
  disableAllForTenant(tenantId: string): Promise<void>;
}

/**
 * Use case input
 */
export interface CreateTenantInput {
  business_type: BusinessType;
  name: string;
  slug: string;
  business_name?: string;
  business_address?: string;
  business_phone?: string;
  business_email?: string;
  timezone?: string;
  currency?: string;
  locale?: string;
}

/**
 * Use case output
 */
export interface CreateTenantOutput {
  profile: TenantProfileDTO;
}

/**
 * CreateTenant Use Case
 * Orchestrates tenant creation with all default configurations
 */
export class CreateTenant {
  constructor(
    private readonly tenantRepository: ITenantRepository,
    private readonly tenantModuleConfigRepository: ITenantModuleConfigRepository,
    private readonly tenantFeatureRepository: ITenantFeatureRepository,
    private readonly orderTypeRepository: IOrderTypeRepository
  ) {}

  async execute(input: CreateTenantInput): Promise<CreateTenantOutput> {
    let createdTenant: Tenant | null = null;
    let moduleConfigCreated = false;
    let featuresCreated = false;
    let orderTypesEnabled = false;

    try {
      // Step 1: Validate input
      this.validateInput(input);

      // Step 2: Check slug uniqueness
      const existingTenant = await this.tenantRepository.findBySlug(input.slug);
      if (existingTenant) {
        throw new Error(`Tenant with slug '${input.slug}' already exists`);
      }

      // Step 3: Resolve business type template
      const template = getBusinessTypeTemplate(input.business_type);

      // Step 4: CRITICAL - Validate all required order types exist BEFORE creating anything
      console.log(`[CreateTenant] Validating order types for business type: ${input.business_type}`);
      await this.validateOrderTypesExist(template.orderTypes);
      console.log(`[CreateTenant] All order types validated successfully: ${template.orderTypes.join(', ')}`);

      // Step 5: Create tenant with template defaults
      console.log(`[CreateTenant] Creating tenant with slug: ${input.slug}`);
      createdTenant = await this.tenantRepository.create({
        name: input.name,
        slug: input.slug,
        business_name: input.business_name,
        business_address: input.business_address,
        business_phone: input.business_phone,
        business_email: input.business_email,
        business_type: input.business_type,
        settings: template.tenantDefaults.settings,
        plan_tier: template.tenantDefaults.plan_tier,
        subscription_status: template.tenantDefaults.subscription_status,
        trial_ends_at: this.calculateTrialEndDate(),
        timezone: input.timezone || 'UTC',
        currency: input.currency || 'USD',
        locale: input.locale || 'en-US',
        is_active: true,
      });
      console.log(`[CreateTenant] Tenant created successfully with ID: ${createdTenant.id}`);

      // Step 6: Create tenant module configuration
      console.log(`[CreateTenant] Creating module configuration for tenant: ${createdTenant.id}`);
      const createdModuleConfig = await this.tenantModuleConfigRepository.create({
        tenant_id: createdTenant.id,
        enable_table_management: template.moduleConfig.enable_table_management,
        enable_kitchen_ticket: template.moduleConfig.enable_kitchen_ticket,
        enable_loyalty: template.moduleConfig.enable_loyalty,
        enable_delivery: template.moduleConfig.enable_delivery,
        enable_inventory: template.moduleConfig.enable_inventory,
        enable_inventory_advanced: template.moduleConfig.enable_inventory_advanced,
        enable_appointments: template.moduleConfig.enable_appointments,
        enable_multi_location: template.moduleConfig.enable_multi_location,
        config: template.moduleConfig.config,
      });
      moduleConfigCreated = true;
      console.log(`[CreateTenant] Module configuration created successfully`);

      // Step 7: Create tenant features
      console.log(`[CreateTenant] Creating ${template.features.length} features for tenant: ${createdTenant.id}`);
      const now = new Date();
      const createdFeatures: TenantFeature[] = [];
      for (const featureTemplate of template.features) {
        const createdFeature = await this.tenantFeatureRepository.create({
          tenantId: createdTenant.id,
          featureCode: featureTemplate.feature_code,
          activatedAt: now,
          expiresAt: null,
          source: featureTemplate.source,
          isActive: featureTemplate.is_active,
        });
        createdFeatures.push(createdFeature);
      }
      featuresCreated = true;
      console.log(`[CreateTenant] All features created successfully`);

      // Step 8: Enable order types for tenant (already validated to exist)
      console.log(`[CreateTenant] Enabling ${template.orderTypes.length} order types for tenant: ${createdTenant.id}`);
      for (const orderTypeCode of template.orderTypes) {
        const orderType = await this.orderTypeRepository.findByCode(orderTypeCode);
        if (orderType) {
          await this.orderTypeRepository.enableForTenant(createdTenant.id, orderType.id);
          console.log(`[CreateTenant] Order type '${orderTypeCode}' enabled for tenant`);
        }
      }
      orderTypesEnabled = true;
      console.log(`[CreateTenant] All order types enabled successfully`);

      // Step 9: Return complete profile with REAL persisted data
      console.log(`[CreateTenant] Tenant creation completed successfully: ${createdTenant.id}`);
      return {
        profile: {
          tenant: createdTenant,
          features: createdFeatures,
          moduleConfig: createdModuleConfig,
        },
      };
    } catch (error) {
      // CRITICAL: Comprehensive rollback mechanism
      console.error('[CreateTenant] Error occurred during tenant creation, initiating rollback');
      console.error('[CreateTenant] Error details:', error);
      
      if (createdTenant) {
        await this.rollbackTenantCreation(createdTenant.id, {
          moduleConfigCreated,
          featuresCreated,
          orderTypesEnabled,
        });
      }

      // Preserve stack trace and context
      if (error instanceof Error) {
        const detailedError = new Error(
          `Failed to create tenant '${input.slug}': ${error.message}\n` +
          `Stack trace: ${error.stack || 'No stack trace available'}`
        );
        detailedError.stack = error.stack;
        throw detailedError;
      }
      
      throw new Error(
        `Failed to create tenant '${input.slug}': Unknown error occurred. ` +
        `Please check logs for details.`
      );
    }
  }

  /**
   * Validate input data
   */
  private validateInput(input: CreateTenantInput): void {
    if (!input.name || input.name.trim().length === 0) {
      throw new Error('Tenant name is required');
    }

    if (!input.slug || input.slug.trim().length === 0) {
      throw new Error('Tenant slug is required');
    }

    if (!input.business_type) {
      throw new Error('Business type is required');
    }

    // Validate slug format (alphanumeric and hyphens only)
    const slugRegex = /^[a-z0-9-]+$/;
    if (!slugRegex.test(input.slug)) {
      throw new Error('Slug must contain only lowercase letters, numbers, and hyphens');
    }
  }

  /**
   * Calculate trial end date (14 days from now)
   */
  private calculateTrialEndDate(): Date {
    const trialDays = 14;
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + trialDays);
    return trialEnd;
  }

  /**
   * Validate that all required order types exist in the database
   * This is called BEFORE creating any tenant resources to ensure atomicity
   * @throws Error if any order type is missing from the database
   */
  private async validateOrderTypesExist(orderTypeCodes: string[]): Promise<void> {
    const missingOrderTypes: string[] = [];
    const validatedOrderTypes: Array<{ code: string; id: string }> = [];

    for (const orderTypeCode of orderTypeCodes) {
      const orderType = await this.orderTypeRepository.findByCode(orderTypeCode);
      if (!orderType) {
        missingOrderTypes.push(orderTypeCode);
      } else {
        validatedOrderTypes.push({ code: orderTypeCode, id: orderType.id });
      }
    }

    if (missingOrderTypes.length > 0) {
      throw new Error(
        `Cannot create tenant: The following required order types do not exist in the database: ` +
        `${missingOrderTypes.join(', ')}. ` +
        `Please ensure all order types are seeded in the database before creating tenants. ` +
        `Expected order types: ${orderTypeCodes.join(', ')}`
      );
    }
  }

  /**
   * Rollback tenant creation by deleting all created resources
   * Implements compensating transactions to ensure atomicity
   * This method attempts to clean up even if some operations fail
   */
  private async rollbackTenantCreation(
    tenantId: string,
    creationStatus: {
      moduleConfigCreated: boolean;
      featuresCreated: boolean;
      orderTypesEnabled: boolean;
    }
  ): Promise<void> {
    console.log(`[CreateTenant] Starting rollback for tenant: ${tenantId}`);
    console.log(`[CreateTenant] Rollback status:`, creationStatus);

    const rollbackErrors: string[] = [];

    try {
      // Step 1: Disable all order types (if enabled)
      if (creationStatus.orderTypesEnabled) {
        try {
          console.log(`[CreateTenant] Rolling back order types for tenant: ${tenantId}`);
          await this.orderTypeRepository.disableAllForTenant(tenantId);
          console.log(`[CreateTenant] Order types rollback completed`);
        } catch (error) {
          const errorMsg = `Failed to rollback order types: ${error instanceof Error ? error.message : 'Unknown error'}`;
          console.error(`[CreateTenant] ${errorMsg}`);
          rollbackErrors.push(errorMsg);
        }
      }

      // Step 2: Delete all features (if created)
      if (creationStatus.featuresCreated) {
        try {
          console.log(`[CreateTenant] Rolling back features for tenant: ${tenantId}`);
          await this.tenantFeatureRepository.deleteByTenantId(tenantId);
          console.log(`[CreateTenant] Features rollback completed`);
        } catch (error) {
          const errorMsg = `Failed to rollback features: ${error instanceof Error ? error.message : 'Unknown error'}`;
          console.error(`[CreateTenant] ${errorMsg}`);
          rollbackErrors.push(errorMsg);
        }
      }

      // Step 3: Delete module configuration (if created)
      if (creationStatus.moduleConfigCreated) {
        try {
          console.log(`[CreateTenant] Rolling back module config for tenant: ${tenantId}`);
          await this.tenantModuleConfigRepository.delete(tenantId);
          console.log(`[CreateTenant] Module config rollback completed`);
        } catch (error) {
          const errorMsg = `Failed to rollback module config: ${error instanceof Error ? error.message : 'Unknown error'}`;
          console.error(`[CreateTenant] ${errorMsg}`);
          rollbackErrors.push(errorMsg);
        }
      }

      // Step 4: Delete tenant (always attempt this as last step)
      try {
        console.log(`[CreateTenant] Rolling back tenant: ${tenantId}`);
        await this.tenantRepository.delete(tenantId);
        console.log(`[CreateTenant] Tenant rollback completed`);
      } catch (error) {
        const errorMsg = `Failed to rollback tenant: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(`[CreateTenant] ${errorMsg}`);
        rollbackErrors.push(errorMsg);
      }

      if (rollbackErrors.length > 0) {
        console.error(
          `[CreateTenant] Rollback completed with ${rollbackErrors.length} error(s). ` +
          `Manual cleanup may be required for tenant: ${tenantId}`
        );
        console.error(`[CreateTenant] Rollback errors:`, rollbackErrors);
      } else {
        console.log(`[CreateTenant] Rollback completed successfully for tenant: ${tenantId}`);
      }
    } catch (error) {
      console.error(
        `[CreateTenant] Critical error during rollback for tenant ${tenantId}:`,
        error
      );
      console.error(
        `[CreateTenant] Manual database cleanup required for tenant: ${tenantId}`
      );
    }
  }
}
