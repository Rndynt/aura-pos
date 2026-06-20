export const ORDER_ACTION_IDS = {
  CREATE_AND_PAY: "CREATE_AND_PAY",
  SAVE_DRAFT: "SAVE_DRAFT",
  CONTINUE_DRAFT: "CONTINUE_DRAFT",
  UPDATE_DRAFT_ITEMS: "UPDATE_DRAFT_ITEMS",
  CANCEL_DRAFT: "CANCEL_DRAFT",
  SEND_TO_KITCHEN: "SEND_TO_KITCHEN",
  PAY_ACTIVE_ORDER: "PAY_ACTIVE_ORDER",
  ADD_ITEM_TO_ACTIVE_ORDER: "ADD_ITEM_TO_ACTIVE_ORDER",
  CREATE_PREPARATION_TICKET_AFTER_PAYMENT: "CREATE_PREPARATION_TICKET_AFTER_PAYMENT",
  VOID_ITEM: "VOID_ITEM",
  CANCEL_ACTIVE_ORDER: "CANCEL_ACTIVE_ORDER",
  REFUND_PAYMENT: "REFUND_PAYMENT",
  VOID_PAYMENT: "VOID_PAYMENT",
  SPLIT_BILL: "SPLIT_BILL",
  PARTIAL_PAYMENT: "PARTIAL_PAYMENT",
  VIEW_ACTIVE_ORDER: "VIEW_ACTIVE_ORDER",
  VIEW_DRAFT: "VIEW_DRAFT",
  VIEW_LOCAL_DRAFT: "VIEW_LOCAL_DRAFT",
  DELETE_LOCAL_DRAFT: "DELETE_LOCAL_DRAFT",
} as const;

export type OrderActionId = (typeof ORDER_ACTION_IDS)[keyof typeof ORDER_ACTION_IDS];

export type OrderActionCategory =
  | "checkout"
  | "draft"
  | "kitchen"
  | "active_order"
  | "financial"
  | "view"
  | "local_draft";

export interface OrderActionDefinition {
  id: OrderActionId;
  label: string;
  category: OrderActionCategory;
  isCore: boolean;
  isBusinessSpecific: boolean;
  requiredEntitlementCodes?: readonly string[];
  requiresReason?: boolean;
  requiresPermission?: readonly string[];
  unsafeWithoutPolicy?: boolean;
}

export const ORDER_ACTION_DEFINITIONS: Record<OrderActionId, OrderActionDefinition> = {
  CREATE_AND_PAY: {
    id: "CREATE_AND_PAY",
    label: "Create and pay order",
    category: "checkout",
    isCore: true,
    isBusinessSpecific: false,
  },
  SAVE_DRAFT: { id: "SAVE_DRAFT", label: "Save draft", category: "draft", isCore: true, isBusinessSpecific: false },
  CONTINUE_DRAFT: { id: "CONTINUE_DRAFT", label: "Continue draft", category: "draft", isCore: true, isBusinessSpecific: false },
  UPDATE_DRAFT_ITEMS: { id: "UPDATE_DRAFT_ITEMS", label: "Update draft items", category: "draft", isCore: true, isBusinessSpecific: false },
  CANCEL_DRAFT: { id: "CANCEL_DRAFT", label: "Cancel draft", category: "draft", isCore: true, isBusinessSpecific: false },
  SEND_TO_KITCHEN: {
    id: "SEND_TO_KITCHEN",
    label: "Send to kitchen",
    category: "kitchen",
    isCore: false,
    isBusinessSpecific: true,
    requiredEntitlementCodes: ["restaurant_kitchen_ops"],
  },
  PAY_ACTIVE_ORDER: { id: "PAY_ACTIVE_ORDER", label: "Pay active order", category: "active_order", isCore: true, isBusinessSpecific: true },
  ADD_ITEM_TO_ACTIVE_ORDER: { id: "ADD_ITEM_TO_ACTIVE_ORDER", label: "Add item to active order", category: "active_order", isCore: false, isBusinessSpecific: true, unsafeWithoutPolicy: true },
  CREATE_PREPARATION_TICKET_AFTER_PAYMENT: { id: "CREATE_PREPARATION_TICKET_AFTER_PAYMENT", label: "Create preparation ticket after payment", category: "kitchen", isCore: false, isBusinessSpecific: true },
  VOID_ITEM: { id: "VOID_ITEM", label: "Void item", category: "active_order", isCore: false, isBusinessSpecific: true, requiresReason: true, requiresPermission: ["orders:void_item"], unsafeWithoutPolicy: true },
  CANCEL_ACTIVE_ORDER: { id: "CANCEL_ACTIVE_ORDER", label: "Cancel active order", category: "active_order", isCore: false, isBusinessSpecific: true, requiresReason: true, requiresPermission: ["orders:cancel_active"], unsafeWithoutPolicy: true },
  REFUND_PAYMENT: { id: "REFUND_PAYMENT", label: "Refund payment", category: "financial", isCore: true, isBusinessSpecific: false, requiresReason: true, requiresPermission: ["payments:refund"], unsafeWithoutPolicy: true },
  VOID_PAYMENT: { id: "VOID_PAYMENT", label: "Void payment", category: "financial", isCore: true, isBusinessSpecific: false, requiresReason: true, requiresPermission: ["payments:void"], unsafeWithoutPolicy: true },
  SPLIT_BILL: { id: "SPLIT_BILL", label: "Split bill", category: "financial", isCore: false, isBusinessSpecific: true, requiredEntitlementCodes: ["payments_split_bill"], unsafeWithoutPolicy: true },
  PARTIAL_PAYMENT: { id: "PARTIAL_PAYMENT", label: "Partial payment", category: "financial", isCore: false, isBusinessSpecific: false, requiredEntitlementCodes: ["payments_partial_payment"], unsafeWithoutPolicy: true },
  VIEW_ACTIVE_ORDER: { id: "VIEW_ACTIVE_ORDER", label: "View active order", category: "view", isCore: true, isBusinessSpecific: true },
  VIEW_DRAFT: { id: "VIEW_DRAFT", label: "View draft", category: "view", isCore: true, isBusinessSpecific: false },
  VIEW_LOCAL_DRAFT: { id: "VIEW_LOCAL_DRAFT", label: "View local draft", category: "local_draft", isCore: true, isBusinessSpecific: false },
  DELETE_LOCAL_DRAFT: { id: "DELETE_LOCAL_DRAFT", label: "Delete local draft", category: "local_draft", isCore: true, isBusinessSpecific: false },
};
