export function getProductsById<T extends { id: string }>(products: T[]) {
  return new Map(products.map((product) => [product.id, product]));
}

export function getLocalDraftItems(draft: { items?: unknown[] } | null | undefined) {
  return Array.isArray(draft?.items) ? draft.items : [];
}
