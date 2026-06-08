/**
 * Tenants Application Services
 * Public API for tenant feature management use cases
 */

export { CheckFeatureAccess } from './CheckFeatureAccess';
export type { 
  CheckFeatureAccessInput, 
  CheckFeatureAccessOutput,
  ITenantFeatureRepository as ITenantFeatureRepositoryForCheckAccess
} from './CheckFeatureAccess';

export { GetActiveFeaturesForTenant } from './GetActiveFeaturesForTenant';
export type { 
  GetActiveFeaturesForTenantInput, 
  GetActiveFeaturesForTenantOutput,
  ITenantFeatureRepository as ITenantFeatureRepositoryForGetActiveFeatures
} from './GetActiveFeaturesForTenant';

export { CreateTenant } from './CreateTenant';
export type {
  CreateTenantInput,
  CreateTenantOutput,
  ITenantRepository as ITenantRepositoryForCreateTenant,
  ITenantModuleConfigRepository as ITenantModuleConfigRepositoryForCreateTenant,
  ITenantFeatureRepository as ITenantFeatureRepositoryForCreateTenant,
  IOrderTypeRepository as IOrderTypeRepositoryForCreateTenant,
} from './CreateTenant';

export { GetTenantProfile } from './GetTenantProfile';
export type {
  GetTenantProfileInput,
  GetTenantProfileOutput,
  TenantProfileDTO,
  ITenantRepository as ITenantRepositoryForGetTenantProfile,
  ITenantFeatureRepository as ITenantFeatureRepositoryForGetTenantProfile,
  ITenantModuleConfigRepository as ITenantModuleConfigRepositoryForGetTenantProfile,
} from './GetTenantProfile';

export { 
  getBusinessTypeTemplate,
  BUSINESS_TYPE_TEMPLATES,
} from './businessTypeTemplates';
export type {
  BusinessTypeTemplate,
} from './businessTypeTemplates';
export type {
  FeatureEntitlementGrant,
  FeatureEntitlementPort,
  TenantDraft,
  TenantRepositoryPort,
} from './ports';
