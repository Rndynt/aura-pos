import { BUSINESS_FLOW_PROFILE_IDS } from "@pos/domain/business-flows/businessFlowProfiles";

export const RETAIL_STANDARD_FLOW_POLICY = {
  businessProfile: BUSINESS_FLOW_PROFILE_IDS.retailStandard,
  showKitchenActions: false,
  showTableServiceActions: false,
  showActiveOrderQueueByDefault: false,
  allowFreshCreateAndPay: true,
  allowServerDraft: true,
  allowLocalDraft: true,
  allowPayLaterActiveOrderCreation: false,
  allowLegacyActiveOrderPayment: true,
  allowLegacyActiveOrderCartEdit: false,
  allowLegacyActiveOrderDelete: false,
  requireOrdersQueueForPayment: false,
  supportedActions: [
    "CREATE_AND_PAY",
    "SAVE_DRAFT",
    "CONTINUE_DRAFT",
    "UPDATE_DRAFT_ITEMS",
    "CANCEL_DRAFT",
    "VIEW_DRAFT",
    "VIEW_LOCAL_DRAFT",
    "DELETE_LOCAL_DRAFT",
    "REFUND_PAYMENT",
    "VOID_PAYMENT",
  ],
  blockedActions: [
    "SEND_TO_KITCHEN",
    "CREATE_PREPARATION_TICKET_AFTER_PAYMENT",
    "PAY_LATER_ACTIVE_ORDER_CREATION",
    "ADD_ITEM_TO_ACTIVE_ORDER",
    "VOID_ITEM",
    "SPLIT_BY_TABLE",
  ],
} as const;

export type RetailStandardFlowPolicy = typeof RETAIL_STANDARD_FLOW_POLICY;

export function getRetailStandardFlowPolicy(): RetailStandardFlowPolicy {
  return RETAIL_STANDARD_FLOW_POLICY;
}
