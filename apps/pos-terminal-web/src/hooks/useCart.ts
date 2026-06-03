import { useState, useEffect, useRef, useMemo } from "react";
import { nanoid } from "nanoid";
import type { Product, ProductVariant } from "@pos/domain/catalog/types";
import type { SelectedOption } from "@pos/domain/orders/types";
import { DEFAULT_TAX_RATE, DEFAULT_SERVICE_CHARGE_RATE } from "@pos/core/pricing";
import { getActiveTenantId, resolveInitialTenantId } from "@/lib/tenant";
import { clearCartSession, migrateLegacySession, saveCartSession } from "@pos/offline";

export interface ItemDiscount {
  type: "percent" | "nominal";
  value: number;
}

export interface CartItem {
  id: string;
  product: Product;
  variant?: ProductVariant;
  selectedOptions: SelectedOption[];
  quantity: number;
  itemTotal: number; // pre-discount base total
  note?: string;
  discount?: ItemDiscount;
}

export interface BackendOrderItem {
  product_id: string;
  product_name: string;
  base_price: number;
  quantity: number;
  variant_id?: string;
  variant_name?: string;
  variant_price_delta?: number;
  selected_options?: SelectedOption[];
  notes?: string;
  discount_type?: string;
  discount_value?: number;
  discount_amount?: number;
}

function serializeOptions(options: SelectedOption[]): string {
  if (!options || options.length === 0) return "";
  const sorted = [...options].sort((a, b) => {
    const groupCompare = a.group_id.localeCompare(b.group_id);
    if (groupCompare !== 0) return groupCompare;
    return a.option_id.localeCompare(b.option_id);
  });
  return sorted.map((opt) => `${opt.group_id}:${opt.option_id}`).join("|");
}

function createItemKey(
  product: Product,
  variant: ProductVariant | undefined,
  selectedOptions: SelectedOption[]
): string {
  const variantPart = variant?.id || "no-variant";
  const optionsPart = serializeOptions(selectedOptions);
  return `${product.id}:${variantPart}:${optionsPart}`;
}

function calculateItemTotal(
  product: Product,
  variant: ProductVariant | undefined,
  selectedOptions: SelectedOption[],
  quantity: number
): number {
  const basePrice = product.base_price;
  const variantDelta = variant?.price_delta || 0;
  const optionsDelta = selectedOptions.reduce((sum, opt) => sum + opt.price_delta, 0);
  return (basePrice + variantDelta + optionsDelta) * quantity;
}

export function getItemEffectiveTotal(item: CartItem): number {
  if (!item.discount || item.discount.value <= 0) return item.itemTotal;
  if (item.discount.type === "percent") {
    return item.itemTotal * (1 - Math.min(item.discount.value, 100) / 100);
  }
  return Math.max(0, item.itemTotal - item.discount.value);
}

export function getItemDiscountAmount(item: CartItem): number {
  return item.itemTotal - getItemEffectiveTotal(item);
}

// ─── Session storage keys ──────────────────────────────────────────────────────
// IMPORTANT: key is scoped by tenantId to prevent cross-tenant cart contamination.
// When tenant A logs out and tenant B logs in (same browser session), each tenant
// reads/writes their own isolated sessionStorage key.
const STORAGE_KEY_PREFIX = "pos_cart_session";

function cartStorageKey(tenantId: string): string {
  return `${STORAGE_KEY_PREFIX}_${tenantId}`;
}

interface CartSession {
  items: CartItem[];
  customerName: string;
  tableNumber: string;
  paymentMethod: PaymentMethod;
  selectedOrderTypeId: string | null;
  orderType: OrderType;
  orderNumber: string;
  orderDiscount: ItemDiscount | null;
}

function loadSession(tenantId: string): CartSession | null {
  try {
    const raw = sessionStorage.getItem(cartStorageKey(tenantId));
    if (!raw) return null;
    return JSON.parse(raw) as CartSession;
  } catch {
    return null;
  }
}

function saveSession(tenantId: string, session: CartSession) {
  try {
    sessionStorage.setItem(cartStorageKey(tenantId), JSON.stringify(session));
  } catch {
    // sessionStorage might be unavailable
  }
}

function clearSession(tenantId: string) {
  try {
    sessionStorage.removeItem(cartStorageKey(tenantId));
  } catch {
    // ignore
  }
}

// ─── Types ─────────────────────────────────────────────────────────────────────
export type PaymentMethod = "cash" | "card" | "ewallet" | "other";
export type OrderType = "dine-in" | "take-away" | "delivery";

// ─── Hook ──────────────────────────────────────────────────────────────────────
export function useCart() {
  const tenantId = getActiveTenantId() || resolveInitialTenantId() || "default";
  const saved = useRef(loadSession(tenantId));

  const [items, setItems] = useState<CartItem[]>(saved.current?.items ?? []);
  const [customerName, setCustomerName] = useState<string>(saved.current?.customerName ?? "");
  const [tableNumber, setTableNumber] = useState<string>(saved.current?.tableNumber ?? "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(saved.current?.paymentMethod ?? "cash");
  const [selectedOrderTypeId, setSelectedOrderTypeId] = useState<string | null>(saved.current?.selectedOrderTypeId ?? null);
  const [orderType, setOrderType] = useState<OrderType>(saved.current?.orderType ?? "dine-in");
  const [orderNumber] = useState<string>(() => {
    if (saved.current?.orderNumber) return saved.current.orderNumber;
    return `#${String(new Date().getTime()).slice(-6)}`;
  });
  const [orderDiscount, setOrderDiscount] = useState<ItemDiscount | null>(
    saved.current?.orderDiscount ?? null
  );

  useEffect(() => {
    let mounted = true;
    migrateLegacySession<CartSession>(tenantId).then((persisted) => {
      if (!mounted || !persisted || saved.current) return;
      setItems(persisted.items ?? []);
      setCustomerName(persisted.customerName ?? "");
      setTableNumber(persisted.tableNumber ?? "");
      setPaymentMethod(persisted.paymentMethod ?? "cash");
      setSelectedOrderTypeId(persisted.selectedOrderTypeId ?? null);
      setOrderType(persisted.orderType ?? "dine-in");
      setOrderDiscount(persisted.orderDiscount ?? null);
    }).catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, [tenantId]);

  // Debounced persist to sessionStorage
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      const session = { items, customerName, tableNumber, paymentMethod, selectedOrderTypeId, orderType, orderNumber, orderDiscount };
      saveSession(tenantId, session);
      saveCartSession(tenantId, session).catch(() => undefined);
    }, 300);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [items, customerName, tableNumber, paymentMethod, selectedOrderTypeId, orderType, orderNumber, orderDiscount]);

  const addItem = (
    product: Product,
    variant?: ProductVariant,
    selectedOptions: SelectedOption[] = [],
    qty: number = 1
  ) => {
    const itemKey = createItemKey(product, variant, selectedOptions);

    setItems((prev) => {
      const existingIndex = prev.findIndex((item) => {
        return createItemKey(item.product, item.variant, item.selectedOptions) === itemKey;
      });

      if (existingIndex >= 0) {
        const newItems = [...prev];
        const newQty = newItems[existingIndex].quantity + qty;
        newItems[existingIndex] = {
          ...newItems[existingIndex],
          quantity: newQty,
          itemTotal: calculateItemTotal(product, variant, selectedOptions, newQty),
        };
        return newItems;
      }

      return [
        ...prev,
        {
          id: nanoid(),
          product,
          variant,
          selectedOptions,
          quantity: qty,
          itemTotal: calculateItemTotal(product, variant, selectedOptions, qty),
          note: "",
        },
      ];
    });
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateQuantity = (id: string, qty: number) => {
    if (qty <= 0) {
      removeItem(id);
      return;
    }
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          quantity: qty,
          itemTotal: calculateItemTotal(item.product, item.variant, item.selectedOptions, qty),
        };
      })
    );
  };

  const updateNote = (id: string, note: string) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, note } : item)));
  };

  const setItemDiscount = (id: string, discount: ItemDiscount | null) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return { ...item, discount: discount ?? undefined };
      })
    );
  };

  const clearCart = () => {
    setItems([]);
    setCustomerName("");
    setTableNumber("");
    setPaymentMethod("cash");
    setSelectedOrderTypeId(null);
    setOrderType("dine-in");
    setOrderDiscount(null);
    clearSession(tenantId);
    clearCartSession().catch(() => undefined);
  };

  const loadOrder = (order: any): string => {
    setTableNumber(order.tableNumber || order.table_number || "");
    setCustomerName(order.customerName || order.customer_name || "");

    const orderItems = order.items || order.orderItems || order.order_items || [];
    const cartItems = orderItems.map((item: any) => {
      const productId = item.productId || item.product_id;
      const productName = item.productName || item.product_name;
      const basePrice = item.unitPrice || item.basePrice || item.base_price || item.unit_price;
      const itemSubtotal =
        item.itemSubtotal || item.subtotal || item.item_subtotal || parseFloat(basePrice || 0) * item.quantity;
      const selectedOpts = item.selectedOptions || item.selected_options || [];

      return {
        id: item.id || `cart-${Math.random()}`,
        product: {
          id: productId,
          name: productName,
          base_price: parseFloat(basePrice || 0),
          image_url: item.imageUrl || item.image_url || item.productImage || "",
        },
        selectedOptions: selectedOpts,
        quantity: item.quantity,
        itemTotal: parseFloat(itemSubtotal || 0),
        note: item.notes || item.note || "",
      };
    });

    setItems(cartItems);
    return order.id;
  };

  const getItemPrice = (item: CartItem): number => {
    const basePrice = item.product.base_price;
    const variantDelta = item.variant?.price_delta || 0;
    const optionsDelta = item.selectedOptions.reduce((sum, opt) => sum + opt.price_delta, 0);
    return basePrice + variantDelta + optionsDelta;
  };

  const toBackendOrderItems = (): BackendOrderItem[] => {
    return items.map((item) => {
      const discountAmount = getItemDiscountAmount(item);
      return {
        product_id: item.product.id,
        product_name: item.product.name,
        base_price: item.product.base_price,
        quantity: item.quantity,
        variant_id: item.variant?.id,
        variant_name: item.variant?.name,
        variant_price_delta: item.variant?.price_delta,
        selected_options: item.selectedOptions.length > 0 ? item.selectedOptions : undefined,
        notes: item.note || undefined,
        discount_type: item.discount?.type,
        discount_value: item.discount?.value,
        discount_amount: discountAmount > 0 ? discountAmount : undefined,
      };
    });
  };

  // ── Totals (memoized) ─────────────────────────────────────────────────────
  const taxRate = DEFAULT_TAX_RATE;
  const serviceChargeRate = DEFAULT_SERVICE_CHARGE_RATE;

  const totals = useMemo(() => {
    const itemsDiscountTotal = items.reduce((sum, item) => sum + getItemDiscountAmount(item), 0);
    const subtotal = items.reduce((sum, item) => sum + getItemEffectiveTotal(item), 0);

    const orderDiscountAmount =
      orderDiscount && orderDiscount.value > 0
        ? orderDiscount.type === "percent"
          ? subtotal * (Math.min(orderDiscount.value, 100) / 100)
          : Math.min(orderDiscount.value, subtotal)
        : 0;

    const discountedSubtotal = subtotal - orderDiscountAmount;

    const tax = discountedSubtotal * taxRate;
    const serviceCharge = discountedSubtotal * serviceChargeRate;
    const total = discountedSubtotal + tax + serviceCharge;

    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

    return { itemsDiscountTotal, subtotal, orderDiscountAmount, discountedSubtotal, tax, serviceCharge, total, itemCount };
  }, [items, orderDiscount, taxRate, serviceChargeRate]);

  return {
    items,
    addItem,
    removeItem,
    updateQuantity,
    updateNote,
    setItemDiscount,
    clearCart,
    loadOrder,
    getItemPrice,
    toBackendOrderItems,
    subtotal: totals.subtotal,
    taxRate,
    serviceChargeRate,
    tax: totals.tax,
    serviceCharge: totals.serviceCharge,
    total: totals.total,
    itemsDiscountTotal: totals.itemsDiscountTotal,
    orderDiscount,
    setOrderDiscount,
    orderDiscountAmount: totals.orderDiscountAmount,
    itemCount: totals.itemCount,
    customerName,
    setCustomerName,
    tableNumber,
    setTableNumber,
    paymentMethod,
    setPaymentMethod,
    selectedOrderTypeId,
    setSelectedOrderTypeId,
    orderType,
    setOrderType,
    orderNumber,
  };
}
