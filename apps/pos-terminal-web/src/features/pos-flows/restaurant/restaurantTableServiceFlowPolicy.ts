import { BUSINESS_FLOW_PROFILE_IDS } from "@pos/domain/business-flows";

export const RESTAURANT_TABLE_SERVICE_FLOW_POLICY = {
  businessProfile: BUSINESS_FLOW_PROFILE_IDS.restaurantTableService,
  showTableServiceActions: true,
  showKitchenActions: true,
  showActiveOrderQueueByDefault: true,
  allowFreshCreateAndPay: false,
  allowSendToKitchen: true,
  allowPayLaterActiveOrderCreation: true,
  allowServerDraft: true,
  allowLocalDraft: true,
  allowRetailQuickCharge: false,
  allowLegacyActiveOrderCartEdit: false,
  allowLegacyActiveOrderDelete: false,
  requireOrdersQueueForPayment: false,
} as const;

export type DiningContext = { tableNumber?: string | null; customerName?: string | null };

export type SendToKitchenEligibilityInput = {
  cartItemCount: number;
  diningContext: DiningContext;
  tableRequired: boolean;
  kitchenEntitlementEnabled: boolean;
};

export type SendToKitchenEligibility =
  | { ok: true }
  | { ok: false; reason: "EMPTY_CART" | "DINING_CONTEXT_REQUIRED" | "KITCHEN_ENTITLEMENT_REQUIRED" };

export function getSendToKitchenEligibility(input: SendToKitchenEligibilityInput): SendToKitchenEligibility {
  if (input.cartItemCount <= 0) return { ok: false, reason: "EMPTY_CART" };
  if (!input.kitchenEntitlementEnabled) return { ok: false, reason: "KITCHEN_ENTITLEMENT_REQUIRED" };
  const hasDiningContext = Boolean(input.diningContext.tableNumber?.trim() || input.diningContext.customerName?.trim());
  if (input.tableRequired && !hasDiningContext) return { ok: false, reason: "DINING_CONTEXT_REQUIRED" };
  return { ok: true };
}

export function canResumeRestaurantOrderIntoCart(order: { isEditableDraft?: boolean; isKitchenLocked?: boolean; lifecycleKind?: string; status?: string; paymentStatus?: string }): boolean {
  return order.isEditableDraft === true && order.isKitchenLocked !== true && order.lifecycleKind !== "active_kitchen_order";
}
