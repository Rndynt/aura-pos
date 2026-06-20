import type { OrderActionId } from "./businessFlowActions";

export type BusinessFlowProfileId = "retail_standard" | "food_beverage" | "service" | "core_standard";

export type BusinessFlowUiSectionId = "PRODUCT_GRID" | "CART" | "PAYMENT" | "SERVER_DRAFTS" | "LOCAL_DRAFTS" | "ACTIVE_ORDERS" | "KITCHEN_QUEUE" | "TABLES" | "RECEIPTS";

export interface BusinessFlowProfileDefinition {
  id: BusinessFlowProfileId;
  label: string;
  description: string;
  defaultFlowSummary: string;
  uiSections: readonly BusinessFlowUiSectionId[];
  defaultActions: readonly OrderActionId[];
  optionalActions: readonly OrderActionId[];
  businessSpecificActions: readonly OrderActionId[];
  coreActions: readonly OrderActionId[];
  supportsPayFirstVariant?: boolean;
  notes: readonly string[];
}
