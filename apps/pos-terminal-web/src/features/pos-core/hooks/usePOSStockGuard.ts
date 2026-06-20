import { useMemo } from "react";
import type { Product } from "@pos/domain/catalog/types";

export type POSStockGuardResult = { ok: true } | { ok: false; reason: string };

type CartStockItem = { product: Product; quantity: number };

export function usePOSStockGuard(products: Product[], cartItems: CartStockItem[]) {
  const productById = useMemo(() => {
    const map = new Map<string, Product>();
    for (const product of products) map.set(product.id, product);
    return map;
  }, [products]);

  const cartQuantityByProductId = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cartItems) {
      map.set(item.product.id, (map.get(item.product.id) ?? 0) + item.quantity);
    }
    return map;
  }, [cartItems]);

  const getAvailableQuantity = (product: Product) => {
    const latest = productById.get(product.id) ?? product;
    return {
      latest,
      available:
        typeof latest.availableQuantity === "number"
          ? latest.availableQuantity
          : (latest.stock_qty ?? 0),
    };
  };

  const evaluateStockForAdd = (product: Product, addQty: number): POSStockGuardResult => {
    const { latest, available } = getAvailableQuantity(product);
    if (!latest.is_active) return { ok: false, reason: `${latest.name} sedang tidak tersedia` };
    if (!latest.stock_tracking_enabled) return { ok: true };
    const cartQty = cartQuantityByProductId.get(product.id) ?? 0;
    if (available <= 0) return { ok: false, reason: `Stok ${latest.name} habis di outlet ini.` };
    const remaining = available - cartQty;
    if (addQty > remaining) {
      return { ok: false, reason: `Stok ${latest.name} tidak cukup. Tersedia: ${available}, sudah di cart: ${cartQty}.` };
    }
    return { ok: true };
  };

  const evaluateStockForUpdate = (
    product: Product,
    currentQty: number,
    newQty: number,
  ): POSStockGuardResult => {
    if (newQty <= currentQty) return { ok: true };
    const { latest, available } = getAvailableQuantity(product);
    if (!latest.stock_tracking_enabled) return { ok: true };
    const cartQty = cartQuantityByProductId.get(product.id) ?? 0;
    const required = newQty + (cartQty - currentQty);
    if (available <= 0) return { ok: false, reason: `Stok ${latest.name} habis di outlet ini.` };
    if (required > available) return { ok: false, reason: `Stok ${latest.name} tidak cukup. Tersedia: ${available}.` };
    return { ok: true };
  };

  return { evaluateStockForAdd, evaluateStockForUpdate };
}
