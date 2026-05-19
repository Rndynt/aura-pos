/**
 * Order Status Helper Utilities
 *
 * Provides type-safe helpers for determining order state and available actions.
 * Two-dimension lifecycle model:
 *   Fulfillment: draft → confirmed → preparing → ready → served → completed | cancelled
 *   Payment:     unpaid → partial → paid
 *
 * `served`    = makanan sudah disajikan ke meja; tagihan masih bisa belum dibayar (dine-in pay-later)
 * `completed` = financial close; hanya boleh setelah payment_status = 'paid'
 */

export type OrderStatus =
  | "draft"
  | "confirmed"
  | "preparing"
  | "ready"
  | "served"
  | "completed"
  | "cancelled";

export type PaymentStatus = "unpaid" | "partial" | "paid";

export function isDraft(status: OrderStatus): boolean {
  return status === "draft";
}

/**
 * Order masih aktif secara operasional — belum closed (completed/cancelled).
 * Termasuk `served` karena tagihan bisa masih open.
 */
export function isOpen(status: OrderStatus): boolean {
  return ["confirmed", "preparing", "ready", "served"].includes(status);
}

/**
 * Order sedang di kitchen (preparing atau ready).
 */
export function isInProgress(status: OrderStatus): boolean {
  return ["preparing", "ready"].includes(status);
}

/**
 * Makanan sudah disajikan ke meja (dine-in pay-later).
 * Kitchen selesai; cashier masih bisa tagih pembayaran.
 */
export function isServed(status: OrderStatus): boolean {
  return status === "served";
}

/**
 * Financial close — order selesai secara operasional DAN finansial.
 */
export function isCompleted(status: OrderStatus): boolean {
  return status === "completed";
}

export function isCancelled(status: OrderStatus): boolean {
  return status === "cancelled";
}

export function canSendToKitchen(status: OrderStatus): boolean {
  return status === "confirmed";
}

/**
 * Pembayaran bisa direkam selama order belum closed (completed/cancelled).
 * `served + unpaid` adalah valid untuk dine-in pay-later.
 */
export function canRecordPayment(status: OrderStatus, paymentStatus: PaymentStatus): boolean {
  return !isCompleted(status) && !isCancelled(status);
}

export function isPaid(paymentStatus: PaymentStatus): boolean {
  return paymentStatus === "paid";
}

export function isPartiallyPaid(paymentStatus: PaymentStatus): boolean {
  return paymentStatus === "partial";
}

export function isUnpaid(paymentStatus: PaymentStatus): boolean {
  return paymentStatus === "unpaid";
}

/**
 * Financial close hanya boleh dari status operasional yang sudah selesai fulfillment:
 * served, ready, atau preparing (kasir bisa skip served jika langsung bayar).
 * Harus sudah paid.
 */
export function canComplete(status: OrderStatus, paymentStatus: PaymentStatus): boolean {
  if (!isPaid(paymentStatus)) return false;
  return ["preparing", "ready", "served"].includes(status);
}

/**
 * Label bahasa Indonesia untuk order status.
 */
export function getStatusLabel(status: OrderStatus): string {
  const labels: Record<OrderStatus, string> = {
    draft:     "Draft",
    confirmed: "Dikonfirmasi",
    preparing: "Diproses",
    ready:     "Siap Saji",
    served:    "Sudah Disajikan",
    completed: "Selesai",
    cancelled: "Dibatalkan",
  };
  return labels[status] ?? status;
}

export function getPaymentStatusLabel(status: PaymentStatus): string {
  const labels: Record<PaymentStatus, string> = {
    unpaid:  "Belum Bayar",
    partial: "Sebagian",
    paid:    "Lunas",
  };
  return labels[status] ?? status;
}

export function getStatusBadgeColor(
  status: OrderStatus
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "draft":
      return "secondary";
    case "confirmed":
      return "outline";
    case "preparing":
    case "ready":
      return "default";
    case "served":
      return "outline";
    case "completed":
      return "secondary";
    case "cancelled":
      return "destructive";
    default:
      return "default";
  }
}

export function getPaymentBadgeColor(
  status: PaymentStatus
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "unpaid":
      return "destructive";
    case "partial":
      return "outline";
    case "paid":
      return "secondary";
    default:
      return "default";
  }
}

/**
 * Apakah order perlu perhatian kasir?
 * Served + unpaid = perlu ditagih. Preparing/ready + unpaid = perlu diikuti.
 */
export function needsAttention(status: OrderStatus, paymentStatus: PaymentStatus): boolean {
  if (isDraft(status) || isCompleted(status) || isCancelled(status)) return false;
  return !isPaid(paymentStatus);
}
