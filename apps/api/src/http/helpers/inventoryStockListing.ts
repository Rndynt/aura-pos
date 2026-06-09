export type StockListProductRow = {
  id: string;
  name: string;
  category: string;
  basePrice: string;
  imageUrl: string | null;
  sku: string | null;
  stockQty: number | null;
  isActive: boolean;
  stockTrackingEnabled: boolean;
};

export type StockListProduct = StockListProductRow & {
  stockQty: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  lowStockThreshold: number;
};

export type StockListSummary = {
  total: number;
  lowStock: number;
  outOfStock: number;
};

export function toStockListResponse(
  rows: StockListProductRow[],
  lowStockThreshold = 10,
): { items: StockListProduct[]; summary: StockListSummary } {
  const items = rows
    .filter((product) => product.stockTrackingEnabled)
    .map((product) => {
      const stockQty = product.stockQty ?? 0;
      return {
        ...product,
        stockQty,
        isLowStock: stockQty < lowStockThreshold,
        isOutOfStock: stockQty <= 0,
        lowStockThreshold,
      };
    });

  return {
    items,
    summary: {
      total: items.length,
      lowStock: items.filter((item) => item.isLowStock && !item.isOutOfStock).length,
      outOfStock: items.filter((item) => item.isOutOfStock).length,
    },
  };
}
