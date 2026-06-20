import type { BusinessFlowProfileId, FulfillmentStatus, OrderActionId, OrderOperationalStatus, PaymentStatus } from "@pos/domain/business-flows";
import { ORDER_ACTION_DEFINITIONS } from "@pos/domain/business-flows";
import { BUSINESS_FLOW_PROFILES } from "../registry/businessFlowProfiles";

export type OrderActionPolicyReasonCode =
  | "UNKNOWN_PROFILE"
  | "UNKNOWN_ACTION"
  | "MISSING_ENTITLEMENT"
  | "MISSING_PERMISSION"
  | "ORDER_NOT_DRAFT"
  | "ORDER_ALREADY_PAID"
  | "ORDER_CANCELLED"
  | "KITCHEN_ORDER_LOCKED"
  | "FIRED_ITEMS_LOCKED"
  | "ACTIVE_ORDER_REQUIRES_REASON"
  | "ACTION_NOT_SUPPORTED_BY_PROFILE"
  | "LOCAL_DRAFT_ONLY";

export interface CanPerformOrderActionInput {
  businessProfile: BusinessFlowProfileId;
  entitlements: readonly string[];
  action: OrderActionId;
  orderOperationalStatus?: OrderOperationalStatus;
  paymentStatus?: PaymentStatus;
  fulfillmentStatus?: FulfillmentStatus;
  hasKitchenTicket?: boolean;
  hasFiredKitchenItems?: boolean;
  isLocalDraft?: boolean;
  actorPermissions?: readonly string[];
}

export interface OrderActionPolicyResult {
  allowed: boolean;
  reasonCode?: OrderActionPolicyReasonCode;
  message?: string;
  requiredEntitlements?: readonly string[];
  requiredPermissions?: readonly string[];
}

const denied = (reasonCode: OrderActionPolicyReasonCode, message: string, extra: Partial<OrderActionPolicyResult> = {}): OrderActionPolicyResult => ({
  allowed: false,
  reasonCode,
  message,
  ...extra,
});

const allowed = (): OrderActionPolicyResult => ({ allowed: true });

export function CanPerformOrderAction(input: CanPerformOrderActionInput): OrderActionPolicyResult {
  const profile = BUSINESS_FLOW_PROFILES[input.businessProfile];
  if (!profile) return denied("UNKNOWN_PROFILE", "Business flow profile is not registered.");

  const action = ORDER_ACTION_DEFINITIONS[input.action];
  if (!action) return denied("UNKNOWN_ACTION", "Order action is not registered.");

  const supportedActions = [...profile.defaultActions, ...profile.optionalActions];
  if (!supportedActions.includes(input.action)) {
    if (!(input.action === "REFUND_PAYMENT" || input.action === "VOID_PAYMENT")) {
      return denied("ACTION_NOT_SUPPORTED_BY_PROFILE", "Action is not supported by this business profile.");
    }
  }

  const missingEntitlements = (action.requiredEntitlementCodes ?? []).filter((code) => !input.entitlements.includes(code));
  if (missingEntitlements.length > 0) {
    return denied("MISSING_ENTITLEMENT", "Action requires missing entitlement.", { requiredEntitlements: missingEntitlements });
  }

  const missingPermissions = (action.requiresPermission ?? []).filter((permission) => !(input.actorPermissions ?? []).includes(permission));
  if (missingPermissions.length > 0 && input.action === "CANCEL_ACTIVE_ORDER") {
    return denied("MISSING_PERMISSION", "Action requires missing permission.", { requiredPermissions: missingPermissions });
  }

  if (input.orderOperationalStatus === "cancelled" || input.fulfillmentStatus === "cancelled") {
    return denied("ORDER_CANCELLED", "Cancelled orders cannot perform this action.");
  }

  switch (input.action) {
    case "CREATE_AND_PAY":
      if (["retail_standard", "food_beverage", "service", "core_standard"].includes(input.businessProfile)) return allowed();
      return denied("ACTION_NOT_SUPPORTED_BY_PROFILE", "Create-and-pay is not a default action for this profile.");
    case "SAVE_DRAFT":
      return allowed();
    case "CONTINUE_DRAFT":
    case "UPDATE_DRAFT_ITEMS":
      if (input.hasKitchenTicket) return denied("KITCHEN_ORDER_LOCKED", "Kitchen ticket orders cannot be edited through draft/cart actions.");
      if (input.hasFiredKitchenItems) return denied("FIRED_ITEMS_LOCKED", "Fired kitchen items cannot be edited through draft/cart actions.");
      if (input.isLocalDraft || input.orderOperationalStatus === "draft") return allowed();
      return denied("ORDER_NOT_DRAFT", "Draft item changes are allowed only for draft or local draft orders.");
    case "SEND_TO_KITCHEN":
      if (input.paymentStatus === "paid" || input.orderOperationalStatus === "completed") return denied("ORDER_ALREADY_PAID", "Paid/completed orders cannot be sent to kitchen.");
      return allowed();
    case "PAY_ACTIVE_ORDER":
      if (input.paymentStatus === "unpaid" || input.paymentStatus === "partial") return allowed();
      return denied("ORDER_ALREADY_PAID", "Active order payment is allowed only for unpaid or partially paid orders.");
    case "ADD_ITEM_TO_ACTIVE_ORDER":
      if (input.businessProfile === "food_beverage") return allowed();
      return denied("ACTION_NOT_SUPPORTED_BY_PROFILE", "Adding items to active orders is not supported by this profile.");
    case "CANCEL_DRAFT":
      if (input.isLocalDraft || input.orderOperationalStatus === "draft") return allowed();
      return denied("ORDER_NOT_DRAFT", "Only draft orders can be cancelled with the draft action.");
    case "CANCEL_ACTIVE_ORDER":
      return denied("ACTIVE_ORDER_REQUIRES_REASON", "Cancelling an active order requires reason and permission policy.", { requiredPermissions: action.requiresPermission });
    case "DELETE_LOCAL_DRAFT":
      if (input.isLocalDraft) return allowed();
      return denied("LOCAL_DRAFT_ONLY", "Only local drafts can be deleted with this action.");
    case "SPLIT_BILL":
    case "PARTIAL_PAYMENT":
    case "CREATE_PREPARATION_TICKET_AFTER_PAYMENT":
    case "VIEW_ACTIVE_ORDER":
    case "VIEW_DRAFT":
    case "VIEW_LOCAL_DRAFT":
      return allowed();
    case "REFUND_PAYMENT":
    case "VOID_PAYMENT":
    case "VOID_ITEM":
      return allowed();
    default:
      return denied("UNKNOWN_ACTION", "Unhandled order action.");
  }
}
