/**
 * OrderStateValidator
 * Centralized validation for order status transitions
 * Ensures business rules are consistently enforced across all use cases
 *
 * Two-dimension lifecycle model (P0.3):
 *  - Fulfillment status: draft → confirmed → preparing → ready → served → (completed | cancelled)
 *  - Payment status: tracked separately on orders.payment_status (unpaid / partial / paid)
 *  - `served`    = food delivered to table, bill still open → valid for dine-in pay-later
 *  - `completed` = financial close (requires payment_status=paid or manager override via closedAt)
 *
 * Kitchen/KDS staff can only drive transitions up to 'served'.
 * Cashier/POS drives 'completed' after payment is settled.
 */

import { OrderStatus } from '@pos/core/enums';

export type OrderStatusType =
  | "draft"
  | "confirmed"
  | "preparing"
  | "ready"
  | "served"
  | "completed"
  | "cancelled";

/**
 * General transition map (POS/cashier context).
 * Key: current status → Value: allowed next statuses.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatusType, OrderStatusType[]> = {
  draft:     ["draft", "confirmed", "preparing", "ready", "served", "cancelled"],
  confirmed: ["confirmed", "preparing", "ready", "served", "completed", "cancelled"],
  preparing: ["preparing", "ready", "served", "completed", "cancelled"],
  ready:     ["ready", "served", "completed", "cancelled"],
  served:    ["served", "completed", "cancelled"],
  completed: ["completed"], // Terminal – financial close
  cancelled: ["cancelled"], // Terminal
};

/**
 * Kitchen/KDS-only transition map.
 * Kitchen staff drive fulfillment up to 'served' only.
 * They cannot trigger 'completed' (financial close).
 */
const KITCHEN_ALLOWED_TRANSITIONS: Record<OrderStatusType, OrderStatusType[]> = {
  draft:     ["confirmed", "preparing"],
  confirmed: ["confirmed", "preparing", "ready", "served"],
  preparing: ["preparing", "ready", "served"],
  ready:     ["ready", "served"],
  served:    ["served"], // Kitchen terminal – bill still open
  completed: [],         // Kitchen cannot close financials
  cancelled: [],         // No-op
};

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/** Returns true if no further transitions are possible */
export function isTerminalStatus(status: OrderStatusType): boolean {
  return status === "completed" || status === "cancelled";
}

/** Returns true if the order is still operationally active */
export function isOpenStatus(status: OrderStatusType): boolean {
  return (
    status === "draft" ||
    status === "confirmed" ||
    status === "preparing" ||
    status === "ready" ||
    status === "served"
  );
}

/** Returns true if the order is closed (completed or cancelled) */
export function isClosedStatus(status: OrderStatusType): boolean {
  return status === "completed" || status === "cancelled";
}

/** Returns all POS-allowed next statuses from the current status */
export function getAllowedNextStatuses(currentStatus: OrderStatusType): OrderStatusType[] {
  return ALLOWED_TRANSITIONS[currentStatus] || [];
}

/** Returns kitchen-allowed next statuses from the current status */
export function getKitchenAllowedNextStatuses(currentStatus: OrderStatusType): OrderStatusType[] {
  return KITCHEN_ALLOWED_TRANSITIONS[currentStatus] || [];
}

// ---------------------------------------------------------------------------
// Assertion helpers (throw on invalid transition)
// ---------------------------------------------------------------------------

/**
 * Assert that a POS/cashier transition is valid.
 * @throws Error with descriptive message if transition is illegal
 */
export function assertTransition(
  currentStatus: OrderStatusType,
  targetStatus: OrderStatusType
): void {
  if (currentStatus === targetStatus) return; // idempotent – no-op

  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(targetStatus)) {
    throw new Error(
      `Invalid status transition: cannot change from '${currentStatus}' to '${targetStatus}'`
    );
  }
}

/**
 * Assert that a kitchen/KDS fulfillment transition is valid.
 * Kitchen staff can only transition up to 'served'; they cannot financial-close an order.
 * @throws Error if transition is outside kitchen-allowed transitions
 */
export function assertKitchenTransition(
  currentStatus: OrderStatusType,
  targetStatus: OrderStatusType
): void {
  if (currentStatus === targetStatus) return; // idempotent – no-op

  const allowed = KITCHEN_ALLOWED_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(targetStatus)) {
    throw new Error(
      `Kitchen display cannot transition '${currentStatus}' → '${targetStatus}'. ` +
      `Kitchen may only drive fulfillment up to 'served'. ` +
      `Financial close ('completed') must be performed by the cashier.`
    );
  }
}

// ---------------------------------------------------------------------------
// Boolean guards (convenience)
// ---------------------------------------------------------------------------

export function canConfirmOrder(status: OrderStatusType): boolean {
  return status === "draft";
}

export function canServeOrder(status: OrderStatusType): boolean {
  return status === "ready" || status === "preparing";
}

/** Financial close requires payment to be settled first */
export function canCompleteOrder(status: OrderStatusType): boolean {
  return status === "ready" || status === "preparing" || status === "served";
}

export function canCancelOrder(status: OrderStatusType): boolean {
  return !isTerminalStatus(status);
}
