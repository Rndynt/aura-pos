/**
 * Compatibility wrapper for plan → legacy feature codes.
 *
 * The single source of truth is `packages/application/entitlements/entitlementCatalog.ts`.
 * New entitlement checks must use entitlement codes and the entitlement engine.
 */
import { getPlanIncludedEntitlements, type EntitlementCode, type PlanCode } from '@pos/application/entitlements';

const LEGACY_FEATURE_BY_ENTITLEMENT: Partial<Record<EntitlementCode, string>> = {
  payments_partial_payment: 'partial_payment',
  orders_queue: 'order_queue',
  reports_advanced: 'analytics_dashboard',
  restaurant_kitchen_ops: 'kitchen_ticket',
  inventory_advanced_stock: 'inventory_tracking',
  hardware_label_printer: 'label_printer',
  hardware_barcode_scanner: 'barcode_scanner',
  integrations_accounting: 'accounting_sync',
  integrations_payment_gateway: 'payment_gateway',
  integrations_api_access: 'api_integration',
};

function legacyFeaturesForPlan(planCode: PlanCode): string[] {
  return getPlanIncludedEntitlements(planCode)
    .map((code) => LEGACY_FEATURE_BY_ENTITLEMENT[code])
    .filter((code): code is string => Boolean(code));
}

export const PLAN_FEATURE_MAP: Record<string, string[]> = {
  starter: legacyFeaturesForPlan('starter'),
  growth: legacyFeaturesForPlan('growth'),
  pro: legacyFeaturesForPlan('pro'),
};

// Temporary alias for old callers/tests that have not yet moved from `free` to `starter`.
PLAN_FEATURE_MAP.free = PLAN_FEATURE_MAP.starter;
