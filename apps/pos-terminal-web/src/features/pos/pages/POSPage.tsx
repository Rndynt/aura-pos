import { useState, useEffect, useMemo, useRef } from "react";
import { useSearch, useLocation } from "wouter";
import { ProductOptionsDialog } from "@/components/pos/ProductOptionsDialog";
import { PaymentMethodDialog } from "@/components/pos/PaymentMethodDialog";
import { CombinedDraftSheet } from "@/components/pos/CombinedDraftSheet";
import type { PaymentMethod, OrderType } from "@/hooks/useCart";
import { useCart } from "@/hooks/useCart";
import {
  useProducts,
  useCreateOrder,
  useUpdateOrder,
  useCreateKitchenTicket,
  useOrderTypes,
  useRecordPayment,
  useOrders,
  useCreateAndPay,
} from "@/lib/api/hooks";
import { useOfflineOrderSubmit } from "@/hooks/useOfflineOrderSubmit";
import type { Product, ProductVariant } from "@pos/domain/catalog/types";
import type { SelectedOption, Order } from "@pos/domain/orders/types";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { getActiveTenantId } from "@/lib/tenant";
import { useTenant } from "@/context/TenantContext";
import { useTenantProfile } from "@/hooks/api/useTenantProfile";
import { toCFDItem } from "@/hooks/useCustomerDisplay";
import {
  saveLocalDraftOrder,
  getOrCreateTerminalIdentity,
  enqueueLocalKitchenTicket,
} from "@pos/offline";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useKitchenChannelSender } from "@/hooks/useKitchenChannel";
import { cartToOrderPayload } from "../mappers/cartToOrderPayload";
import {
  buildCompletedCFDPayload,
  buildPaymentCFDPayload,
} from "../mappers/cfdPayloadMapper";
import { cartItemsToKitchenTicketItems } from "../mappers/kitchenTicketPayloadMapper";
import { getLocalDraftItems, getProductsById } from "../mappers/orderToCart";
import { buildReceiptPayload } from "../mappers/receiptPayloadMapper";
import {
  fetchOrderForPOS,
  updatePOSOrderStatus,
} from "../services/posOrderService";
import {
  isTrueServerDraft,
  type POSLifecycleOrder,
} from "../services/orderLifecycle";

import {
  enqueueReceiptPrintJob,
  hasPairedReceiptPrinter,
  markReceiptPrintFailed,
  printReceiptNow,
} from "../services/posPrinterService";
import { usePOSCustomerDisplayFlow } from "../hooks/usePOSCustomerDisplayFlow";
import { usePOSOrderQueueInvalidation } from "../hooks/usePOSOrderQueueFlow";
import { useCloseMobileCartOnDesktop } from "../hooks/usePOSResponsiveFlow";
import { POSLayout } from "../components/POSLayout";
import { ProductSection } from "../components/ProductSection";
import { CartSection, MobileCartSection } from "../components/CartSection";

export default function POSPage() {
  const searchParams = useSearch();
  const urlParams = new URLSearchParams(searchParams);
  const continueOrderId = urlParams.get("continueOrderId");
  const [, setLocation] = useLocation();

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [combinedDraftOpen, setCombinedDraftOpen] = useState(false);
  const [isKitchenSending, setIsKitchenSending] = useState(false);
  const [isProcessingQuickCharge, setIsProcessingQuickCharge] = useState(false);
  const [isDraftSaving, setIsDraftSaving] = useState(false);
  const [paymentMethodDialogOpen, setPaymentMethodDialogOpen] = useState(false);
  const [pendingOrderForPayment, setPendingOrderForPayment] = useState<{
    orderId: string;
    totalAmount: number;
    orderNumber: string;
  } | null>(null);
  const cart = useCart();
  const { can } = useTenant();
  // Product variants / options are base catalog behavior — never commercially gated.
  const hasProductVariants = true;
  const hasPairedPrinter = hasPairedReceiptPrinter();
  const shouldAutoPrintReceipt = hasPairedPrinter; // browser print disabled — only auto-print when BT printer is actually paired
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { isOnline } = useNetworkStatus();
  const { sendToKDS } = useKitchenChannelSender(can("restaurant_kitchen_ops"));
  const { tenantId } = useTenant();
  const { data: tenantProfile } = useTenantProfile(tenantId);
  // `can` is destructured above from useTenant().
  const tenantName = tenantProfile?.tenant?.name || "AuraPOS";

  // Prevent cart-change effect from overriding payment/completed CFD state
  const inPaymentFlowRef = useRef(false);

  const { sendToCFD } = usePOSCustomerDisplayFlow({
    cart,
    tenantName,
    inPaymentFlowRef,
    enabled: can("customer_display"),
  });

  // Auto-close mobile cart drawer when switching to tablet/desktop
  useCloseMobileCartOnDesktop(isMobile, setMobileCartOpen);

  // Fetch products from backend (including inactive products to show with overlay)
  const {
    data: productsData,
    isLoading: productsLoading,
    error: productsError,
  } = useProducts();
  const products = productsData?.products || [];

  // ── Outlet-aware stock guards (P5) ──────────────────────────────────────────
  // Map of latest product-by-id so cart actions consult the freshest stock
  // (rather than stale `item.product` snapshots).
  const productById = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products) map.set(p.id, p);
    return map;
  }, [products]);

  // Aggregate cart quantity per product (sum across variants/options).
  const cartQuantityByProductId = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cart.items) {
      map.set(item.product.id, (map.get(item.product.id) ?? 0) + item.quantity);
    }
    return map;
  }, [cart.items]);

  /**
   * Validates whether `addQty` units of `product` may be added to the cart given
   * the current outlet stock and existing cart quantity for the same product.
   * Returns `{ ok: true }` for non-tracked products, otherwise either
   * `{ ok: true }` or `{ ok: false, reason }` with a user-facing message.
   */
  const evaluateStockForAdd = (
    product: Product,
    addQty: number,
  ): { ok: true } | { ok: false; reason: string } => {
    const latest = productById.get(product.id) ?? product;
    if (!latest.stock_tracking_enabled) return { ok: true };
    const available =
      typeof latest.availableQuantity === "number"
        ? latest.availableQuantity
        : (latest.stock_qty ?? 0);
    const cartQty = cartQuantityByProductId.get(product.id) ?? 0;
    if (available <= 0) {
      return { ok: false, reason: `Stok ${latest.name} habis di outlet ini.` };
    }
    const remaining = available - cartQty;
    if (addQty > remaining) {
      return {
        ok: false,
        reason: `Stok ${latest.name} tidak cukup. Tersedia: ${available}, sudah di cart: ${cartQty}.`,
      };
    }
    return { ok: true };
  };

  /**
   * Validates an in-cart quantity change (e.g. +/- buttons). `newQty` is the
   * target value; `currentQty` is the qty already held by this cart row so it
   * is excluded from the "already in cart" tally.
   */
  const evaluateStockForUpdate = (
    product: Product,
    currentQty: number,
    newQty: number,
  ): { ok: true } | { ok: false; reason: string } => {
    if (newQty <= currentQty) return { ok: true };
    const latest = productById.get(product.id) ?? product;
    if (!latest.stock_tracking_enabled) return { ok: true };
    const available =
      typeof latest.availableQuantity === "number"
        ? latest.availableQuantity
        : (latest.stock_qty ?? 0);
    const cartQty = cartQuantityByProductId.get(product.id) ?? 0;
    const required = newQty + (cartQty - currentQty);
    if (available <= 0) {
      return { ok: false, reason: `Stok ${latest.name} habis di outlet ini.` };
    }
    if (required > available) {
      return {
        ok: false,
        reason: `Stok ${latest.name} tidak cukup. Tersedia: ${available}.`,
      };
    }
    return { ok: true };
  };

  // Fetch orders for queue display
  const { data: ordersData, refetch: refetchOrders } = useOrders(undefined, {
    refetchInterval: false, // SSE handles real-time updates; polling disabled to avoid redundant API calls
  });
  const orders: Order[] = ordersData?.orders || [];

  // SSE selalu aktif tanpa peduli feature flag — supaya draft/meja selalu real-time
  usePOSOrderQueueInvalidation(can("orders_queue"));

  // Fetch order types for tenant
  const { data: orderTypes, isLoading: orderTypesLoading } = useOrderTypes();

  // Filter only active order types - defensive check even though API already filters
  const activeOrderTypes = useMemo(() => {
    return orderTypes?.filter((ot) => ot.isActive === true) || [];
  }, [orderTypes]);

  // Load order into cart if continueOrderId is provided
  const loadedOrderRef = useRef<string | null>(null);

  useEffect(() => {
    if (continueOrderId && loadedOrderRef.current !== continueOrderId) {
      loadedOrderRef.current = continueOrderId;

      const loadOrderIntoCart = async () => {
        try {
          const fullOrder = await fetchOrderForPOS(continueOrderId);

          if (!isTrueServerDraft(fullOrder as POSLifecycleOrder)) {
            cart.clearCart();
            toast({
              title: "Pesanan sudah aktif",
              description:
                "Pesanan sudah aktif/diproses dan tidak bisa diedit dari keranjang. Gunakan Bayar atau Lihat Detail.",
              variant: "destructive",
            });
            setLocation("/pos");
            return;
          }

          // Clear cart first to remove any stale data
          cart.clearCart();

          // Load order into cart with fresh state
          cart.loadOrder(fullOrder);

          // Enrich cart items with full product data (including images) from fetched products
          const productsMap = getProductsById(products as any[]);
          cart.items.forEach((item: any) => {
            const fullProduct = productsMap.get(item.product.id);
            if (fullProduct) {
              item.product.image_url = fullProduct.image_url;
            }
          });

          toast({
            title: "Order loaded",
            description: `Order #${fullOrder.orderNumber} for Table ${fullOrder.tableNumber} loaded. Continue editing and submit to save changes.`,
          });
        } catch (error) {
          console.error("Error loading order:", error);
          toast({
            title: "Error loading order",
            description: "Failed to load order into cart",
            variant: "destructive",
          });
        }
      };
      loadOrderIntoCart();
    }
  }, [continueOrderId]);

  // Auto-select first ACTIVE order type when loaded (only if not already in cart)
  // Also sync cart.orderType so the visual selection matches the selected order type ID
  useEffect(() => {
    if (
      !orderTypesLoading &&
      activeOrderTypes.length > 0 &&
      !cart.selectedOrderTypeId
    ) {
      const firstType = activeOrderTypes[0];
      cart.setSelectedOrderTypeId(firstType.id);
      const code = firstType.code.toLowerCase().replace(/_/g, "-") as OrderType;
      cart.setOrderType(code);
    }
  }, [activeOrderTypes, orderTypesLoading, cart]);

  // Mutations
  const createOrderMutation = useCreateOrder();
  const updateOrderMutation = useUpdateOrder();
  const createKitchenTicketMutation = useCreateKitchenTicket();
  const recordPaymentMutation = useRecordPayment();
  const createAndPayMutation = useCreateAndPay();
  const { submitOrder, isSubmitting: isOfflineSubmitting } =
    useOfflineOrderSubmit();

  const hasPartialPayment = can("payments_partial_payment");
  const hasMultiPayment = can("payments_multi_payment");
  const hasSplitBill =
    can("payments_split_bill") || can("payments_split_payment");
  const hasKitchenTicket = can("restaurant_kitchen_ops");

  const ensureCartHasItems = () => {
    if (cart.items.length === 0) {
      toast({
        title: "Cart is empty",
        description: "Please add items to the cart before continuing",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const validateOrderType = () => {
    if (!cart.selectedOrderTypeId) {
      toast({
        title: "Order type required",
        description: "Please select an order type before continuing",
        variant: "destructive",
      });
      return false;
    }

    // Validate that selected order type is active
    const isValidOrderType = activeOrderTypes.some(
      (ot) => ot.id === cart.selectedOrderTypeId,
    );
    if (!isValidOrderType) {
      toast({
        title: "Invalid order type",
        description:
          "The selected order type is no longer available. Please select a valid order type.",
        variant: "destructive",
      });
      cart.setSelectedOrderTypeId(null);
      return false;
    }

    return true;
  };

  const buildOrderPayload = () =>
    cartToOrderPayload({
      items: cart.toBackendOrderItems(),
      taxRate: cart.taxRate,
      serviceChargeRate: cart.serviceChargeRate,
      selectedOrderTypeId: cart.selectedOrderTypeId,
      customerName: cart.customerName,
      tableNumber: cart.tableNumber,
      orderDiscount: cart.orderDiscount,
      orderDiscountAmount: cart.orderDiscountAmount,
      itemsDiscountTotal: cart.itemsDiscountTotal,
    });

  const handleAddToCart = (product: Product) => {
    // Block adding unavailable products to cart
    if (!product.is_active) {
      toast({
        description: `${product.name} sedang tidak tersedia`,
        variant: "info",
      });
      return;
    }

    // P5: Outlet stock guard — block tracked products without sufficient stock
    // at the active outlet before they ever enter the cart.
    const stockCheck = evaluateStockForAdd(product, 1);
    if (!stockCheck.ok) {
      toast({
        title: "Stok tidak cukup",
        description: stockCheck.reason,
        variant: "destructive",
      });
      return;
    }

    // Check if product has variants or option_groups that require selection
    const hasVariants =
      product.has_variants && product.variants && product.variants.length > 0;
    const hasOptionGroups =
      product.option_groups && product.option_groups.length > 0;

    if ((hasVariants || hasOptionGroups) && hasProductVariants) {
      // Show dialog for variant/option selection
      setSelectedProduct(product);
    } else {
      // Add directly to cart with no options (or feature disabled)
      cart.addItem(product, undefined, [], 1);
      toast({
        title: "Added to cart",
        description: `${product.name} added to cart`,
      });
    }
  };

  const handleVariantAdd = (
    product: Product,
    variant: ProductVariant | undefined,
    selectedOptions: SelectedOption[],
    qty: number,
  ) => {
    // P5: Same outlet stock guard for the variant/options dialog path.
    // Variants share the underlying product balance, so the check applies on
    // the product as a whole, not per-variant.
    const stockCheck = evaluateStockForAdd(product, qty);
    if (!stockCheck.ok) {
      toast({
        title: "Stok tidak cukup",
        description: stockCheck.reason,
        variant: "destructive",
      });
      return;
    }
    cart.addItem(product, variant, selectedOptions, qty);
    setSelectedProduct(null);

    // Build description with variant and options
    let description = product.name;
    if (variant) {
      description += ` (${variant.name})`;
    }
    if (selectedOptions.length > 0) {
      const optionsText = selectedOptions
        .map((opt) => opt.option_name)
        .join(", ");
      description += ` - ${optionsText}`;
    }

    toast({
      title: "Added to cart",
      description,
    });
  };

  const handleUpdateContinueOrder = async () => {
    if (!ensureCartHasItems()) {
      return;
    }

    if (!continueOrderId) {
      toast({
        title: "Error",
        description: "No order ID found",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsProcessingQuickCharge(true);

      const items = cart.toBackendOrderItems();

      const orderPayload = {
        items,
        tax_rate: cart.taxRate,
        service_charge_rate: cart.serviceChargeRate,
        order_type_id: cart.selectedOrderTypeId,
        customer_name: cart.customerName || undefined,
        table_number: cart.tableNumber || undefined,
      };

      // Update the existing order
      const orderResult = await updateOrderMutation.mutateAsync({
        orderId: continueOrderId,
        ...orderPayload,
      });

      setIsProcessingQuickCharge(false);
      toast({
        title: "Order updated",
        description: `Order updated successfully`,
      });

      cart.clearCart();
      setMobileCartOpen(false);
    } catch (error) {
      console.error("🔴 [UPDATE] Error caught:", error);

      let errorMessage = "Failed to update order";
      if (error instanceof Error) {
        errorMessage = error.message;
        console.error("🔴 [UPDATE] Error message:", errorMessage);
      }
      const apiError = error as any;
      if (apiError?.response?.data?.message) {
        errorMessage = apiError.response.data.message;
      } else if (apiError?.body?.message) {
        errorMessage = apiError.body.message;
      }

      setIsProcessingQuickCharge(false);
      toast({
        title: "Update failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleCharge = async () => {
    if (!ensureCartHasItems()) return;

    // Continued server drafts are paid by updating the draft first, then
    // recording payment against the same order in handlePaymentMethodConfirm.
    if (continueOrderId) {
      setPaymentMethodDialogOpen(true);
      setMobileCartOpen(false);
      return;
    }

    // Auto-select first order type if none selected
    if (!cart.selectedOrderTypeId && activeOrderTypes.length > 0) {
      cart.setSelectedOrderTypeId(activeOrderTypes[0].id);
    }

    // Buka dialog dulu — CFD akan diupdate saat user memilih metode bayar
    setPaymentMethodDialogOpen(true);
    setMobileCartOpen(false);
  };

  // Saat user MEMILIH metode di dialog (sebelum konfirmasi) → CFD langsung update
  // Sehingga layar customer langsung lihat QR QRIS saat kasir klik QRIS di sidebar
  const handleCFDMethodChange = (method: PaymentMethod) => {
    if (!cart.items.length) return;
    inPaymentFlowRef.current = true;
    sendToCFD(
      buildPaymentCFDPayload(
        {
          tenantName,
          orderNumber:
            pendingOrderForPayment?.orderNumber || cart.orderNumber || "",
          total: pendingOrderForPayment?.totalAmount || cart.total,
          items: cart.items.map(toCFDItem),
          subtotal: cart.subtotal,
          tax: cart.tax,
          serviceCharge: cart.serviceCharge,
          customerName: cart.customerName || undefined,
          tableNumber: cart.tableNumber || undefined,
        },
        method,
      ),
    );
  };

  // Handle payment method confirmation from dialog
  const handlePaymentMethodConfirm = async (
    paymentMethod: PaymentMethod,
    _cashReceived?: number,
    partialAmount?: number,
  ) => {
    // ── SETTLE EXISTING PARTIAL ORDER ───────────────────────────────────────
    // When pendingOrderForPayment is set the cashier is settling the remaining
    // balance of an already-existing partial order. No new order is created;
    // payment goes directly against the existing order via the record-payment
    // endpoint. This path bypasses cart validation entirely.
    if (pendingOrderForPayment) {
      setIsProcessingQuickCharge(true);
      const fmtRp = (n: number) =>
        new Intl.NumberFormat("id-ID", {
          style: "currency",
          currency: "IDR",
          minimumFractionDigits: 0,
        }).format(n);
      try {
        await recordPaymentMutation.mutateAsync({
          orderId: pendingOrderForPayment.orderId,
          amount: pendingOrderForPayment.totalAmount,
          payment_method: paymentMethod,
          payment_flow: "full_payment",
        });
        toast({
          title: "Pembayaran berhasil",
          description: `Order #${pendingOrderForPayment.orderNumber} — Dilunasi: ${fmtRp(pendingOrderForPayment.totalAmount)}`,
        });
        setPendingOrderForPayment(null);
        setPaymentMethodDialogOpen(false);
        setLocation("/pos");
      } catch (error) {
        toast({
          title: "Pembayaran gagal",
          description:
            error instanceof Error
              ? error.message
              : "Gagal mencatat pembayaran",
          variant: "destructive",
        });
      } finally {
        setIsProcessingQuickCharge(false);
      }
      return;
    }

    if (continueOrderId) {
      if (!ensureCartHasItems()) return;
      setIsProcessingQuickCharge(true);
      try {
        const orderPayload = buildOrderPayload();
        const updateResult = await updateOrderMutation.mutateAsync({
          orderId: continueOrderId,
          ...orderPayload,
        });
        const totalAmount = Number(
          (updateResult.order as any)?.total ??
            (updateResult.pricing as any)?.total_amount ??
            cart.total,
        );
        await recordPaymentMutation.mutateAsync({
          orderId: continueOrderId,
          amount: totalAmount,
          payment_method: paymentMethod,
          payment_flow: "full_payment",
        });
        toast({
          title: "Pembayaran berhasil",
          description: `Draft server #${(updateResult.order as any)?.order_number ?? continueOrderId} sudah dilunasi.`,
        });
        cart.clearCart();
        setPaymentMethodDialogOpen(false);
        setLocation("/pos");
      } catch (error) {
        toast({
          title: "Pembayaran gagal",
          description:
            error instanceof Error
              ? error.message
              : "Gagal memperbarui dan membayar draft server",
          variant: "destructive",
        });
      } finally {
        setIsProcessingQuickCharge(false);
      }
      return;
    }

    if (!ensureCartHasItems()) return;

    // ── PARTIAL PAYMENT (DP) FLOW ────────────────────────────────────────────
    // Use atomic create-and-pay so the order starts as confirmed immediately;
    // the 2-step createOrder→recordPayment pattern left orders as draft.
    if (partialAmount !== undefined) {
      setIsProcessingQuickCharge(true);
      const cfdOrderNumber = cart.orderNumber;

      // Auto-select order type if needed
      if (!cart.selectedOrderTypeId && activeOrderTypes.length > 0) {
        cart.setSelectedOrderTypeId(activeOrderTypes[0].id);
      }

      try {
        const orderPayload = buildOrderPayload();
        const createResult = await createAndPayMutation.mutateAsync({
          ...orderPayload,
          amount: partialAmount,
          payment_method: paymentMethod,
          payment_flow: "partial_payment_dp",
        });
        const orderId = createResult.order?.id;
        const orderNumber = createResult.order?.order_number || cfdOrderNumber;
        const remainingAmount = createResult.remainingAmount ?? 0;

        // Kirim ke dapur jika fitur aktif — pesanan tetap perlu disiapkan meski belum lunas
        if (hasKitchenTicket && orderId) {
          try {
            await handleSendToKitchen(orderId);
          } catch {
            /* non-critical */
          }
        }

        const fmtRp = (n: number) =>
          new Intl.NumberFormat("id-ID", {
            style: "currency",
            currency: "IDR",
            minimumFractionDigits: 0,
          }).format(n);
        toast({
          title: "DP berhasil dicatat",
          description: `Order #${orderNumber} — Dibayar: ${fmtRp(partialAmount)}, Sisa: ${fmtRp(remainingAmount)}${hasKitchenTicket ? " · Dikirim ke dapur" : ""}`,
        });

        cart.clearCart();
        setPaymentMethodDialogOpen(false);
      } catch (error) {
        toast({
          title: "Gagal mencatat DP",
          description:
            error instanceof Error
              ? error.message
              : "Gagal mencatat pembayaran",
          variant: "destructive",
        });
      } finally {
        setIsProcessingQuickCharge(false);
      }
      return;
    }

    // ── FULL PAYMENT FLOW ────────────────────────────────────────────────────
    if (!cart.selectedOrderTypeId) return;

    // Snapshot cart before clearing
    const cfdItems = cart.items.map(toCFDItem);
    const cfdSubtotal = cart.subtotal;
    const cfdTax = cart.tax;
    const cfdServiceCharge = cart.serviceCharge;
    const cfdTotal = cart.total;
    const cfdCustomerName = cart.customerName || undefined;
    const cfdTableNumber = cart.tableNumber || undefined;
    const cfdOrderNumber = cart.orderNumber;

    // Lock CFD so cart-change effect won't override payment/completed state
    inPaymentFlowRef.current = true;

    // Update CFD dengan metode bayar yang dipilih
    sendToCFD(
      buildPaymentCFDPayload(
        {
          tenantName,
          orderNumber: cfdOrderNumber || "",
          total: cfdTotal,
          items: cfdItems,
          subtotal: cfdSubtotal,
          tax: cfdTax,
          serviceCharge: cfdServiceCharge,
          customerName: cfdCustomerName,
          tableNumber: cfdTableNumber,
        },
        paymentMethod,
      ),
    );

    setIsProcessingQuickCharge(true);
    try {
      const totalAmount = cfdTotal;
      const orderResult = await submitOrder({
        items: cart.toBackendOrderItems(),
        tax_rate: cart.taxRate,
        service_charge_rate: cart.serviceChargeRate,
        order_type_id: cart.selectedOrderTypeId ?? undefined,
        customer_name: cfdCustomerName,
        table_number: cfdTableNumber,
        amount: totalAmount,
        payment_method: paymentMethod,
      });
      const orderNumber =
        (orderResult.order as any)?.order_number || orderResult.order?.id;
      const isLocal = (orderResult as any).isLocal === true;

      // Broadcast: pembayaran selesai
      sendToCFD(
        buildCompletedCFDPayload(
          {
            tenantName,
            orderNumber: String(orderNumber ?? cfdOrderNumber),
            total: totalAmount,
            items: cfdItems,
            subtotal: cfdSubtotal,
            tax: cfdTax,
            serviceCharge: cfdServiceCharge,
            customerName: cfdCustomerName,
          },
          totalAmount,
          0,
        ),
      );

      toast({
        title: isLocal
          ? "Pesanan tersimpan (OFFLINE)"
          : "Pesanan berhasil dibuat & dibayar",
        description: isLocal
          ? `Order #${orderNumber} disimpan lokal — akan tersinkron saat online`
          : `Order #${orderNumber} - Total: Rp ${totalAmount.toLocaleString("id-ID")} (${paymentMethod})`,
      });

      const receiptPayload = buildReceiptPayload({
        orderNumber: String(orderNumber ?? cfdOrderNumber),
        tenantName,
        customerName: cfdCustomerName,
        tableNumber: cfdTableNumber,
        paymentMethod,
        subtotal: cfdSubtotal,
        tax: cfdTax,
        serviceCharge: cfdServiceCharge,
        total: cfdTotal,
        items: cfdItems,
      });

      let printJobId: string | null = null;
      try {
        const {
          jobId: queuedPrintJobId,
          tenantId: qTenantId,
          terminalId,
        } = await enqueueReceiptPrintJob({
          localOrderId: (orderResult.order as any)?.localId,
          orderNumber: String(orderNumber ?? cfdOrderNumber),
          payload: receiptPayload,
        });
        printJobId = queuedPrintJobId;

        // ── Offline kitchen ticket ──────────────────────────────────────────
        // When the order was saved locally (isLocal) AND kitchen feature is on,
        // enqueue a local kitchen ticket so the KDS tab on this device shows it.
        if (isLocal && hasKitchenTicket) {
          try {
            const kitchenTicket = await enqueueLocalKitchenTicket({
              tenantId: qTenantId,
              terminalId: terminalId,
              localOrderId:
                (orderResult.order as any)?.localId ?? String(orderNumber),
              orderNumber: String(orderNumber ?? cfdOrderNumber),
              items: cartItemsToKitchenTicketItems(cart.items),
              customerName: cfdCustomerName,
              tableNumber: cfdTableNumber,
            });
            sendToKDS({ type: "ticket_added", ticket: kitchenTicket });
          } catch {
            // Non-critical — KDS best-effort
          }
        }
      } catch {
        // Non-critical — print queue is best-effort
      }

      if (shouldAutoPrintReceipt) {
        try {
          await printReceiptNow(printJobId, receiptPayload);
          toast({
            title: "Struk tercetak",
            description: `Order #${orderNumber} berhasil dicetak ke printer bluetooth`,
          });
        } catch (printError) {
          await markReceiptPrintFailed(printJobId, printError);
          toast({
            title: "Pembayaran sukses, cetak struk gagal",
            description:
              "Struk disimpan di antrian cetak — buka Printer Hub untuk cetak ulang.",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Pembayaran sukses",
          description:
            "Struk tersimpan di antrian cetak. Buka Printer Hub untuk cetak.",
        });
      }

      // Kembali ke idle setelah 7 detik — release lock lalu kirim idle
      setTimeout(() => {
        inPaymentFlowRef.current = false;
        sendToCFD({ type: "idle", tenantName });
      }, 7000);

      // Clear everything and close
      cart.clearCart();
      setPendingOrderForPayment(null);
      setPaymentMethodDialogOpen(false);
    } catch (error) {
      let errorMessage = "Gagal membuat pesanan dan mencatat pembayaran";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      const apiError = error as any;
      if (apiError?.response?.data?.message) {
        errorMessage = apiError.response.data.message;
      } else if (apiError?.body?.message) {
        errorMessage = apiError.body.message;
      }

      console.error("Payment confirmation error:", error);

      // Release CFD lock — send back to ordering state
      inPaymentFlowRef.current = false;
      sendToCFD({
        type: "ordering",
        tenantName,
        orderNumber: cfdOrderNumber || "",
        items: cfdItems,
        subtotal: cfdSubtotal,
        tax: cfdTax,
        serviceCharge: cfdServiceCharge,
        total: cfdTotal,
        customerName: cfdCustomerName,
        tableNumber: cfdTableNumber,
      });

      toast({
        title: "Pembayaran gagal",
        description: errorMessage,
        variant: "destructive",
      });
      setPaymentMethodDialogOpen(false);
    } finally {
      setIsProcessingQuickCharge(false);
    }
  };

  const handleUpdateOrderStatus = async (
    orderId: string,
    newStatus: string,
  ) => {
    try {
      await updatePOSOrderStatus(orderId, newStatus);

      // Refetch orders to update queue
      await refetchOrders();
    } catch (error) {
      console.error("Error updating order status:", error);
      toast({
        title: "Gagal",
        description: "Gagal memperbarui status order",
        variant: "destructive",
      });
    }
  };

  // Save as Draft - NO kitchen ticket dependency
  const handleSaveDraft = async () => {
    if (!ensureCartHasItems()) return;
    setIsDraftSaving(true);

    // Auto-select first order type if none selected (no dialog needed)
    if (!cart.selectedOrderTypeId && activeOrderTypes.length > 0) {
      cart.setSelectedOrderTypeId(activeOrderTypes[0].id);
    }

    // Still validate order type but now it should always pass
    if (!cart.selectedOrderTypeId) {
      toast({
        title: "Tipe pesanan diperlukan",
        description: "Tidak ada tipe pesanan tersedia. Hubungi administrator.",
        variant: "destructive",
      });
      return;
    }

    try {
      let orderResult;

      // If continuing an order, update it; otherwise create new
      if (continueOrderId) {
        orderResult = await updateOrderMutation.mutateAsync({
          orderId: continueOrderId,
          ...buildOrderPayload(),
        });

        toast({
          title: "Pesanan diperbarui",
          description: `Order #${orderResult.order?.order_number || orderResult.order?.id || "N/A"} berhasil diperbarui`,
        });
      } else {
        orderResult =
          await createOrderMutation.mutateAsync(buildOrderPayload());

        toast({
          title: "Pesanan disimpan",
          description: `Order #${orderResult.order?.order_number || orderResult.order?.id || "N/A"} berhasil disimpan sebagai draft`,
        });
      }

      cart.clearCart();
      setMobileCartOpen(false);
      if (continueOrderId) setLocation("/pos");
    } catch (error) {
      const isNetworkError =
        error instanceof TypeError ||
        (error instanceof Error && /network|fetch/i.test(error.message));

      if (isNetworkError) {
        try {
          const draft = await saveLocalDraftOrder({
            tenantId,
            customerName: cart.customerName || undefined,
            tableNumber: cart.tableNumber || undefined,
            items: cart.items,
            total: cart.total,
          });

          toast({
            title: "Draft lokal disimpan",
            description: `Koneksi bermasalah. Draft #${draft.id.slice(0, 8)} disimpan di perangkat ini.`,
          });

          cart.clearCart();
          setMobileCartOpen(false);
          return;
        } catch {
          // fallback to generic API error toast
        }
      }

      toast({
        title: "Gagal menyimpan pesanan",
        description:
          error instanceof Error ? error.message : "Gagal membuat pesanan",
        variant: "destructive",
      });
    } finally {
      setIsDraftSaving(false);
    }
  };

  // Confirm & Send to Kitchen — saves order then immediately sends to kitchen, no dialog
  const handleConfirmAndKitchen = async () => {
    if (!ensureCartHasItems()) return;
    setIsKitchenSending(true);

    if (!cart.selectedOrderTypeId && activeOrderTypes.length > 0) {
      cart.setSelectedOrderTypeId(activeOrderTypes[0].id);
    }

    if (!cart.selectedOrderTypeId) {
      toast({
        title: "Tipe pesanan diperlukan",
        description: "Tidak ada tipe pesanan tersedia. Hubungi administrator.",
        variant: "destructive",
      });
      setIsKitchenSending(false);
      return;
    }

    try {
      let orderResult;
      if (continueOrderId) {
        orderResult = await updateOrderMutation.mutateAsync({
          orderId: continueOrderId,
          ...buildOrderPayload(),
        });
      } else {
        orderResult =
          await createOrderMutation.mutateAsync(buildOrderPayload());
      }

      const savedOrderId: string | null = orderResult?.order?.id ?? null;
      if (savedOrderId) {
        await handleSendToKitchen(savedOrderId);
      }

      cart.clearCart();
      setMobileCartOpen(false);
      if (continueOrderId) setLocation("/pos");
    } catch (error) {
      toast({
        title: "Gagal kirim ke dapur",
        description:
          error instanceof Error
            ? error.message
            : "Gagal mengirim pesanan ke dapur",
        variant: "destructive",
      });
    } finally {
      setIsKitchenSending(false);
    }
  };

  const handleResumeLocalDraft = (draft: any) => {
    cart.clearCart();
    cart.setCustomerName(draft.customerName || "");
    cart.setTableNumber(draft.tableNumber || "");
    const localItems = getLocalDraftItems(draft);
    localItems.forEach((item: any) => {
      if (!item?.product) return;
      cart.addItem(
        item.product,
        item.variant,
        item.selectedOptions || [],
        item.quantity || 1,
      );
    });
    toast({
      title: "Draft lokal dimuat",
      description: `Draft LOCAL-${String(draft.id).slice(0, 8)} siap dilanjutkan.`,
    });
  };
  const handleSendToKitchen = async (orderId: string) => {
    if (!hasKitchenTicket) {
      toast({
        title: "Fitur tidak tersedia",
        description: "Kitchen ticket tidak aktif untuk tenant ini",
        variant: "destructive",
      });
      return;
    }

    // ── Offline fallback: save as local kitchen ticket ──────────────────────
    if (!isOnline) {
      try {
        const qTenantId = getActiveTenantId();
        const terminal = await getOrCreateTerminalIdentity(qTenantId);
        const kitchenTicket = await enqueueLocalKitchenTicket({
          tenantId: qTenantId,
          terminalId: terminal.terminalId,
          localOrderId: orderId,
          orderNumber: cart.orderNumber || orderId.slice(0, 8),
          items: cartItemsToKitchenTicketItems(cart.items),
          customerName: cart.customerName || undefined,
          tableNumber: cart.tableNumber || undefined,
        });
        sendToKDS({ type: "ticket_added", ticket: kitchenTicket });
        toast({
          title: "Tiket dapur disimpan lokal",
          description:
            "Offline — tiket dikirim ke KDS di perangkat ini. Akan tersinkron saat online.",
        });
      } catch (err) {
        toast({
          title: "Gagal menyimpan tiket dapur",
          description:
            err instanceof Error ? err.message : "Gagal membuat tiket lokal",
          variant: "destructive",
        });
      }
      return;
    }

    // ── Online: send to server ──────────────────────────────────────────────
    try {
      await createKitchenTicketMutation.mutateAsync({ orderId });
      toast({
        title: "Dikirim ke Dapur",
        description: "Pesanan berhasil dikirim ke dapur",
      });
      await refetchOrders();
    } catch (error) {
      toast({
        title: "Gagal mengirim ke dapur",
        description:
          error instanceof Error
            ? error.message
            : "Gagal membuat kitchen ticket",
        variant: "destructive",
      });
    }
  };

  /**
   * P5: Cart quantity guard. Wraps `cart.updateQuantity` so the +/- controls in
   * the cart panel respect active-outlet stock for tracked products. The cart
   * row's current quantity is excluded from the "already in cart" tally so the
   * user can lower their qty freely.
   */
  const handleCartQuantityChange = (id: string, qty: number) => {
    const targetItem = cart.items.find((item) => item.id === id);
    if (targetItem && qty > targetItem.quantity) {
      const stockCheck = evaluateStockForUpdate(
        targetItem.product,
        targetItem.quantity,
        qty,
      );
      if (!stockCheck.ok) {
        toast({
          title: "Stok tidak cukup",
          description: stockCheck.reason,
          variant: "destructive",
        });
        return;
      }
    }
    cart.updateQuantity(id, qty);
  };

  const cartPanelProps = {
    items: cart.items,
    onUpdateQty: handleCartQuantityChange,
    onRemove: cart.removeItem,
    onClear: cart.clearCart,
    getItemPrice: cart.getItemPrice,
    subtotal: cart.subtotal,
    taxRate: cart.taxRate,
    tax: cart.tax,
    serviceChargeRate: cart.serviceChargeRate,
    serviceCharge: cart.serviceCharge,
    total: cart.total,
    onCharge: handleCharge,
    onSaveDraft: handleSaveDraft,
    isDraftSaving,
    onConfirmAndKitchen: handleConfirmAndKitchen,
    hasKitchen: hasKitchenTicket,
    isKitchenSending,
    onUpdateNote: cart.updateNote,
    isProcessing: isProcessingQuickCharge,
    customerName: cart.customerName,
    setCustomerName: cart.setCustomerName,
    orderNumber: cart.orderNumber,
    tableNumber: cart.tableNumber,
    setTableNumber: cart.setTableNumber,
    paymentMethod: cart.paymentMethod,
    setPaymentMethod: cart.setPaymentMethod,
    orderType: cart.orderType,
    setOrderType: cart.setOrderType,
    continueOrderId,
    activeOrderTypes,
    setSelectedOrderTypeId: cart.setSelectedOrderTypeId,
    onSetItemDiscount: cart.setItemDiscount,
    orderDiscount: cart.orderDiscount,
    setOrderDiscount: cart.setOrderDiscount,
    itemsDiscountTotal: cart.itemsDiscountTotal,
    orderDiscountAmount: cart.orderDiscountAmount,
  };

  return (
    <POSLayout isOffline={!isOnline}>
      <ProductSection
        products={products}
        isLoading={productsLoading}
        error={productsError}
        onAddToCart={handleAddToCart}
        orders={orders}
        onUpdateOrderStatus={handleUpdateOrderStatus}
        onOpenDraftSheet={() => setCombinedDraftOpen(true)}
      />
      <CartSection cartProps={cartPanelProps} />
      <MobileCartSection
        isMobile={isMobile}
        mobileCartOpen={mobileCartOpen}
        setMobileCartOpen={setMobileCartOpen}
        cartCount={cart.items.length}
        cartProps={cartPanelProps}
      />

      {/* Combined Draft Orders Sheet */}
      <CombinedDraftSheet
        open={combinedDraftOpen}
        onOpenChange={setCombinedDraftOpen}
        onContinueOrder={(orderId) => {
          cart.clearCart();
          setLocation(`/pos?continueOrderId=${orderId}`);
        }}
        onResumeLocalDraft={handleResumeLocalDraft}
        onPayActiveOrder={(order) => {
          const total = Number(
            (order as any).total_amount ?? (order as any).total ?? 0,
          );
          const paid = Number(
            (order as any).paid_amount ?? (order as any).paidAmount ?? 0,
          );
          setPendingOrderForPayment({
            orderId: order.id,
            totalAmount: Math.max(0, total - paid),
            orderNumber: String(
              (order as any).order_number ??
                (order as any).orderNumber ??
                order.id,
            ),
          });
          setPaymentMethodDialogOpen(true);
        }}
      />

      {/* Product Options Dialog */}
      <ProductOptionsDialog
        product={selectedProduct}
        open={!!selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAdd={handleVariantAdd}
      />

      {/* Payment Method Selection Dialog */}
      <PaymentMethodDialog
        open={paymentMethodDialogOpen}
        onClose={() => {
          if (pendingOrderForPayment) {
            toast({
              title: "Pesanan dibuat",
              description: `Order #${pendingOrderForPayment.orderNumber} dapat dilunasi dari halaman Pesanan.`,
            });
            cart.clearCart();
          }
          setPaymentMethodDialogOpen(false);
          setPendingOrderForPayment(null);
        }}
        onMethodChange={handleCFDMethodChange}
        onConfirm={handlePaymentMethodConfirm}
        cartTotal={pendingOrderForPayment?.totalAmount || cart.total}
        cartItems={cart.items}
        isSubmitting={isProcessingQuickCharge}
        defaultPaymentMethod={cart.paymentMethod}
        allowPartial={hasPartialPayment}
        allowMultiPayment={hasMultiPayment}
        allowSplitBill={hasSplitBill}
      />

      {/* Quick Charge Processing Overlay */}
      {isProcessingQuickCharge && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          data-testid="dialog-quick-charge-processing"
        >
          <div className="bg-white rounded-lg p-8 flex flex-col items-center gap-4 max-w-xs">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <h2 className="text-lg font-semibold">Processing Order</h2>
            <p className="text-center text-sm text-muted-foreground">
              Creating order and recording payment...
            </p>
          </div>
        </div>
      )}
    </POSLayout>
  );
}
