/**
 * Marketplace gating data derived from the Phase 2 entitlement SOT.
 */

import { ENTITLEMENT_CATALOG, type EntitlementCode, type PlanCode } from '@pos/application/entitlements';

export type PlanTier = PlanCode | 'free';

export const PLAN_RANK: Record<PlanTier, number> = {
  free: ENTITLEMENT_CATALOG.plans.starter.sortOrder,
  ...Object.fromEntries(
    (Object.entries(ENTITLEMENT_CATALOG.plans) as Array<[PlanCode, { sortOrder: number }]>).map(([code, plan]) => [
      code,
      plan.sortOrder,
    ]),
  ),
} as Record<PlanTier, number>;

export function planAllows(tenantPlan: PlanTier, requiredPlan: PlanTier): boolean {
  return PLAN_RANK[tenantPlan] >= PLAN_RANK[requiredPlan];
}

export type ModuleCatalogEntry = {
  moduleKey: string;
  entitlementCode: EntitlementCode;
  moduleConfigKey: string;
  requiredPlan: PlanTier;
};

const MODULE_ENTITLEMENTS: Array<{ moduleKey: string; entitlementCode: EntitlementCode; moduleConfigKey: string }> = [
  { moduleKey: 'enable_table_management', entitlementCode: 'restaurant_table_service', moduleConfigKey: 'enableTableManagement' },
  { moduleKey: 'enable_kitchen_ticket', entitlementCode: 'restaurant_kitchen_ops', moduleConfigKey: 'enableKitchenTicket' },
  { moduleKey: 'enable_multi_location', entitlementCode: 'multi_location', moduleConfigKey: 'enableMultiLocation' },
];

function requiredPlanForEntitlement(entitlementCode: EntitlementCode | string): PlanTier {
  const owningPlan = (Object.entries(ENTITLEMENT_CATALOG.plans) as Array<[PlanCode, { included: readonly string[] }]>).find(([, plan]) =>
    plan.included.includes(entitlementCode as EntitlementCode),
  );
  return owningPlan?.[0] ?? 'starter';
}

export const MODULE_CATALOG_DATA: ModuleCatalogEntry[] = MODULE_ENTITLEMENTS.map((entry) => ({
  ...entry,
  requiredPlan: requiredPlanForEntitlement(entry.entitlementCode),
}));

export const MODULE_REQUIRED_PLAN: Record<string, PlanTier> = Object.fromEntries(
  MODULE_CATALOG_DATA.map((m) => [m.moduleKey, m.requiredPlan]),
);

export type FeatureCatalogEntry = {
  featureCode: string;
  requiredPlan: PlanTier;
};

export const FEATURE_CATALOG_DATA: FeatureCatalogEntry[] = (Object.keys(ENTITLEMENT_CATALOG.entitlements) as EntitlementCode[]).map((featureCode) => ({
  featureCode,
  requiredPlan: requiredPlanForEntitlement(featureCode),
}));

export const FEATURE_REQUIRED_PLAN: Record<string, PlanTier> = Object.fromEntries(
  FEATURE_CATALOG_DATA.map((f) => [f.featureCode, f.requiredPlan]),
);
