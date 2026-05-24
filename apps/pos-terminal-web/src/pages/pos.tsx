import { useState, useEffect, useMemo, useRef } from "react";
import { useSearch, useLocation } from "wouter";
import { ProductArea } from "@/components/pos/ProductArea";
import { CartPanel } from "@/components/pos/CartPanel";
import { MobileCartDrawer } from "@/components/pos/MobileCartDrawer";
import { OrderQueue } from "@/components/kitchen-display/OrderQueue";
import { OrderQueuePanel } from "@/components/pos/OrderQueuePanel";
import { UnifiedBottomNav } from "@/components/navigation/UnifiedBottomNav";
import { ProductOptionsDialog } from "@/components/pos/ProductOptionsDialog";
import { PartialPaymentDialog } from "@/components/pos/PartialPaymentDialog";
import { PaymentMethodDialog } from "@/components/pos/PaymentMethodDialog";
import { CombinedDraftSheet } from "@/components/pos/CombinedDraftSheet";
import type { PaymentMethod } from "@/hooks/useCart";
import { useCart } from "@/hooks/useCart";
import { useFeatures } from "@/hooks/useFeatures";
import { useProducts, useCreateOrder, useUpdateOrder, useCreateKitchenTicket, useOrderTypes, useRecordPayment, useOrders } from "@/lib/api/hooks";
import { useOfflineOrderSubmit } from "@/hooks/useOfflineOrderSubmit";
import type { Product, ProductVariant } from "@pos/domain/catalog/types";
import type { SelectedOption, Order } from "@pos/domain/orders/types";
import { Button } from "@/components/ui/button";
import { ShoppingCart, ShoppingBag, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { getActiveTenantId } from "@/lib/tenant";
import { useTenant } from "@/context/TenantContext";
import { useTenantProfile } from "@/hooks/api/useTenantProfile";
import { useCustomerDisplaySender, toCFDItem } from "@/hooks/useCustomerDisplay";
import { bluetoothReceiptPrinter } from "@/lib/receiptPrinter";
import { queryClient } from "@/lib/queryClient";
import { saveLocalDraftOrder, enqueuePrintJob, markPrinting, markPrinted, markPrintFailed, getOrCreateTerminalIdentity, enqueueLocalKitchenTicket } from "@pos/offline";
import { OfflineCacheBanner } from "@/components/offline/OfflineCacheBanner";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useKitchenChannelSender } from "@/hooks/useKitchenChannel";

export default function POSPage() {
  const searchParams = useSearch();
  const urlParams = new URLSearchParams(searchParams);
  const continueOrderId = urlParams.get("continueOrderId");
  const [, setLocation] = useLocation();

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [combinedDraftOpen, setCombinedDraftOpen] = useState(false);
  const [partialPaymentDialogOpen, setPartialPaymentDialogOpen] = useState(false);
  const [isSubmittingPartialPayment, setIsSubmittingPartialPayment] = useState(false);
  const [isProcessingQuickCharge, setIsProcessingQuickCharge] = useState(false);
  const [paymentMethodDialogOpen, setPaymentMethodDialogOpen] = useState(false);
  const [pendingOrderForPayment, setPendingOrderForPayment] = useState<{
    orderId: string;
    totalAmount: number;
    orderNumber: string;
  } | null>(null);
  const cart = useCart();
  const { hasFeature } = useFeatures();
  const hasReceiptPrinter = hasFeature("receipt_printer");
  const isOrderQueueEnabled = hasFeature("order_queue");
  const hasPairedPrinter = Boolean(bluetoothReceiptPrinter.getPairedDeviceId());
  const shouldAutoPrintReceipt = hasReceiptPrinter || hasPairedPrinter;
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { isOnline } = useNetworkStatus();
  const { send: sendToCFD } = useCustomerDisplaySender();
  const { sendToKDS } = useKitchenChannelSender();
  const { tenantId } = useTenant();
  const { data: tenantProfile } = useTenantProfile(tenantId);
  const tenantName = tenantProfile?.tenant?.name || 'AuraPOS';

  // Prevent cart-change effect from overriding payment/completed CFD state
  const inPaymentFlowRef = useRef(false);

  // ── Broadcast cart state ke Customer Display setiap ada perubahan ──────────
  useEffect(() => {
    // Don't override payment/completed states while processing
    if (inPaymentFlowRef.current) return;
    if (cart.items.length === 0) {
      sendToCFD({ type: 'idle', tenantName });
    } else {
      sendToCFD({
        type: 'ordering',
        tenantName,
        orderNumber: cart.orderNumber,
        items: cart.items.map(toCFDItem),
        subtotal: cart.subtotal,
        tax: cart.tax,
        serviceCharge: cart.serviceCharge,
        total: cart.total,
        customerName: cart.customerName || undefined,
        tableNumber: cart.tableNumber || undefined,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.items, cart.total, cart.orderNumber, tenantName]);

  // Auto-close mobile cart drawer when switching to tablet/desktop
  useEffect(() => {
    if (!isMobile) {
      setMobileCartOpen(false);
    }
  }, [isMobile]);

  // Fetch products from backend (including inactive products to show with overlay)
  const { data: productsData, isLoading: productsLoading, error: productsError } = useProducts();
  const products = productsData?.products || [];

  // Fetch orders for queue display
  const { data: ordersData, refetch: refetchOrders } = useOrders(undefined, {
    refetchInterval: isOrderQueueEnabled ? 5000 : false,
  });
  const orders: Order[] = ordersData?.orders || [];

  useEffect(() => {
    if (!isOrderQueueEnabled) return;

    const es = new EventSource("/api/orders/queue/stream", { withCredentials: true });
    const onUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/open"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
    };

    es.addEventListener("order_queue_updated", onUpdate as EventListener);

    return () => {
      es.removeEventListener("order_queue_updated", onUpdate as EventListener);
      es.close();
    };
  }, [isOrderQueueEnabled]);

  // Fetch order types for tenant
  const { data: orderTypes, isLoading: orderTypesLoading } = useOrderTypes();

  // Filter only active order types - defensive check even though API already filters
  const activeOrderTypes = useMemo(() => {
    return orderTypes?.filter(ot => ot.isActive === true) || [];
  }, [orderTypes]);

  // Load order into cart if continueOrderId is provided
  const loadedOrderRef = useRef<string | null>(null);
  
  useEffect(() => {
    if (continueOrderId && loadedOrderRef.current !== continueOrderId) {
      loadedOrderRef.current = continueOrderId;
      
      const loadOrderIntoCart = async () => {
        try {
          const tenantId = getActiveTenantId();
          const response = await fetch(`/api/orders/${continueOrderId}`, {
            headers: {
              "x-tenant-id": tenantId,
            },
          });
          if (!response.ok) throw new Error("Failed to fetch order");
          
          const json = await response.json();
          const fullOrder = json.data;
          
          // Clear cart first to remove any stale data
          cart.clearCart();
          
          // Load order into cart with fresh state
          cart.loadOrder(fullOrder);
          
          // Enrich cart items with full product data (including images) from fetched products
          const productsMap = new Map(products.map((p: any) => [p.id, p]));
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
  useEffect(() => {
    if (!orderTypesLoading && activeOrderTypes.length > 0 && !cart.selectedOrderTypeId) {
      cart.setSelectedOrderTypeId(activeOrderTypes[0].id);
    }
  }, [activeOrderTypes, orderTypesLoading, cart]);

  // Mutations
  const createOrderMutation = useCreateOrder();
  const updateOrderMutation = useUpdateOrder();
  const createKitchenTicketMutation = useCreateKitchenTicket();
  const recordPaymentMutation = useRecordPayment();
  const { submitOrder, isSubmitting: isOfflineSubmitting } = useOfflineOrderSubmit();

  const hasPartialPayment = hasFeature("partial_payment");
  const hasKitchenTicket = hasFeature("kitchen_ticket");

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
    const isValidOrderType = activeOrderTypes.some(ot => ot.id === cart.selectedOrderTypeId);
    if (!isValidOrderType) {
      toast({
        title: "Invalid order type",
        description: "The selected order type is no longer available. Please select a valid order type.",
        variant: "destructive",
      });
      cart.setSelectedOrderTypeId(null);
      return false;
    }

    return true;
  };

  const buildOrderPayload = () => ({
    items: cart.toBackendOrderItems(),
    tax_rate: cart.taxRate,
    service_charge_rate: cart.serviceChargeRate,
    order_type_id: cart.selectedOrderTypeId || undefined,
    customer_name: cart.customerName || undefined,
    table_number: cart.tableNumber || undefined,
    order_discount_type: cart.orderDiscount?.type,
    order_discount_value: cart.orderDiscount?.value,
    order_discount_amount: cart.orderDiscountAmount > 0 ? cart.orderDiscountAmount : undefined,
    items_discount_total: cart.itemsDiscountTotal > 0 ? cart.itemsDiscountTotal : undefined,
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

    // Check if product has variants or option_groups that require selection
    const hasVariants = product.has_variants && product.variants && product.variants.length > 0;
    const hasOptionGroups = product.option_groups && product.option_groups.length > 0;

    if (hasVariants || hasOptionGroups) {
      // Show dialog for variant/option selection
      setSelectedProduct(product);
    } else {
      // Add directly to cart with no options
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
    qty: number
  ) => {
    cart.addItem(product, variant, selectedOptions, qty);
    setSelectedProduct(null);
    
    // Build description with variant and options
    let description = product.name;
    if (variant) {
      description += ` (${variant.name})`;
    }
    if (selectedOptions.length > 0) {
      const optionsText = selectedOptions.map(opt => opt.option_name).join(", ");
      description += ` - ${optionsText}`;
    }

    toast({
      title: "Added to cart",
      description,
    });
  };

  const handleUpdateContinueOrder = async () => {
    console.log("🔴 [UPDATE] handleUpdateContinueOrder called, continueOrderId:", continueOrderId);
    console.log("🔴 [UPDATE] Cart items:", cart.items.length, cart.items);
    
    if (!ensureCartHasItems()) {
      console.log("🔴 [UPDATE] No items in cart - aborting");
      return;
    }
    
    if (!continueOrderId) {
      console.log("🔴 [UPDATE] No continueOrderId - aborting");
      toast({
        title: "Error",
        description: "No order ID found",
        variant: "destructive",
      });
      return;
    }
    
    try {
      setIsProcessingQuickCharge(true);
      console.log("🔴 [UPDATE] Building order payload...");
      
      const items = cart.toBackendOrderItems();
      console.log("🔴 [UPDATE] Backend items:", items);
      
      const orderPayload = {
        items,
        tax_rate: cart.taxRate,
        service_charge_rate: cart.serviceChargeRate,
        order_type_id: cart.selectedOrderTypeId,
        customer_name: cart.customerName || undefined,
        table_number: cart.tableNumber || undefined,
      };
      
      console.log("🔴 [UPDATE] Full payload:", orderPayload);
      
      // Update the existing order
      console.log("🔴 [UPDATE] Calling mutation for order:", continueOrderId);
      const orderResult = await updateOrderMutation.mutateAsync({
        orderId: continueOrderId,
        ...orderPayload,
      });
      
      console.log("🔴 [UPDATE] Success! Response:", orderResult);
      
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
    
    // If continuing an order, update it then show payment dialog
    if (continueOrderId) {
      await handleUpdateContinueOrder();
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
    sendToCFD({
      type: 'payment',
      tenantName,
      orderNumber: pendingOrderForPayment?.orderNumber || cart.orderNumber,
      total: pendingOrderForPayment?.totalAmount || cart.total,
      method,
      items: cart.items.map(toCFDItem),
      subtotal: cart.subtotal,
      tax: cart.tax,
      serviceCharge: cart.serviceCharge,
      customerName: cart.customerName || undefined,
      tableNumber: cart.tableNumber || undefined,
    });
  };

  // Handle payment method confirmation from dialog
  const handlePaymentMethodConfirm = async (paymentMethod: PaymentMethod) => {
    if (!ensureCartHasItems() || !cart.selectedOrderTypeId) return;

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
    sendToCFD({
      type: 'payment',
      tenantName,
      orderNumber: cfdOrderNumber,
      total: cfdTotal,
      method: paymentMethod,
      items: cfdItems,
      subtotal: cfdSubtotal,
      tax: cfdTax,
      serviceCharge: cfdServiceCharge,
      customerName: cfdCustomerName,
      tableNumber: cfdTableNumber,
    });

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
      const orderNumber = (orderResult.order as any)?.order_number || orderResult.order?.id;
      const isLocal = (orderResult as any).isLocal === true;
      
      // Broadcast: pembayaran selesai
      sendToCFD({
        type: 'completed',
        tenantName,
        orderNumber: String(orderNumber ?? cfdOrderNumber),
        total: totalAmount,
        amountPaid: totalAmount,
        change: 0,
        items: cfdItems,
        subtotal: cfdSubtotal,
        tax: cfdTax,
        serviceCharge: cfdServiceCharge,
        customerName: cfdCustomerName,
      });
      
      toast({
        title: isLocal
          ? "Pesanan tersimpan (OFFLINE)"
          : "Pesanan berhasil dibuat & dibayar",
        description: isLocal
          ? `Order #${orderNumber} disimpan lokal — akan tersinkron saat online`
          : `Order #${orderNumber} - Total: Rp ${totalAmount.toLocaleString("id-ID")} (${paymentMethod})`,
      });

      const receiptPayload = {
        orderNumber: String(orderNumber ?? cfdOrderNumber),
        tenantName,
        customerName: cfdCustomerName,
        tableNumber: cfdTableNumber,
        paymentMethod,
        createdAt: new Date(),
        subtotal: cfdSubtotal,
        tax: cfdTax,
        serviceCharge: cfdServiceCharge,
        total: cfdTotal,
        items: cfdItems.map((item) => ({
          name: item.name,
          qty: item.quantity,
          unitPrice: item.unitPrice,
          total: item.itemTotal,
        })),
      };

      let printJobId: string | null = null;
      try {
        const qTenantId = getActiveTenantId();
        const terminal = await getOrCreateTerminalIdentity(qTenantId);
        const job = await enqueuePrintJob({
          tenantId: qTenantId,
          terminalId: terminal.terminalId,
          localOrderId: (orderResult.order as any)?.localId,
          orderNumber: String(orderNumber ?? cfdOrderNumber),
          type: "receipt",
          payload: receiptPayload,
        });
        printJobId = job.id;

        // ── Offline kitchen ticket ──────────────────────────────────────────
        // When the order was saved locally (isLocal) AND kitchen feature is on,
        // enqueue a local kitchen ticket so the KDS tab on this device shows it.
        if (isLocal && hasKitchenTicket) {
          try {
            const kitchenTicket = await enqueueLocalKitchenTicket({
              tenantId: qTenantId,
              terminalId: terminal.terminalId,
              localOrderId: (orderResult.order as any)?.localId ?? String(orderNumber),
              orderNumber: String(orderNumber ?? cfdOrderNumber),
              items: cart.items.map((item) => ({
                productId: item.product.id,
                name: item.product.name + (item.variant ? ` (${item.variant.name})` : ""),
                quantity: item.quantity,
                variantName: item.variant?.name,
              })),
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
          if (printJobId) await markPrinting(printJobId).catch(() => undefined);
          await bluetoothReceiptPrinter.reconnectIfPossible().catch(() => false);
          await bluetoothReceiptPrinter.print(receiptPayload);
          if (printJobId) await markPrinted(printJobId).catch(() => undefined);
          toast({
            title: "Struk tercetak",
            description: `Order #${orderNumber} berhasil dicetak ke printer bluetooth`,
          });
        } catch (printError) {
          if (printJobId) await markPrintFailed(printJobId, printError instanceof Error ? printError.message : "Print failed").catch(() => undefined);
          toast({
            title: "Pembayaran sukses, cetak struk gagal",
            description: "Struk disimpan di antrian cetak — buka Printer Hub untuk cetak ulang.",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Pembayaran sukses",
          description: "Struk tersimpan di antrian cetak. Buka Printer Hub untuk cetak.",
        });
      }
      
      // Kembali ke idle setelah 7 detik — release lock lalu kirim idle
      setTimeout(() => {
        inPaymentFlowRef.current = false;
        sendToCFD({ type: 'idle', tenantName });
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
        type: 'ordering',
        tenantName,
        orderNumber: cfdOrderNumber,
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


  const handlePartialPayment = () => {
    if (!hasPartialPayment) return;
    if (!ensureCartHasItems()) return;
    
    // Auto-select first order type if none selected
    if (!cart.selectedOrderTypeId && activeOrderTypes.length > 0) {
      cart.setSelectedOrderTypeId(activeOrderTypes[0].id);
    }
    
    setPartialPaymentDialogOpen(true);
    setMobileCartOpen(false);
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const tenantId = getActiveTenantId();
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": tenantId,
        },
        body: JSON.stringify({ status: newStatus }),
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to update order status");
      }

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

  const handlePartialPaymentSubmit = async (
    amount: number,
    paymentMethod: "cash" | "card" | "ewallet" | "other",
    transactionRef?: string,
    notes?: string
  ) => {
    if (!hasPartialPayment) return;
    if (!ensureCartHasItems()) {
      setPartialPaymentDialogOpen(false);
      return;
    }

    try {
      setIsSubmittingPartialPayment(true);

      const orderResult = await createOrderMutation.mutateAsync(buildOrderPayload());
      const orderId = orderResult.order?.id;
      const orderNumber = orderResult.order?.order_number || orderResult.order?.id;

      const paymentResult = await fetch(`/api/orders/${orderId}/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": getActiveTenantId(),
        },
        credentials: "include",
        body: JSON.stringify({
          amount,
          payment_method: paymentMethod,
          transaction_ref: transactionRef,
          notes,
        }),
      });

      if (!paymentResult.ok) {
        throw new Error((await paymentResult.text()) || "Failed to record payment");
      }

      const paymentData = await paymentResult.json();

      // Show success toast with remaining balance
      const remainingAmount = paymentData.data.remainingAmount;
      toast({
        title: "Partial payment recorded",
        description: `Order #${orderNumber} - Paid: Rp ${amount.toLocaleString("id-ID")} - Remaining: Rp ${remainingAmount.toLocaleString("id-ID")}`,
      });

      // Clear cart and close dialog
      cart.clearCart();
      setPartialPaymentDialogOpen(false);
      setMobileCartOpen(false);
    } catch (error) {
      let errorMessage = "Failed to process partial payment";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      // Try to extract more details from API error response
      const apiError = error as any;
      if (apiError?.response?.data?.message) {
        errorMessage = apiError.response.data.message;
      } else if (apiError?.body?.message) {
        errorMessage = apiError.body.message;
      }
      
      console.error("Partial payment error details:", error);
      
      toast({
        title: "Payment failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSubmittingPartialPayment(false);
    }
  };

  // Save as Draft - NO kitchen ticket dependency
  const handleSaveDraft = async () => {
    if (!ensureCartHasItems()) return;
    
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
        orderResult = await createOrderMutation.mutateAsync(buildOrderPayload());
        
        toast({
          title: "Pesanan disimpan",
          description: `Order #${orderResult.order?.order_number || orderResult.order?.id || "N/A"} berhasil disimpan sebagai draft`,
        });
      }

      cart.clearCart();
      setMobileCartOpen(false);
      
      // Clear the URL parameter if we were continuing an order
      if (continueOrderId) {
        setLocation("/pos");
      }
    } catch (error) {
      const isNetworkError = error instanceof TypeError || (error instanceof Error && /network|fetch/i.test(error.message));

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
        description: error instanceof Error ? error.message : "Gagal membuat pesanan",
        variant: "destructive",
      });
    }
  };
  
  // Send to Kitchen - Separate action, only available when kitchen feature is enabled

  const handleResumeLocalDraft = (draft: any) => {
    cart.clearCart();
    cart.setCustomerName(draft.customerName || "");
    cart.setTableNumber(draft.tableNumber || "");
    const localItems = Array.isArray(draft.items) ? draft.items : [];
    localItems.forEach((item: any) => {
      if (!item?.product) return;
      cart.addItem(item.product, item.variant, item.selectedOptions || [], item.quantity || 1);
    });
    toast({ title: "Draft lokal dimuat", description: `Draft LOCAL-${String(draft.id).slice(0,8)} siap dilanjutkan.` });
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
          items: cart.items.map((item) => ({
            productId: item.product.id,
            name: item.product.name + (item.variant ? ` (${item.variant.name})` : ""),
            quantity: item.quantity,
            variantName: item.variant?.name,
          })),
          customerName: cart.customerName || undefined,
          tableNumber: cart.tableNumber || undefined,
        });
        sendToKDS({ type: "ticket_added", ticket: kitchenTicket });
        toast({
          title: "Tiket dapur disimpan lokal",
          description: "Offline — tiket dikirim ke KDS di perangkat ini. Akan tersinkron saat online.",
        });
      } catch (err) {
        toast({
          title: "Gagal menyimpan tiket dapur",
          description: err instanceof Error ? err.message : "Gagal membuat tiket lokal",
          variant: "destructive",
        });
      }
      return;
    }

    // ── Online: send to server ──────────────────────────────────────────────
    try {
      await createKitchenTicketMutation.mutateAsync({ orderId });
      toast({ title: "Dikirim ke Dapur", description: "Pesanan berhasil dikirim ke dapur" });
      await refetchOrders();
    } catch (error) {
      toast({
        title: "Gagal mengirim ke dapur",
        description: error instanceof Error ? error.message : "Gagal membuat kitchen ticket",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full w-full max-w-[100vw]">
      <OfflineCacheBanner show={!isOnline} />
      {/* Main Content */}
      <div className="flex flex-1 min-h-0 h-full w-full max-w-[100vw]">
      {/* Main Product Area */}
      <ProductArea
        products={products}
        isLoading={productsLoading}
        error={productsError}
        onAddToCart={handleAddToCart}
        orders={orders}
        onUpdateOrderStatus={handleUpdateOrderStatus}
        onOpenDraftSheet={() => setCombinedDraftOpen(true)}
      />

      {/* Cart Panel - Hidden on mobile, shown on tablet (md) and up */}
      <div className="hidden md:flex md:flex-col w-[360px] min-h-0 h-full overflow-hidden flex-col">
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <CartPanel
          items={cart.items}
          onUpdateQty={cart.updateQuantity}
          onRemove={cart.removeItem}
          onClear={cart.clearCart}
          getItemPrice={cart.getItemPrice}
          subtotal={cart.subtotal}
          taxRate={cart.taxRate}
          tax={cart.tax}
          serviceChargeRate={cart.serviceChargeRate}
          serviceCharge={cart.serviceCharge}
          total={cart.total}
          onCharge={handleCharge}
          onPartialPayment={handlePartialPayment}
          onSaveDraft={handleSaveDraft}
          onUpdateNote={cart.updateNote}
          hasPartialPayment={hasPartialPayment}
          isProcessing={isProcessingQuickCharge}
          customerName={cart.customerName}
          setCustomerName={cart.setCustomerName}
          orderNumber={cart.orderNumber}
          tableNumber={cart.tableNumber}
          setTableNumber={cart.setTableNumber}
          paymentMethod={cart.paymentMethod}
          setPaymentMethod={cart.setPaymentMethod}
          orderType={cart.orderType}
          setOrderType={cart.setOrderType}
          continueOrderId={continueOrderId}
          activeOrderTypes={activeOrderTypes}
          setSelectedOrderTypeId={cart.setSelectedOrderTypeId}
          onSetItemDiscount={cart.setItemDiscount}
          orderDiscount={cart.orderDiscount}
          setOrderDiscount={cart.setOrderDiscount}
          itemsDiscountTotal={cart.itemsDiscountTotal}
          orderDiscountAmount={cart.orderDiscountAmount}
          />
        </div>
        
      </div>

      {/* Mobile Bottom Navigation - Only on mobile */}
      {isMobile && (
        <UnifiedBottomNav
          cartCount={cart.items.length}
          onCartClick={() => setMobileCartOpen(true)}
        />
      )}

      {/* Mobile Cart Drawer - Only on mobile */}
      {isMobile && (
        <MobileCartDrawer
        open={mobileCartOpen}
        onOpenChange={setMobileCartOpen}
        items={cart.items}
        onUpdateQty={cart.updateQuantity}
        onRemove={cart.removeItem}
        onClear={cart.clearCart}
        getItemPrice={cart.getItemPrice}
        subtotal={cart.subtotal}
        taxRate={cart.taxRate}
        tax={cart.tax}
        serviceChargeRate={cart.serviceChargeRate}
        serviceCharge={cart.serviceCharge}
        total={cart.total}
        onCharge={() => {
          handleCharge();
          setMobileCartOpen(false);
        }}
        onPartialPayment={handlePartialPayment}
        onSaveDraft={handleSaveDraft}
        onUpdateNote={cart.updateNote}
        hasPartialPayment={hasPartialPayment}
        isProcessing={isProcessingQuickCharge}
        customerName={cart.customerName}
        setCustomerName={cart.setCustomerName}
        orderNumber={cart.orderNumber}
        tableNumber={cart.tableNumber}
        setTableNumber={cart.setTableNumber}
        paymentMethod={cart.paymentMethod}
        setPaymentMethod={cart.setPaymentMethod}
        orderType={cart.orderType}
        setOrderType={cart.setOrderType}
        continueOrderId={continueOrderId}
        activeOrderTypes={activeOrderTypes}
        setSelectedOrderTypeId={cart.setSelectedOrderTypeId}
        onSetItemDiscount={cart.setItemDiscount}
        orderDiscount={cart.orderDiscount}
        setOrderDiscount={cart.setOrderDiscount}
        itemsDiscountTotal={cart.itemsDiscountTotal}
        orderDiscountAmount={cart.orderDiscountAmount}
        />
      )}

      {/* Combined Draft Orders Sheet */}
      <CombinedDraftSheet
        open={combinedDraftOpen}
        onOpenChange={setCombinedDraftOpen}
        onContinueOrder={(orderId) => {
          cart.clearCart();
          setLocation(`/pos?continueOrderId=${orderId}`);
        }}
        onResumeLocalDraft={handleResumeLocalDraft}
      />

      {/* Product Options Dialog */}
      <ProductOptionsDialog
        product={selectedProduct}
        open={!!selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAdd={handleVariantAdd}
      />

      {/* Partial Payment Dialog */}
      {hasPartialPayment && (
        <PartialPaymentDialog
          open={partialPaymentDialogOpen}
          onClose={() => setPartialPaymentDialogOpen(false)}
          onSubmit={handlePartialPaymentSubmit}
          cartTotal={cart.total}
          isSubmitting={isSubmittingPartialPayment}
        />
      )}

      {/* Payment Method Selection Dialog */}
      <PaymentMethodDialog
        open={paymentMethodDialogOpen}
        onClose={() => {
          // Inform user the order was created but not paid
          if (pendingOrderForPayment) {
            toast({
              title: "Order created",
              description: `Order #${pendingOrderForPayment.orderNumber} created. You can complete payment from the Orders page.`,
            });
            cart.clearCart();
          }
          setPaymentMethodDialogOpen(false);
          setPendingOrderForPayment(null);
        }}
        onMethodChange={handleCFDMethodChange}
        onConfirm={handlePaymentMethodConfirm}
        cartTotal={pendingOrderForPayment?.totalAmount || cart.total}
        isSubmitting={isProcessingQuickCharge}
        defaultPaymentMethod={cart.paymentMethod}
      />

      {/* Quick Charge Processing Overlay */}
      {isProcessingQuickCharge && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="dialog-quick-charge-processing">
          <div className="bg-white rounded-lg p-8 flex flex-col items-center gap-4 max-w-xs">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <h2 className="text-lg font-semibold">Processing Order</h2>
            <p className="text-center text-sm text-muted-foreground">
              Creating order and recording payment...
            </p>
          </div>
        </div>
      )}
      </div> {/* end main content */}
    </div>
  );
}
