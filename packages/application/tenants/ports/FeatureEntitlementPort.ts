import type { FeatureCheck, FeatureCode, TenantFeature } from '@pos/domain/tenants/types';
import type { TransactionContext } from '../../shared/ports/UnitOfWorkPort';

export interface FeatureEntitlementGrant {
  tenant_id: string;
  feature_code: FeatureCode | string;
  activated_at?: Date;
  expires_at?: Date | null;
  source: TenantFeature['source'];
  is_active?: boolean;
  config?: Record<string, unknown> | null;
}

export interface FeatureEntitlementPort {
  findActiveByTenant(tenantId: string, context?: TransactionContext): Promise<TenantFeature[]>;
  findByTenantAndFeature(tenantId: string, featureCode: FeatureCode | string, context?: TransactionContext): Promise<TenantFeature | null>;
  checkFeatureAccess(tenantId: string, featureCode: FeatureCode | string, context?: TransactionContext): Promise<FeatureCheck>;
  grantFeature(grant: FeatureEntitlementGrant, context?: TransactionContext): Promise<TenantFeature>;
  revokeFeature(tenantId: string, featureCode: FeatureCode | string, context?: TransactionContext): Promise<void>;
}
