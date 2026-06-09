/**
 * Compatibility wrapper for business type onboarding defaults.
 *
 * The single source of truth is `packages/application/entitlements/entitlementCatalog.ts`.
 * This module remains only because older registration/tests import
 * `getBusinessTypeTemplate()` and `BUSINESS_TYPE_TEMPLATES` directly.
 */

import type { BusinessType, OrderTypeCode, FeatureCode } from '@pos/core';
import type { TenantModuleConfig } from '@pos/domain/tenants/types';
import { ENTITLEMENT_CATALOG, type BusinessTypeCode, type EntitlementCode, type PlanCode } from '../entitlements/entitlementCatalog';

export type BusinessTypeTemplate = {
  tenantDefaults: {
    plan_tier: PlanCode;
    subscription_status: 'active' | 'trial' | 'suspended' | 'cancelled';
    settings: Record<string, any>;
  };
  moduleConfig: Omit<TenantModuleConfig, 'tenant_id' | 'updated_at'>;
  features: Array<{
    feature_code: FeatureCode;
    source: 'plan_default' | 'purchase' | 'manual_grant' | 'trial';
    is_active: boolean;
  }>;
  defaultEntitlements: EntitlementCode[];
  recommendedEntitlements: EntitlementCode[];
  orderTypes: OrderTypeCode[];
};

const LEGACY_FEATURE_BY_ENTITLEMENT: Partial<Record<EntitlementCode, FeatureCode>> = {
  payments_partial_payment: 'partial_payment',
  orders_queue: 'order_queue',
  restaurant_kitchen_ops: 'kitchen_ticket',
  inventory_advanced_stock: 'inventory_tracking',
  hardware_label_printer: 'label_printer',
  hardware_barcode_scanner: 'barcode_scanner',
  integrations_accounting: 'accounting_sync',
  integrations_payment_gateway: 'payment_gateway',
  integrations_api_access: 'api_integration',
};

function toModuleConfig(defaultEntitlements: readonly EntitlementCode[]): Omit<TenantModuleConfig, 'tenant_id' | 'updated_at'> {
  const has = (code: EntitlementCode) => defaultEntitlements.includes(code);
  return {
    enable_table_management: has('restaurant_table_service'),
    enable_kitchen_ticket: has('restaurant_kitchen_ops'),
    enable_loyalty: false,
    enable_delivery: false,
    enable_inventory: has('inventory_basic_stock'),
    enable_inventory_advanced: has('inventory_advanced_stock'),
    enable_appointments: false,
    enable_multi_location: has('multi_location'),
    config: {},
  };
}

function toTemplate(code: BusinessTypeCode): BusinessTypeTemplate {
  const businessType = ENTITLEMENT_CATALOG.businessTypes[code];
  const planEntitlements = ENTITLEMENT_CATALOG.plans[businessType.defaultPlan].included;
  const legacyFeatureCodes = new Set<FeatureCode>();

  for (const entitlement of planEntitlements) {
    const legacyFeature = LEGACY_FEATURE_BY_ENTITLEMENT[entitlement as EntitlementCode];
    if (legacyFeature) legacyFeatureCodes.add(legacyFeature);
  }

  return {
    tenantDefaults: {
      plan_tier: businessType.defaultPlan,
      subscription_status: 'active',
      settings: businessType.settings,
    },
    moduleConfig: toModuleConfig(businessType.defaultEntitlements),
    features: [...legacyFeatureCodes].map((feature_code) => ({
      feature_code,
      source: 'plan_default',
      is_active: true,
    })),
    defaultEntitlements: [...businessType.defaultEntitlements] as EntitlementCode[],
    recommendedEntitlements: [...businessType.recommendedEntitlements] as EntitlementCode[],
    orderTypes: [...businessType.orderTypes] as OrderTypeCode[],
  };
}

export const BUSINESS_TYPE_TEMPLATES = Object.fromEntries(
  (Object.keys(ENTITLEMENT_CATALOG.businessTypes) as BusinessTypeCode[]).map((code) => [code, toTemplate(code)]),
) as Record<BusinessType, BusinessTypeTemplate>;

export function getBusinessTypeTemplate(businessType: BusinessType): BusinessTypeTemplate {
  const template = BUSINESS_TYPE_TEMPLATES[businessType];
  if (!template) {
    throw new Error(`No template found for business type: ${businessType}`);
  }
  return template;
}
