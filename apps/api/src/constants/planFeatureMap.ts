/**
 * Compatibility wrapper for plan → legacy feature codes.
 *
 * The single source of truth is `packages/application/entitlements/entitlementCatalog.ts`.
 * New entitlement checks must use entitlement codes and the entitlement engine.
 */
import { getPlanIncludedEntitlements, type EntitlementCode, type PlanCode } from '@pos/application/entitlements';

const LEGACY_FEATURE_BY_ENTITLEMENT: Partial<Record<EntitlementCode, string>> = {
  catalog_variants: 'product_variants',
  payments_partial_payment: 'partial_payment',
  orders_queue: 'order_queue',
  receipt_standard: 'receipt_printer',
  reports_sales_basic: 'sales_reports',
  reports_sales_advanced: 'analytics_dashboard',
  restaurant_kitchen_printer: 'kitchen_printer',
  restaurant_kds: 'kitchen_display',
  restaurant_kitchen_ticket: 'kitchen_ticket',
  inventory_advanced_stock: 'inventory_tracking',
  inventory_reports: 'inventory_reports',
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
