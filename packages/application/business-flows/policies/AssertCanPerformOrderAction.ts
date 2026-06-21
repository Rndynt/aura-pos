import type { BusinessFlowProfileId, OrderActionId } from "@pos/domain/business-flows";
import { CanPerformOrderAction, type CanPerformOrderActionInput, type OrderActionPolicyReasonCode } from "./CanPerformOrderAction";

export type OrderActionBusinessErrorCode =
  | "ORDER_ACTION_NOT_ALLOWED"
  | "ORDER_NOT_EDITABLE"
  | "KITCHEN_ORDER_LOCKED"
  | "FIRED_ITEMS_LOCKED"
  | "PAYMENT_NOT_ALLOWED"
  | "PARTIAL_PAYMENT_ENTITLEMENT_REQUIRED"
  | "MULTI_PAYMENT_ENTITLEMENT_REQUIRED"
  | "SPLIT_BILL_ENTITLEMENT_REQUIRED"
  | "ORDER_CANCEL_REASON_REQUIRED";

export class OrderActionPolicyError extends Error {
  readonly code: OrderActionBusinessErrorCode;
  readonly reasonCode?: OrderActionPolicyReasonCode;
  readonly statusCode: number;
  readonly requiredEntitlements?: readonly string[];
  readonly requiredPermissions?: readonly string[];

  constructor(input: {
    code: OrderActionBusinessErrorCode;
    message: string;
    reasonCode?: OrderActionPolicyReasonCode;
    statusCode?: number;
    requiredEntitlements?: readonly string[];
    requiredPermissions?: readonly string[];
  }) {
    super(input.message);
    this.name = "OrderActionPolicyError";
    this.code = input.code;
    this.reasonCode = input.reasonCode;
    this.statusCode = input.statusCode ?? 409;
    this.requiredEntitlements = input.requiredEntitlements;
    this.requiredPermissions = input.requiredPermissions;
  }
}

const entitlementErrorByAction: Partial<Record<OrderActionId, OrderActionBusinessErrorCode>> = {
  PARTIAL_PAYMENT: "PARTIAL_PAYMENT_ENTITLEMENT_REQUIRED",
  SPLIT_BILL: "SPLIT_BILL_ENTITLEMENT_REQUIRED",
};

function mapDeniedCode(action: OrderActionId, reasonCode?: OrderActionPolicyReasonCode): OrderActionBusinessErrorCode {
  if (reasonCode === "KITCHEN_ORDER_LOCKED") return "KITCHEN_ORDER_LOCKED";
  if (reasonCode === "FIRED_ITEMS_LOCKED") return "FIRED_ITEMS_LOCKED";
  if (reasonCode === "ORDER_NOT_DRAFT") return "ORDER_NOT_EDITABLE";
  if (reasonCode === "ACTIVE_ORDER_REQUIRES_REASON") return "ORDER_CANCEL_REASON_REQUIRED";
  if (reasonCode === "MISSING_ENTITLEMENT") return entitlementErrorByAction[action] ?? "ORDER_ACTION_NOT_ALLOWED";
  if (action === "PAY_ACTIVE_ORDER" || action === "CREATE_AND_PAY") return "PAYMENT_NOT_ALLOWED";
  return "ORDER_ACTION_NOT_ALLOWED";
}

export function assertCanPerformOrderAction(input: CanPerformOrderActionInput): void {
  const result = CanPerformOrderAction(input);
  if (result.allowed) return;

  throw new OrderActionPolicyError({
    code: mapDeniedCode(input.action, result.reasonCode),
    reasonCode: result.reasonCode,
    message: result.message ?? "Order action is not allowed by business-flow policy.",
    statusCode: result.reasonCode === "MISSING_ENTITLEMENT" || result.reasonCode === "MISSING_PERMISSION" ? 403 : 409,
    requiredEntitlements: result.requiredEntitlements,
    requiredPermissions: result.requiredPermissions,
  });
}

export type OrderActionPolicyContext = Omit<CanPerformOrderActionInput, "action"> & {
  businessProfile: BusinessFlowProfileId;
};
