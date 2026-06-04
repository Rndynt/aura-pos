/**
 * Pure-data catalog — no React imports, safe to import anywhere.
 *
 * Single source of truth for plan-tier gating across:
 *  - useFeatures.ts  (feature code → required plan)
 *  - TenantContext.tsx (module key → required plan)
 *  - marketplace.tsx  (adds icons/colors on top of this data)
 *
 * Rule: if you need to add a module or feature, add it here FIRST.
 */

export type PlanTier = "free" | "growth" | "pro";

export const PLAN_RANK: Record<PlanTier, number> = { free: 0, growth: 1, pro: 2 };

/** Returns true if the tenant's plan meets the required plan tier. */
export function planAllows(tenantPlan: PlanTier, requiredPlan: PlanTier): boolean {
  return PLAN_RANK[tenantPlan] >= PLAN_RANK[requiredPlan];
}

// ─── Module catalog (data only) ───────────────────────────────────────────────

export type ModuleCatalogEntry = {
  moduleKey: string;
  moduleConfigKey: string;
  requiredPlan: PlanTier;
};

export const MODULE_CATALOG_DATA: ModuleCatalogEntry[] = [
  { moduleKey: "enable_table_management",   moduleConfigKey: "enableTableManagement",   requiredPlan: "growth" },
  { moduleKey: "enable_kitchen_ticket",     moduleConfigKey: "enableKitchenTicket",     requiredPlan: "growth" },
  { moduleKey: "enable_loyalty",            moduleConfigKey: "enableLoyalty",           requiredPlan: "growth" },
  { moduleKey: "enable_delivery",           moduleConfigKey: "enableDelivery",          requiredPlan: "growth" },
  { moduleKey: "enable_appointments",       moduleConfigKey: "enableAppointments",      requiredPlan: "growth" },
  { moduleKey: "enable_inventory",          moduleConfigKey: "enableInventory",         requiredPlan: "free"   },
  { moduleKey: "enable_inventory_advanced", moduleConfigKey: "enableInventoryAdvanced", requiredPlan: "growth" },
  { moduleKey: "enable_multi_location",     moduleConfigKey: "enableMultiLocation",     requiredPlan: "pro"    },
];

/** Lookup: moduleKey → required plan tier */
export const MODULE_REQUIRED_PLAN: Record<string, PlanTier> = Object.fromEntries(
  MODULE_CATALOG_DATA.map((m) => [m.moduleKey, m.requiredPlan])
);

// ─── Feature catalog (data only) ──────────────────────────────────────────────

export type FeatureCatalogEntry = {
  featureCode: string;
  requiredPlan: PlanTier;
};

export const FEATURE_CATALOG_DATA: FeatureCatalogEntry[] = [
  { featureCode: "product_variants",   requiredPlan: "free"   },
  { featureCode: "partial_payment",    requiredPlan: "free"   },
  { featureCode: "discounts",          requiredPlan: "free"   },
  { featureCode: "order_queue",        requiredPlan: "free"   },
  { featureCode: "receipt_printer",    requiredPlan: "free"   },
  { featureCode: "sales_reports",      requiredPlan: "free"   },
  { featureCode: "order_notifications",requiredPlan: "growth" },
  { featureCode: "label_printer",      requiredPlan: "growth" },
  { featureCode: "barcode_scanner",    requiredPlan: "growth" },
  { featureCode: "analytics_dashboard",requiredPlan: "growth" },
  { featureCode: "accounting_sync",    requiredPlan: "growth" },
  { featureCode: "dark_mode",          requiredPlan: "growth" },
  { featureCode: "custom_branding",    requiredPlan: "growth" },
  // bundled inside enable_kitchen_ticket module — listed here for completeness
  { featureCode: "kitchen_ticket",     requiredPlan: "growth" },
  { featureCode: "kitchen_display",    requiredPlan: "growth" },
  { featureCode: "kitchen_printer",    requiredPlan: "growth" },
  // bundled inside enable_inventory_advanced module
  { featureCode: "inventory_tracking", requiredPlan: "growth" },
  { featureCode: "inventory_reports",  requiredPlan: "growth" },
  // pro-only
  { featureCode: "payment_gateway",    requiredPlan: "pro"    },
  { featureCode: "api_integration",    requiredPlan: "pro"    },
  { featureCode: "online_booking",     requiredPlan: "pro"    },
  { featureCode: "calendar_sync",      requiredPlan: "pro"    },
];

/** Lookup: featureCode → required plan tier */
export const FEATURE_REQUIRED_PLAN: Record<string, PlanTier> = Object.fromEntries(
  FEATURE_CATALOG_DATA.map((f) => [f.featureCode, f.requiredPlan])
);
