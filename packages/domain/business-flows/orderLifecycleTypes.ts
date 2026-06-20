export type CanonicalOrderLifecycleState =
  | "cart"
  | "local_draft"
  | "server_draft"
  | "active_order"
  | "active_kitchen_order"
  | "paid_completed"
  | "cancelled";

export type OrderOperationalStatus = "draft" | "confirmed" | "preparing" | "ready" | "served" | "completed" | "cancelled";
export type PaymentStatus = "unpaid" | "partial" | "paid" | "refunded" | "voided";
export type FulfillmentStatus = "not_required" | "not_started" | "pending" | "preparing" | "ready" | "served" | "completed" | "cancelled";
