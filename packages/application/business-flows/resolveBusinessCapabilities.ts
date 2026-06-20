import type { EntitlementCode } from "@pos/application/entitlements";

export type BusinessCapabilities = {
  tableService: boolean;
  floorPlan: boolean;
  kitchenOps: boolean;
  kds: boolean;
  orderQueue: boolean;
  splitBill: boolean;
  partialPayment: boolean;
  multiPayment: boolean;
};

export type EntitlementLookup = readonly string[] | Partial<Record<string, boolean>> | ((code: EntitlementCode | string) => boolean);

function hasEntitlement(entitlements: EntitlementLookup, code: EntitlementCode | string): boolean {
  if (typeof entitlements === "function") return entitlements(code);
  if (Array.isArray(entitlements)) return entitlements.includes(code);
  const entitlementMap = entitlements as Partial<Record<string, boolean>>;
  return entitlementMap[code] === true;
}

export function resolveBusinessCapabilities(entitlements: EntitlementLookup): BusinessCapabilities {
  const kitchenOps = hasEntitlement(entitlements, "restaurant_kitchen_ops");
  const orderQueue = hasEntitlement(entitlements, "orders_queue");
  return {
    tableService: hasEntitlement(entitlements, "restaurant_table_service"),
    floorPlan: hasEntitlement(entitlements, "restaurant_table_service"),
    kitchenOps,
    kds: kitchenOps,
    orderQueue,
    splitBill: hasEntitlement(entitlements, "payments_split_bill"),
    partialPayment: hasEntitlement(entitlements, "payments_partial_payment"),
    multiPayment: hasEntitlement(entitlements, "payments_multi_payment"),
  };
}
