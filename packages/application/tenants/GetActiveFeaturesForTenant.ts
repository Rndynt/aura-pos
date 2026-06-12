/**
 * GetActiveFeaturesForTenant Use Case
 * Retrieves all active features for a tenant, filtered by expiry date
 */

import type { TenantFeature, FeatureCheck } from '@pos/domain/tenants/types';

export interface ITenantFeatureRepository {
  findByTenantId(tenantId: string): Promise<TenantFeature[]>;
}

export interface GetActiveFeaturesForTenantInput {
  tenant_id: string;
}

export interface GetActiveFeaturesForTenantOutput {
  features: FeatureCheck[];
  total: number;
}

export class GetActiveFeaturesForTenant {
  constructor(private readonly tenantFeatureRepository: ITenantFeatureRepository) {}

  async execute(input: GetActiveFeaturesForTenantInput): Promise<GetActiveFeaturesForTenantOutput> {
    try {
      const featureRows = await this.tenantFeatureRepository.findByTenantId(input.tenant_id);

      const now = new Date();
      const activeFeatures: FeatureCheck[] = [];

      for (const feature of featureRows) {
        if (!feature.is_active) {
          continue;
        }

        if (feature.expires_at && feature.expires_at < now) {
          continue;
        }

        activeFeatures.push({
          enabled: true,
          feature_code: feature.feature_code,
          reason: 'Feature is active',
          expires_at: feature.expires_at ?? null,
          config: feature.config,
        });
      }

      return {
        features: activeFeatures,
        total: activeFeatures.length,
      };
    } catch (error) {
      throw new Error(`Failed to get active features: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
