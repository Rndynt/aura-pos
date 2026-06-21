import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import type { PaymentMethod, OrderType } from "@/hooks/useCart";
import { useCart } from "@/hooks/useCart";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useTenant } from "@/context/TenantContext";
import { useTenantProfile } from "@/hooks/api/useTenantProfile";
import { useProducts, useCreateOrder, useUpdateOrder, useOrderTypes, useRecordPayment, useCreateKitchenTicket } from "@/lib/api/hooks";
import type { Product, ProductVariant } from "@pos/domain/catalog/types";
import type { SelectedOption } from "@pos/domain/orders/types";
import { saveLocalDraftOrder, enqueueLocalKitchenTicket, getOrCreateTerminalIdentity } from "@pos/offline";
import { toCFDItem } from "@/hooks/useCustomerDisplay";
import { useTables, useOpenOrders } from "@/lib/api/tableHooks";
import { useKitchenChannelSender } from "@/hooks/useKitchenChannel";
import { useQueryClient } from "@tanstack/react-query";
import {
  buildCompletedCFDPayload,
  buildPaymentCFDPayload,
  cartItemsToKitchenTicketItems,
  cartToOrderPayload,
  fetchOrderForPOS,
  getLocalDraftItems,
  getProductsById,
  isTrueServerDraft,
  type POSLifecycleOrder,
  usePOSActiveOrderPayment,
  usePOSCustomerDisplayController,
  usePOSReceiptController,
  usePOSStockGuard,
  submitPOSPayment,
  toUserSafePaymentError,
  toCanonicalPaymentMethod,
  createClientPaymentSessionId,
} from "@/features/pos-core";
import { getSendToKitchenEligibility } from "./restaurantTableServiceFlowPolicy";
import { RESTAURANT_TABLE_SERVICE_FLOW_POLICY } from "./restaurantTableServiceFlowPolicy";

export function useRestaurantTableServicePOSFlow() {
  const searchParams = useSearch();
  const urlParams = new URLSearchParams(searchParams);
  const continueOrderId = urlParams.get("continueOrderId");
  const [, setLocation] = useLocation();
  const cart = useCart();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { isOnline } = useNetworkStatus();
  const { can, tenantId } = useTenant();
  const { data: tenantProfile } = useTenantProfile(tenantId);
  const tenantName = tenantProfile?.tenant?.name || "AuraPOS";
  const inPaymentFlowRef = useRef(false);
  const paymentSessionIdRef = useRef<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [combinedDraftOpen, setCombinedDraftOpen] = useState(false);
  const [isDraftSaving, setIsDraftSaving] = useState(false);
  const [isProcessingQuickCharge, setIsProcessingQuickCharge] = useState(false);
  const [paymentMethodDialogOpen, setPaymentMethodDialogOpen] = useState(false);
  const [pendingOrderForPayment, setPendingOrderForPayment] = useState<{ orderId: string; totalAmount: number; orderNumber: string } | null>(null);

  const { data: productsData, isLoading: productsLoading, error: productsError } = useProducts();
  const products = productsData?.products || [];
  const { evaluateStockForAdd, evaluateStockForUpdate } = usePOSStockGuard(products, cart.items);
  const { data: orderTypes, isLoading: orderTypesLoading } = useOrderTypes();
  const activeOrderTypes = useMemo(() => orderTypes?.filter((ot) => ot.isActive === true) || [], [orderTypes]);
  const createOrderMutation = useCreateOrder();
  const updateOrderMutation = useUpdateOrder();
  const recordPaymentMutation = useRecordPayment();
  const submitPaymentRow = recordPaymentMutation.mutateAsync;
  const createKitchenTicketMutation = useCreateKitchenTicket();
  const queryClient = useQueryClient();
  const { sendToKDS } = useKitchenChannelSender(can("restaurant_kitchen_ops"));
  const { data: tablesData, isLoading: tablesLoading, error: tablesError } = useTables();
  const { data: openOrdersData, isLoading: openOrdersLoading, refetch: refetchOpenOrders } = useOpenOrders();
  const { sendToCFD } = usePOSCustomerDisplayController({ cart, tenantName, inPaymentFlowRef, enabled: can("customer_display") });
  const { payActiveOrder } = usePOSActiveOrderPayment({ setPendingOrderForPayment, openPaymentDialog: () => setPaymentMethodDialogOpen(true) });

  const hasPartialPayment = can("payments_partial_payment");
  const hasMultiPayment = can("payments_multi_payment");
  const hasSplitBill = can("payments_split_bill") || can("payments_split_payment");

  useEffect(() => {
    if (!orderTypesLoading && activeOrderTypes.length > 0 && !cart.selectedOrderTypeId) {
      const firstType = activeOrderTypes[0];
      cart.setSelectedOrderTypeId(firstType.id);
      cart.setOrderType(firstType.code.toLowerCase().replace(/_/g, "-") as OrderType);
    }
  }, [activeOrderTypes, orderTypesLoading, cart]);

  const loadedOrderRef = useRef<string | null>(null);
  useEffect(() => {
    if (!continueOrderId || loadedOrderRef.current === continueOrderId) return;
    loadedOrderRef.current = continueOrderId;
    void (async () => {
      try {
        const fullOrder = await fetchOrderForPOS(continueOrderId);
        if (!isTrueServerDraft(fullOrder as POSLifecycleOrder)) {
          cart.clearCart();
          toast({ title: "Pesanan aktif restoran", description: "Restoran hanya dapat melanjutkan draft server. Pesanan aktif dapur hanya dapat dibayar/detail.", variant: "destructive" });
          setLocation("/pos");
          return;
        }
        cart.clearCart();
        cart.loadOrder(fullOrder);
        const productsMap = getProductsById(products as any[]);
        cart.items.forEach((item: any) => {
          const fullProduct = productsMap.get(item.product.id);
          if (fullProduct) item.product.image_url = fullProduct.image_url;
        });
        toast({ title: "Draft dimuat", description: `Draft #${fullOrder.orderNumber} siap dibayar.` });
      } catch (error) {
        toast({ title: "Gagal memuat draft", description: error instanceof Error ? error.message : "Draft tidak dapat dimuat", variant: "destructive" });
      }
    })();
  }, [continueOrderId]);

  const ensureCartHasItems = () => {
    if (cart.items.length === 0) {
      toast({ title: "Cart kosong", description: "Tambahkan produk sebelum melanjutkan", variant: "destructive" });
      return false;
    }
    return true;
  };

  const buildOrderPayload = () => cartToOrderPayload({
    items: cart.toBackendOrderItems(),
    taxRate: cart.taxRate,
    serviceChargeRate: cart.serviceChargeRate,
    selectedOrderTypeId: cart.selectedOrderTypeId,
    customerName: cart.customerName,
    tableNumber: cart.tableNumber || undefined,
    orderDiscount: cart.orderDiscount,
    orderDiscountAmount: cart.orderDiscountAmount,
    itemsDiscountTotal: cart.itemsDiscountTotal,
  });

  const handleAddToCart = (product: Product) => {
    if (!product.is_active) return toast({ description: `${product.name} sedang tidak tersedia`, variant: "info" });
    const stockCheck = evaluateStockForAdd(product, 1);
    if (!stockCheck.ok) return toast({ title: "Stok tidak cukup", description: stockCheck.reason, variant: "destructive" });
    if ((product.has_variants && product.variants?.length) || product.option_groups?.length) setSelectedProduct(product);
    else cart.addItem(product, undefined, [], 1);
  };

  const handleVariantAdd = (product: Product, variant: ProductVariant | undefined, selectedOptions: SelectedOption[], qty: number) => {
    const stockCheck = evaluateStockForAdd(product, qty);
    if (!stockCheck.ok) return toast({ title: "Stok tidak cukup", description: stockCheck.reason, variant: "destructive" });
    cart.addItem(product, variant, selectedOptions, qty);
    setSelectedProduct(null);
  };

  const handleCartQuantityChange = (id: string, qty: number) => {
    const targetItem = cart.items.find((item) => item.id === id);
    if (targetItem && qty > targetItem.quantity) {
      const stockCheck = evaluateStockForUpdate(targetItem.product, targetItem.quantity, qty);
      if (!stockCheck.ok) return toast({ title: "Stok tidak cukup", description: stockCheck.reason, variant: "destructive" });
    }
    cart.updateQuantity(id, qty);
  };

  const handleSaveDraft = async () => {
    if (!ensureCartHasItems()) return;
    if (!cart.selectedOrderTypeId && activeOrderTypes.length > 0) cart.setSelectedOrderTypeId(activeOrderTypes[0].id);
    if (!cart.selectedOrderTypeId) return toast({ title: "Tipe pesanan diperlukan", description: "Tidak ada tipe pesanan tersedia.", variant: "destructive" });
    setIsDraftSaving(true);
    try {
      const orderResult = continueOrderId
        ? await updateOrderMutation.mutateAsync({ orderId: continueOrderId, ...buildOrderPayload() })
        : await createOrderMutation.mutateAsync(buildOrderPayload());
      toast({ title: continueOrderId ? "Draft diperbarui" : "Draft disimpan", description: `Order #${orderResult.order?.order_number || orderResult.order?.id || "N/A"}` });
      cart.clearCart();
      setMobileCartOpen(false);
      if (continueOrderId) setLocation("/pos");
    } catch (error) {
      const isNetworkError = error instanceof TypeError || (error instanceof Error && /network|fetch/i.test(error.message));
      if (isNetworkError) {
        const draft = await saveLocalDraftOrder({ tenantId, customerName: cart.customerName || undefined, items: cart.items, total: cart.total });
        toast({ title: "Draft lokal disimpan", description: `Draft #${draft.id.slice(0, 8)} disimpan di perangkat ini.` });
        cart.clearCart();
        setMobileCartOpen(false);
      } else {
        toast({ title: "Gagal menyimpan draft", description: error instanceof Error ? error.message : "Gagal membuat pesanan", variant: "destructive" });
      }
    } finally {
      setIsDraftSaving(false);
    }
  };

  const handleSendToKitchenFromCart = async () => {
    const selectedTableNumber = cart.tableNumber?.trim() || "";
    const eligibility = getSendToKitchenEligibility({
      cartItemCount: cart.items.length,
      diningContext: { tableNumber: selectedTableNumber, customerName: cart.customerName },
      tableRequired: true,
      kitchenEntitlementEnabled: can("restaurant_kitchen_ops"),
    });
    if (!eligibility.ok) {
      const message = eligibility.reason === "EMPTY_CART" ? "Tambahkan produk sebelum kirim ke dapur." : eligibility.reason === "DINING_CONTEXT_REQUIRED" ? "Pilih/isi meja sebelum kirim ke dapur." : "Kitchen ticket belum aktif untuk tenant ini.";
      toast({ title: "Tidak bisa kirim ke dapur", description: message, variant: "destructive" });
      return;
    }
    if (!cart.selectedOrderTypeId && activeOrderTypes.length > 0) cart.setSelectedOrderTypeId(activeOrderTypes[0].id);
    if (!cart.selectedOrderTypeId) return toast({ title: "Tipe pesanan diperlukan", description: "Tidak ada tipe pesanan tersedia.", variant: "destructive" });
    setIsDraftSaving(true);
    try {
      const payload = buildOrderPayload();
      const orderResult = await createOrderMutation.mutateAsync(payload);
      const orderId = String((orderResult.order as any)?.id ?? "");
      const orderNumber = String((orderResult.order as any)?.order_number ?? (orderResult.order as any)?.orderNumber ?? orderId);
      if (!orderId) throw new Error("Order aktif tidak memiliki id");
      if (!isOnline) {
        const terminal = await getOrCreateTerminalIdentity(tenantId);
        const ticket = await enqueueLocalKitchenTicket({ tenantId, terminalId: terminal.terminalId, localOrderId: orderId, orderNumber, items: cartItemsToKitchenTicketItems(cart.items), customerName: cart.customerName || undefined, tableNumber: selectedTableNumber });
        sendToKDS({ type: "ticket_added", ticket });
      } else {
        await createKitchenTicketMutation.mutateAsync({ orderId });
      }
      toast({ title: "Dikirim ke dapur", description: `Order #${orderNumber} dibuat sebagai pesanan aktif tanpa pembayaran.` });
      cart.clearCart();
      setMobileCartOpen(false);
      await refetchOpenOrders();
      queryClient.invalidateQueries({ queryKey: ["/api/orders/open"] });
    } catch (error) {
      toast({ title: "Gagal kirim ke dapur", description: error instanceof Error ? error.message : "Gagal membuat pesanan dapur", variant: "destructive" });
    } finally {
      setIsDraftSaving(false);
    }
  };

  const handleCharge = () => {
    if (!ensureCartHasItems()) return;
    if (!cart.selectedOrderTypeId && activeOrderTypes.length > 0) cart.setSelectedOrderTypeId(activeOrderTypes[0].id);
    setPaymentMethodDialogOpen(true);
    setMobileCartOpen(false);
  };

  const handleCFDMethodChange = (method: PaymentMethod) => {
    if (!cart.items.length) return;
    inPaymentFlowRef.current = true;
    sendToCFD(buildPaymentCFDPayload({ tenantName, orderNumber: pendingOrderForPayment?.orderNumber || cart.orderNumber || "", total: pendingOrderForPayment?.totalAmount || cart.total, items: cart.items.map(toCFDItem), subtotal: cart.subtotal, tax: cart.tax, serviceCharge: cart.serviceCharge, customerName: cart.customerName || undefined }, method));
  };

  const handlePaymentMethodConfirm = async (paymentMethod: PaymentMethod, cashReceived?: number, partialAmount?: number, paymentDetails?: any) => {
    if (!pendingOrderForPayment) {
      toast({ title: "Gunakan Kirim ke Dapur", description: "Flow restoran tidak membuat pembayaran fresh retail. Bayar dari pesanan aktif setelah service.", variant: "destructive" });
      return;
    }

    setIsProcessingQuickCharge(true);
    try {
      const result = await submitPOSPayment({
        mode: "ACTIVE_ORDER",
        clientPaymentSessionId: paymentSessionIdRef.current ?? (paymentSessionIdRef.current = createClientPaymentSessionId()),
        orderId: pendingOrderForPayment.orderId,
        orderNumber: pendingOrderForPayment.orderNumber,
        totalAmount: pendingOrderForPayment.totalAmount,
        paymentMethod: toCanonicalPaymentMethod(paymentMethod),
        cashReceived,
        partialAmount,
        paymentDetails,
      }, {
        createOrder: (payload: Record<string, unknown>) => createOrderMutation.mutateAsync(payload as any),
        recordPayment: (payload: any) => submitPaymentRow(payload),
      });
      await refetchOpenOrders();
      toast({ title: result.messageTitle, description: result.messageDescription });
      setPendingOrderForPayment(null);
      setPaymentMethodDialogOpen(false);
    } catch (error) {
      toast({ title: "Pembayaran gagal", description: toUserSafePaymentError(error), variant: "destructive" });
    } finally {
      setIsProcessingQuickCharge(false);
    }
  };

  const handleResumeLocalDraft = (draft: any) => {
    cart.clearCart();
    cart.setCustomerName(draft.customerName || "");
    getLocalDraftItems(draft).forEach((item: any) => item?.product && cart.addItem(item.product, item.variant, item.selectedOptions || [], item.quantity || 1));
    toast({ title: "Draft lokal dimuat", description: `Draft LOCAL-${String(draft.id).slice(0, 8)} siap dibayar.` });
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
    onConfirmAndKitchen: handleSendToKitchenFromCart,
    hasKitchen: RESTAURANT_TABLE_SERVICE_FLOW_POLICY.showKitchenActions,
    isKitchenSending: false,
    onUpdateNote: cart.updateNote,
    isProcessing: isProcessingQuickCharge,
    customerName: cart.customerName,
    setCustomerName: cart.setCustomerName,
    orderNumber: cart.orderNumber,
    tableNumber: cart.tableNumber || undefined,
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

  const restaurantActiveOrders = ((openOrdersData as any)?.orders || []) as POSLifecycleOrder[];

  return { policy: RESTAURANT_TABLE_SERVICE_FLOW_POLICY, isOnline, tables: tablesData?.tables || [], tablesLoading, tablesError, activeOrders: restaurantActiveOrders, openOrdersLoading, products, productsLoading, productsError, handleAddToCart, selectedProduct, setSelectedProduct, handleVariantAdd, cartPanelProps, isMobile, mobileCartOpen, setMobileCartOpen, combinedDraftOpen, setCombinedDraftOpen, handleResumeLocalDraft, payActiveOrder, paymentMethodDialogOpen, setPaymentMethodDialogOpen, handleCFDMethodChange, handlePaymentMethodConfirm, pendingOrderForPayment, setPendingOrderForPayment, hasPartialPayment, hasMultiPayment, hasSplitBill, isProcessingQuickCharge, cart };
}
