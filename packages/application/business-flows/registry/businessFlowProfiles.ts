import type { BusinessFlowProfileDefinition, BusinessFlowProfileId } from "@pos/domain/business-flows";

const baselineActions = ["CREATE_AND_PAY", "CONTINUE_DRAFT", "UPDATE_DRAFT_ITEMS", "CANCEL_DRAFT", "VIEW_DRAFT", "VIEW_LOCAL_DRAFT", "DELETE_LOCAL_DRAFT"] as const;
const optionalFinancialActions = ["SAVE_DRAFT", "REFUND_PAYMENT", "VOID_PAYMENT", "PARTIAL_PAYMENT", "SPLIT_BILL"] as const;

export const BUSINESS_FLOW_PROFILES: Record<BusinessFlowProfileId, BusinessFlowProfileDefinition> = {
  retail_standard: {
    id: "retail_standard",
    label: "Retail standard",
    description: "Direct cashier checkout for minimarket and store operations.",
    defaultFlowSummary: "Product -> Cart -> Pay -> Receipt",
    uiSections: ["PRODUCT_GRID", "CART", "PAYMENT", "SERVER_DRAFTS", "LOCAL_DRAFTS", "RECEIPTS"],
    defaultActions: baselineActions,
    optionalActions: optionalFinancialActions,
    businessSpecificActions: [],
    coreActions: ["CREATE_AND_PAY", "SAVE_DRAFT", "CONTINUE_DRAFT", "UPDATE_DRAFT_ITEMS"],
    notes: ["Kitchen, table service, and pay-later active orders are not default retail concepts."],
  },
  food_beverage: {
    id: "food_beverage",
    label: "Food & beverage baseline",
    description: "Cafe/restaurant/quick-service baseline checkout; advanced restaurant operations are entitlement-gated capabilities.",
    defaultFlowSummary: "Product -> Cart -> Pay -> Receipt",
    uiSections: ["PRODUCT_GRID", "CART", "PAYMENT", "SERVER_DRAFTS", "LOCAL_DRAFTS", "RECEIPTS"],
    defaultActions: baselineActions,
    optionalActions: [...optionalFinancialActions, "SEND_TO_KITCHEN", "PAY_ACTIVE_ORDER", "ADD_ITEM_TO_ACTIVE_ORDER", "CREATE_PREPARATION_TICKET_AFTER_PAYMENT", "CANCEL_ACTIVE_ORDER", "VIEW_ACTIVE_ORDER"],
    businessSpecificActions: ["SEND_TO_KITCHEN", "PAY_ACTIVE_ORDER", "ADD_ITEM_TO_ACTIVE_ORDER", "CREATE_PREPARATION_TICKET_AFTER_PAYMENT", "CANCEL_ACTIVE_ORDER", "VIEW_ACTIVE_ORDER"],
    coreActions: ["CREATE_AND_PAY", "SAVE_DRAFT", "CONTINUE_DRAFT", "UPDATE_DRAFT_ITEMS"],
    notes: ["Table service, kitchen/KDS, queue, split bill, partial payment, and multi-payment are capabilities, not default routing profiles."],
  },
  service: {
    id: "service",
    label: "Service baseline",
    description: "Laundry, salon, barber, spa, and appointment businesses use core checkout first.",
    defaultFlowSummary: "Service/Product -> Cart -> Pay -> Receipt",
    uiSections: ["PRODUCT_GRID", "CART", "PAYMENT", "SERVER_DRAFTS", "LOCAL_DRAFTS", "RECEIPTS"],
    defaultActions: baselineActions,
    optionalActions: [...optionalFinancialActions, "PAY_ACTIVE_ORDER", "CANCEL_ACTIVE_ORDER", "VIEW_ACTIVE_ORDER"],
    businessSpecificActions: ["PAY_ACTIVE_ORDER", "CANCEL_ACTIVE_ORDER", "VIEW_ACTIVE_ORDER"],
    coreActions: ["CREATE_AND_PAY", "SAVE_DRAFT", "CONTINUE_DRAFT", "UPDATE_DRAFT_ITEMS"],
    notes: ["Appointment/progress lifecycle is not required to use core POS checkout."],
  },
  core_standard: {
    id: "core_standard",
    label: "Core standard",
    description: "Safe baseline checkout fallback for unknown or not-yet-specialized business types.",
    defaultFlowSummary: "Product -> Cart -> Pay -> Receipt",
    uiSections: ["PRODUCT_GRID", "CART", "PAYMENT", "LOCAL_DRAFTS", "RECEIPTS"],
    defaultActions: baselineActions,
    optionalActions: optionalFinancialActions,
    businessSpecificActions: [],
    coreActions: ["CREATE_AND_PAY", "SAVE_DRAFT", "CONTINUE_DRAFT", "UPDATE_DRAFT_ITEMS"],
    notes: ["Missing paid entitlements never block full payment checkout."],
  },
};
