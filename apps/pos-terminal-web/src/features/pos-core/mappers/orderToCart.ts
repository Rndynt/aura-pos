import type { Product } from "@pos/domain/catalog/types";
import type { OrderLifecycleDto } from "@pos/domain/orders";
import type { CartItem } from "@/hooks/useCart";

export function getProductsById<T extends { id: string }>(products: readonly T[]) {
  return new Map(products.map((product) => [product.id, product]));
}

export type LocalDraftCartItem = Pick<CartItem, "product" | "variant" | "selectedOptions" | "quantity">;

export type LocalDraftOrderForCart = {
  id: string;
  customerName?: string;
  items?: unknown[];
};

export type POSOrderSummaryDto = Pick<OrderLifecycleDto, "id" | "orderNumber" | "order_number" | "tableNumber" | "table_number" | "total" | "total_amount" | "status" | "paymentStatus" | "payment_status"> & {
  lifecycleKind?: string | null;
  lifecycleLabel?: string | null;
  lifecycle?: { lifecycleKind?: string | null } | null;
};

export type POSOrderMutationResultDto = {
  order?: {
    id?: string | number | null;
    order_number?: string | number | null;
    orderNumber?: string | number | null;
    total?: string | number | null;
  } | null;
  pricing?: {
    total_amount?: string | number | null;
    totalAmount?: string | number | null;
  } | null;
};

function isLocalDraftCartItem(item: unknown): item is LocalDraftCartItem {
  return typeof item === "object" && item !== null && "product" in item && "quantity" in item;
}

export function getLocalDraftItems(draft: LocalDraftOrderForCart | null | undefined): LocalDraftCartItem[] {
  return Array.isArray(draft?.items) ? draft.items.filter(isLocalDraftCartItem) : [];
}

export function getPOSOrderIdentity(result: POSOrderMutationResultDto) {
  const order = result.order;
  const id = String(order?.id ?? "");
  const orderNumber = String(order?.order_number ?? order?.orderNumber ?? id);
  return { id, orderNumber };
}

export function getPOSOrderTotal(result: POSOrderMutationResultDto, fallback: number): number {
  return Number(result.order?.total ?? result.pricing?.total_amount ?? result.pricing?.totalAmount ?? fallback);
}

export function hydrateCartItemProductImages(items: CartItem[], products: readonly Product[]) {
  const productsMap = getProductsById(products);
  items.forEach((item) => {
    const fullProduct = productsMap.get(item.product.id);
    if (fullProduct) item.product.image_url = fullProduct.image_url;
  });
}

export function isUnpaidActiveRestaurantOrder(order: POSOrderSummaryDto): boolean {
  const lifecycleKind = order.lifecycleKind ?? order.lifecycle?.lifecycleKind;
  const status = String(order.status ?? "").toLowerCase();
  const paymentStatus = String(order.paymentStatus ?? order.payment_status ?? "").toLowerCase();
  return paymentStatus !== "paid" && status !== "cancelled" && status !== "completed" && lifecycleKind !== "server_draft";
}

export function getPOSOrderDisplaySummary(order: POSOrderSummaryDto) {
  return {
    orderNumber: String(order.order_number ?? order.orderNumber ?? order.id),
    tableNumber: order.tableNumber ?? order.table_number,
    total: Number(order.total ?? order.total_amount ?? 0),
    label: order.lifecycleLabel ?? order.status ?? "active",
  };
}
