import { useState, useEffect, useRef, useMemo } from "react";
import { nanoid } from "nanoid";
import type { Product, ProductVariant } from "@pos/domain/catalog/types";
import type { SelectedOption } from "@pos/domain/orders/types";
import type { POSPaymentMethod } from "@pos/domain/payments";
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

// ─── Types ─────────────────────────────────────────────────────────────────────
export type PaymentMethod = POSPaymentMethod;
export type OrderType = "dine-in" | "take-away" | "delivery";

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

function normalizeSessionPaymentMethod(value: unknown): PaymentMethod {
  if (value === "CASH" || value === "MANUAL_TRANSFER" || value === "MANUAL_QRIS") return value;
  return "CASH";
}

function loadSession(tenantId: string): CartSession | null {
  try {
    const raw = sessionStorage.getItem(cartStorageKey(tenantId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CartSession;
    return { ...parsed, paymentMethod: normalizeSessionPaymentMethod(parsed.paymentMethod) };
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

// ─── Hook ──────────────────────────────────────────────────────────────────────
export function useCart() {
  const tenantId = getActiveTenantId() || resolveInitialTenantId() || "default";
  const saved = useRef(loadSession(tenantId));

  const [items, setItems] = useState<CartItem[]>(saved.current?.items ?? []);
  const [customerName, setCustomerName] = useState<string>(saved.current?.customerName ?? "");
  const [tableNumber, setTableNumber] = useState<string>(saved.current?.tableNumber ?? "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(saved.current?.paymentMethod ?? "CASH");
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
      setPaymentMethod(normalizeSessionPaymentMethod(persisted.paymentMethod));
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
    setPaymentMethod("CASH");
    setSelectedOrderTypeId(null);
    setOrderDiscount(null);
    clearSession(tenantId);
  };

  const addItemsFromOrder = (orderItems: Array<{
    product: Product;
    variant?: ProductVariant;
    selectedOptions?: SelectedOption[];
    quantity: number;
    notes?: string;
    discount?: ItemDiscount;
  }>) => {
    orderItems.forEach((item) => {
      addItem(item.product, item.variant, item.selectedOptions ?? [], item.quantity);
    });
  };

  const loadOrder = (order: {
    customerName?: string;
    customer_name?: string;
    tableNumber?: string;
    table_number?: string;
    orderTypeId?: string | null;
    order_type_id?: string | null;
    orderType?: OrderType;
    order_type?: OrderType;
    items?: Array<Record<string, any>>;
    orderItems?: Array<Record<string, any>>;
  }) => {
    const sourceItems = order.items ?? order.orderItems ?? [];
    setItems(sourceItems.map((item) => {
      const selectedOptions = (item.selectedOptions ?? item.selected_options ?? []) as SelectedOption[];
      const product: Product = {
        id: String(item.productId ?? item.product_id ?? item.product?.id ?? ""),
        tenant_id: String(item.tenantId ?? item.tenant_id ?? item.product?.tenant_id ?? ""),
        name: String(item.productName ?? item.product_name ?? item.product?.name ?? "Produk"),
        sku: item.sku ?? item.product?.sku,
        category: item.category ?? item.product?.category ?? "",
        base_price: Number(item.unitPrice ?? item.base_price ?? item.product?.base_price ?? 0),
        cost_price: Number(item.costPrice ?? item.cost_price ?? item.product?.cost_price ?? 0),
        stock_qty: Number(item.stockQty ?? item.stock_qty ?? item.product?.stock_qty ?? 0),
        min_stock: Number(item.minStock ?? item.min_stock ?? item.product?.min_stock ?? 0),
        has_variants: Boolean(item.hasVariants ?? item.has_variants ?? item.product?.has_variants ?? false),
        stock_tracking_enabled: Boolean(item.stockTrackingEnabled ?? item.stock_tracking_enabled ?? item.product?.stock_tracking_enabled ?? false),
        is_active: item.isActive ?? item.is_active ?? item.product?.is_active ?? true,
        created_at: item.createdAt ? new Date(item.createdAt) : new Date(),
        updated_at: item.updatedAt ? new Date(item.updatedAt) : new Date(),
        image_url: item.imageUrl ?? item.image_url ?? item.product?.image_url,
      } as Product;
      const quantity = Number(item.quantity ?? 1);
      return {
        id: String(item.id ?? nanoid()),
        product,
        variant: item.variant,
        selectedOptions,
        quantity,
        itemTotal: Number(item.itemSubtotal ?? item.item_subtotal ?? item.total ?? product.base_price * quantity),
        note: item.notes ?? item.note ?? "",
        discount: item.discount,
      };
    }));
    setCustomerName(order.customerName ?? order.customer_name ?? "");
    setTableNumber(order.tableNumber ?? order.table_number ?? "");
    setSelectedOrderTypeId(order.orderTypeId ?? order.order_type_id ?? null);
    if (order.orderType ?? order.order_type) setOrderType((order.orderType ?? order.order_type) as OrderType);
  };

  const toBackendOrderItems = (): BackendOrderItem[] =>
    items.map((item) => {
      const discountAmount = getItemDiscountAmount(item);
      return {
        product_id: item.product.id,
        product_name: item.product.name,
        base_price: item.product.base_price,
        quantity: item.quantity,
        variant_id: item.variant?.id,
        variant_name: item.variant?.name,
        variant_price_delta: item.variant?.price_delta,
        selected_options: item.selectedOptions,
        notes: item.note,
        discount_type: item.discount?.type,
        discount_value: item.discount?.value,
        discount_amount: discountAmount > 0 ? discountAmount : undefined,
      };
    });

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + getItemEffectiveTotal(item), 0), [items]);
  const itemsDiscountTotal = useMemo(() => items.reduce((sum, item) => sum + getItemDiscountAmount(item), 0), [items]);
  const orderDiscountAmount = useMemo(() => {
    if (!orderDiscount || orderDiscount.value <= 0) return 0;
    if (orderDiscount.type === "percent") return subtotal * (Math.min(orderDiscount.value, 100) / 100);
    return Math.min(orderDiscount.value, subtotal);
  }, [orderDiscount, subtotal]);
  const discountedSubtotal = Math.max(0, subtotal - orderDiscountAmount);
  const taxRate = DEFAULT_TAX_RATE;
  const serviceChargeRate = DEFAULT_SERVICE_CHARGE_RATE;
  const tax = discountedSubtotal * taxRate;
  const serviceCharge = discountedSubtotal * serviceChargeRate;
  const total = discountedSubtotal + tax + serviceCharge;

  return {
    items,
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
    orderDiscount,
    setOrderDiscount,
    addItem,
    removeItem,
    updateQuantity,
    updateNote,
    setItemDiscount,
    clearCart,
    addItemsFromOrder,
    loadOrder,
    toBackendOrderItems,
    subtotal,
    itemsDiscountTotal,
    orderDiscountAmount,
    taxRate,
    tax,
    serviceChargeRate,
    serviceCharge,
    total,
    getItemPrice: getItemEffectiveTotal,
  };
}
