export interface KitchenCartItem {
  product: { id: string; name: string };
  variant?: { name?: string };
  quantity: number;
}

export function cartItemsToKitchenTicketItems(items: KitchenCartItem[]) {
  return items.map((item) => ({
    productId: item.product.id,
    name: item.product.name + (item.variant ? ` (${item.variant.name})` : ""),
    quantity: item.quantity,
    variantName: item.variant?.name,
  }));
}
