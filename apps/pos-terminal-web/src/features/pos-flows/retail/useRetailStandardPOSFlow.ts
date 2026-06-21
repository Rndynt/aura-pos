import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import type { PaymentMethod, OrderType } from "@/hooks/useCart";
import { useCart } from "@/hooks/useCart";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useTenant } from "@/context/TenantContext";
import { useTenantProfile } from "@/hooks/api/useTenantProfile";
import { useProducts, useCreateOrder, useUpdateOrder, useOrderTypes, useRecordPayment } from "@/lib/api/hooks";
import type { Product, ProductVariant } from "@pos/domain/catalog/types";
import type { SelectedOption } from "@pos/domain/orders/types";
import { saveLocalDraftOrder } from "@pos/offline";
import { toCFDItem } from "@/hooks/useCustomerDisplay";
import {
  buildCompletedCFDPayload,
  buildPaymentCFDPayload,
  cartToOrderPayload,
  fetchOrderForPOS,
  getLocalDraftItems,
  getProductsById,
  isTrueServerDraft,
  type POSLifecycleOrder,
  usePOSActiveOrderPayment,
  usePOSCustomerDisplayController,
  usePOSOfflineSubmit,
  usePOSReceiptController,
  usePOSStockGuard,
} from "@/features/pos-core";
import { RETAIL_STANDARD_FLOW_POLICY } from "./retailStandardFlowPolicy";

export function useRetailStandardPOSFlow() {
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
  const { submitOrder } = usePOSOfflineSubmit();
  const { buildReceiptPayload, enqueueReceiptPrintJob, markReceiptPrintFailed, printReceiptNow, shouldAutoPrintReceipt } = usePOSReceiptController();
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
          toast({ title: "Pesanan legacy aktif", description: "Retail hanya dapat melanjutkan draft server. Gunakan Bayar atau Detail untuk order aktif legacy.", variant: "destructive" });
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
    tableNumber: undefined,
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

  const normalizePaymentDetails = (paymentMethod: PaymentMethod, totalAmount: number, cashReceived?: number, partialAmount?: number, paymentDetails?: any) => {
    const details = paymentDetails ?? {
      flow: partialAmount ? "dp" : "full",
      paymentKind: partialAmount ? "down_payment" : "full_payment",
      lines: [{ method: paymentMethod, amount: partialAmount ?? totalAmount, receivedAmount: cashReceived }],
    };
    const isMultiOrSplit = details.flow === "multi" || details.flow === "split";
    const lines = isMultiOrSplit
      ? (details.lines ?? [])
      : [{ method: paymentMethod, amount: partialAmount ?? totalAmount, receivedAmount: cashReceived, splitId: details.lines?.[0]?.splitId }];
    const lineTotal = lines.reduce((sum: number, line: any) => sum + Number(line.amount ?? 0), 0);
    return { details, lines, lineTotal, isMultiOrSplit };
  };

  const recordPaymentLines = async (orderId: string, totalAmount: number, paymentMethod: PaymentMethod, cashReceived: number | undefined, partialAmount: number | undefined, paymentDetails: any) => {
    const { details, lines, lineTotal } = normalizePaymentDetails(paymentMethod, totalAmount, cashReceived, partialAmount, paymentDetails);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      await recordPaymentMutation.mutateAsync({
        orderId,
        amount: line.amount,
        payment_method: line.method,
        payment_flow: details.flow,
        payment_kind: details.flow === "dp" ? (line.amount >= totalAmount - 0.001 ? "remaining_payment" : "down_payment") : details.paymentKind,
        received_amount: line.receivedAmount,
        change_amount: line.method === "cash" && line.receivedAmount ? Math.max(0, line.receivedAmount - line.amount) : undefined,
        split_id: line.splitId && /^[0-9a-f-]{36}$/i.test(line.splitId) ? line.splitId : undefined,
        sequence: index + 1,
        metadata: details.flow === "split" ? { session_split_id: line.splitId, splits: details.splits } : undefined,
      });
    }
    return { details, lineTotal };
  };

  const handlePaymentMethodConfirm = async (paymentMethod: PaymentMethod, cashReceived?: number, partialAmount?: number, paymentDetails?: any) => {
    if (pendingOrderForPayment) {
      setIsProcessingQuickCharge(true);
      try {
        const { details, lineTotal } = await recordPaymentLines(pendingOrderForPayment.orderId, pendingOrderForPayment.totalAmount, paymentMethod, cashReceived, partialAmount, paymentDetails);
        const isPartialResult = details.flow !== "full" && lineTotal < pendingOrderForPayment.totalAmount - 0.001;
        toast({
          title: isPartialResult ? "Pembayaran sebagian tersimpan" : "Pembayaran berhasil",
          description: isPartialResult ? `Order #${pendingOrderForPayment.orderNumber} tersisa untuk pelunasan.` : `Order #${pendingOrderForPayment.orderNumber} dilunasi.`,
        });
        setPendingOrderForPayment(null);
        setPaymentMethodDialogOpen(false);
      } catch (error) {
        toast({ title: "Pembayaran gagal", description: error instanceof Error ? error.message : "Gagal mencatat pembayaran", variant: "destructive" });
      } finally {
        setIsProcessingQuickCharge(false);
      }
      return;
    }

    if (!ensureCartHasItems()) return;
    if (!cart.selectedOrderTypeId) return;
    setIsProcessingQuickCharge(true);
    const cfdItems = cart.items.map(toCFDItem);
    const snapshot = { subtotal: cart.subtotal, tax: cart.tax, serviceCharge: cart.serviceCharge, total: cart.total, customerName: cart.customerName || undefined, orderNumber: cart.orderNumber };
    try {
      let orderNumber: string | undefined;
      const { details, lineTotal, isMultiOrSplit } = normalizePaymentDetails(paymentMethod, snapshot.total, cashReceived, partialAmount, paymentDetails);
      if (continueOrderId) {
        const updateResult = await updateOrderMutation.mutateAsync({ orderId: continueOrderId, ...buildOrderPayload() });
        const totalAmount = Number((updateResult.order as any)?.total ?? (updateResult.pricing as any)?.total_amount ?? cart.total);
        const recorded = await recordPaymentLines(continueOrderId, totalAmount, paymentMethod, cashReceived, partialAmount, paymentDetails);
        orderNumber = (updateResult.order as any)?.order_number ?? continueOrderId;
        if (recorded.details.flow !== "full" && recorded.lineTotal < totalAmount - 0.001) {
          toast({ title: "Pembayaran sebagian tersimpan", description: `Order #${orderNumber} tersisa untuk pelunasan.` });
          cart.clearCart();
          setPaymentMethodDialogOpen(false);
          setLocation("/pos");
          return;
        }
      } else if (isMultiOrSplit) {
        inPaymentFlowRef.current = true;
        sendToCFD(buildPaymentCFDPayload({ tenantName, orderNumber: snapshot.orderNumber || "", total: snapshot.total, items: cfdItems, subtotal: snapshot.subtotal, tax: snapshot.tax, serviceCharge: snapshot.serviceCharge, customerName: snapshot.customerName }, paymentMethod));
        const orderResult = await createOrderMutation.mutateAsync(buildOrderPayload());
        const orderId = String((orderResult.order as any)?.id ?? "");
        orderNumber = String((orderResult.order as any)?.order_number ?? (orderResult.order as any)?.orderNumber ?? orderId);
        if (!orderId) throw new Error("Order berhasil dibuat, tetapi ID order tidak ditemukan untuk mencatat pembayaran.");
        const recorded = await recordPaymentLines(orderId, snapshot.total, paymentMethod, cashReceived, partialAmount, paymentDetails);
        toast({
          title: recorded.lineTotal >= snapshot.total - 0.001 ? "Pembayaran berhasil" : "Pembayaran sebagian tersimpan",
          description: recorded.lineTotal >= snapshot.total - 0.001
            ? `Order #${orderNumber} dilunasi.`
            : `Order #${orderNumber} tersimpan. Pembayaran yang dipilih sudah dicatat, sisa tagihan dapat dilunasi dari order aktif.`,
        });
        cart.clearCart();
        setPaymentMethodDialogOpen(false);
        setMobileCartOpen(false);
        setLocation("/pos");
        return;
      } else {
        inPaymentFlowRef.current = true;
        sendToCFD(buildPaymentCFDPayload({ tenantName, orderNumber: snapshot.orderNumber || "", total: snapshot.total, items: cfdItems, subtotal: snapshot.subtotal, tax: snapshot.tax, serviceCharge: snapshot.serviceCharge, customerName: snapshot.customerName }, paymentMethod));
        const paidAmount = partialAmount ?? snapshot.total;
        const orderResult = await submitOrder({ items: cart.toBackendOrderItems(), tax_rate: cart.taxRate, service_charge_rate: cart.serviceChargeRate, order_type_id: cart.selectedOrderTypeId, customer_name: snapshot.customerName, amount: paidAmount, payment_method: paymentMethod, payment_flow: details.flow, payment_kind: details.paymentKind, received_amount: cashReceived, change_amount: paymentMethod === "cash" && cashReceived ? Math.max(0, cashReceived - paidAmount) : undefined });
        orderNumber = (orderResult.order as any)?.order_number || orderResult.order?.id;
        if (details.flow === "dp") {
          toast({ title: "DP berhasil dicatat", description: `Order #${orderNumber} tersisa Rp ${(snapshot.total - paidAmount).toLocaleString("id-ID")}` });
          cart.clearCart();
          setPaymentMethodDialogOpen(false);
          setMobileCartOpen(false);
          setLocation("/pos");
          return;
        }
      }
      sendToCFD(buildCompletedCFDPayload({ tenantName, orderNumber: String(orderNumber ?? snapshot.orderNumber), total: snapshot.total, items: cfdItems, subtotal: snapshot.subtotal, tax: snapshot.tax, serviceCharge: snapshot.serviceCharge, customerName: snapshot.customerName }, snapshot.total, 0));
      toast({ title: "Pesanan berhasil dibuat & dibayar", description: `Order #${orderNumber} - Total: Rp ${snapshot.total.toLocaleString("id-ID")}` });
      const receiptPayload = buildReceiptPayload({ orderNumber: String(orderNumber ?? snapshot.orderNumber), tenantName, customerName: snapshot.customerName, paymentMethod, subtotal: snapshot.subtotal, tax: snapshot.tax, serviceCharge: snapshot.serviceCharge, total: snapshot.total, items: cfdItems });
      let printJobId: string | null = null;
      try {
        const queued = await enqueueReceiptPrintJob({ orderNumber: String(orderNumber ?? snapshot.orderNumber), payload: receiptPayload });
        printJobId = queued.jobId;
      } catch {}
      if (shouldAutoPrintReceipt) {
        try { await printReceiptNow(printJobId, receiptPayload); } catch (printError) { await markReceiptPrintFailed(printJobId, printError); }
      }
      cart.clearCart();
      setPaymentMethodDialogOpen(false);
      setMobileCartOpen(false);
      setLocation("/pos");
      setTimeout(() => { inPaymentFlowRef.current = false; sendToCFD({ type: "idle", tenantName }); }, 7000);
    } catch (error) {
      inPaymentFlowRef.current = false;
      toast({ title: "Pembayaran gagal", description: error instanceof Error ? error.message : "Gagal membuat pesanan dan mencatat pembayaran", variant: "destructive" });
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
    onConfirmAndKitchen: undefined,
    hasKitchen: RETAIL_STANDARD_FLOW_POLICY.showKitchenActions,
    isKitchenSending: false,
    onUpdateNote: cart.updateNote,
    isProcessing: isProcessingQuickCharge,
    customerName: cart.customerName,
    setCustomerName: cart.setCustomerName,
    orderNumber: cart.orderNumber,
    tableNumber: undefined,
    setTableNumber: undefined,
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

  return { policy: RETAIL_STANDARD_FLOW_POLICY, isOnline, products, productsLoading, productsError, handleAddToCart, selectedProduct, setSelectedProduct, handleVariantAdd, cartPanelProps, isMobile, mobileCartOpen, setMobileCartOpen, combinedDraftOpen, setCombinedDraftOpen, handleResumeLocalDraft, payActiveOrder, paymentMethodDialogOpen, setPaymentMethodDialogOpen, handleCFDMethodChange, handlePaymentMethodConfirm, pendingOrderForPayment, setPendingOrderForPayment, hasPartialPayment, hasMultiPayment, hasSplitBill, isProcessingQuickCharge, cart };
}
