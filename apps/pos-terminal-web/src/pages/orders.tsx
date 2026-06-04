import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useOrder, useOrders, useRecordPayment } from "@/lib/api/hooks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { UnifiedBottomNav } from "@/components/navigation/UnifiedBottomNav";
import { PageHeader } from "@/components/design";
import { 
  X, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  ChefHat,
  CheckCircle,
  Search,
  ShoppingBag,
  Printer,
} from "lucide-react";
import type { Order, OrderItem, SelectedOption } from "@pos/domain/orders/types";
import { enqueuePrintJob, markPrinting, markPrinted, markPrintFailed, getOrCreateTerminalIdentity } from "@pos/offline";
import { bluetoothReceiptPrinter } from "@/lib/receiptPrinter";
import { getActiveTenantId } from "@/lib/tenant";
import { useTenantProfile } from "@/hooks/api/useTenantProfile";

const ORDER_STATUS_CONFIG = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-700" },
  confirmed: { label: "Confirmed", color: "bg-blue-100 text-blue-700" },
  preparing: { label: "Preparing", color: "bg-orange-100 text-orange-700" },
  ready: { label: "Ready", color: "bg-emerald-100 text-emerald-700" },
  served: { label: "Disajikan", color: "bg-teal-100 text-teal-700" },
  completed: { label: "Completed", color: "bg-green-100 text-green-700" },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700" },
};

const PAYMENT_STATUS_CONFIG = {
  paid: { label: "PAID", color: "bg-green-100 text-green-700" },
  partial: { label: "PARTIAL", color: "bg-amber-100 text-amber-700" },
  unpaid: { label: "UNPAID", color: "bg-gray-100 text-gray-700" },
};

type OrderStatusFilter = "all" | "draft" | "confirmed" | "preparing" | "ready" | "served" | "completed";

type NormalizedMoneyFields = {
  subtotal: number;
  tax_amount: number;
  service_charge_amount: number;
  discount_amount: number;
  total_amount: number;
  paid_amount: number;
};

type NormalizedOrderItem = Omit<OrderItem, "selected_options"> & {
  selected_options?: SelectedOption[];
};

type NormalizedOrder = Omit<Order, keyof NormalizedMoneyFields | "created_at"> &
  NormalizedMoneyFields & {
    created_at?: Date;
    items: NormalizedOrderItem[];
    payment_status: Order["payment_status"];
  };

const normalizeMoney = (value: unknown): number => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

const normalizeItem = (item: Partial<OrderItem>): NormalizedOrderItem => ({
  id: item.id || crypto.randomUUID(),
  product_id: item.product_id || "",
  product_name: item.product_name || (item as any).productName || "",
  base_price: normalizeMoney(item.base_price ?? (item as any).basePrice),
  variant_id: item.variant_id || (item as any).variantId,
  variant_name: item.variant_name || (item as any).variantName,
  variant_price_delta: normalizeMoney(item.variant_price_delta ?? (item as any).variantPriceDelta),
  selected_options: item.selected_options as SelectedOption[] | undefined,
  selected_option_groups: item.selected_option_groups,
  quantity: item.quantity || 0,
  item_subtotal: normalizeMoney(item.item_subtotal ?? (item as any).itemSubtotal),
  notes: item.notes,
  status: item.status as NormalizedOrderItem["status"],
});

const normalizeOrder = (order: Partial<Order>): NormalizedOrder => {
  const created_at = order.created_at || (order as any).createdAt || (order as any).orderDate;

  return {
    id: order.id || "",
    tenant_id: order.tenant_id || (order as any).tenantId || "",
    order_type_id: order.order_type_id || (order as any).orderTypeId,
    sales_channel:
      (order.sales_channel as NormalizedOrder["sales_channel"]) || (order as any).salesChannel,
    items: Array.isArray(order.items)
      ? order.items.map((item) => normalizeItem(item))
      : [],
    subtotal: normalizeMoney(order.subtotal ?? (order as any).subtotal),
    tax_amount: normalizeMoney(order.tax_amount ?? (order as any).taxAmount),
    service_charge_amount: normalizeMoney(
      order.service_charge_amount ?? (order as any).serviceCharge ?? (order as any).service_charge
    ),
    discount_amount: normalizeMoney(order.discount_amount ?? (order as any).discountAmount),
    total_amount: normalizeMoney(order.total_amount ?? (order as any).total),
    paid_amount: normalizeMoney(order.paid_amount ?? (order as any).paidAmount),
    payment_status: order.payment_status || (order as any).paymentStatus || "unpaid",
    payments: (order as any).payments,
    order_number: order.order_number || (order as any).orderNumber || "-",
    status: order.status || "draft",
    customer_name: order.customer_name || (order as any).customerName,
    table_number: order.table_number || (order as any).tableNumber,
    notes: order.notes,
    created_at: created_at ? new Date(created_at as Date | string) : undefined,
    updated_at: order.updated_at,
    completed_at: order.completed_at,
  };
};

export default function OrdersPage() {
  const [filterStatus, setFilterStatus] = useState<OrderStatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const tenantId = getActiveTenantId();
  const { data: tenantProfile } = useTenantProfile(tenantId);
  const tenantName = (tenantProfile?.tenant as any)?.name ?? "AuraPOS";

  const { data, isLoading } = useOrders({ limit: 100 });
  const { data: selectedOrderResponse } = useOrder(selectedOrderId || undefined);
  const recordPaymentMutation = useRecordPayment();

  const normalizedOrders = useMemo(
    () => (data?.orders || []).map((order) => normalizeOrder(order)),
    [data]
  );

  const filteredOrders = useMemo(() => {
    // When viewing "completed" or "served" tabs, filter from ALL orders
    // When viewing "all" or active status tabs, show only active orders
    const isActiveStatus = ["draft", "confirmed", "preparing", "ready"].includes(filterStatus);
    const showAll = filterStatus === "all";
    
    let result = (showAll || isActiveStatus)
      ? normalizedOrders.filter(o => 
          ["draft", "confirmed", "preparing", "ready"].includes(o.status)
        )
      : normalizedOrders.filter(o => o.status === filterStatus);
    
    if (!showAll && isActiveStatus) {
      result = result.filter(o => o.status === filterStatus);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(o =>
        o.customer_name?.toLowerCase().includes(query) ||
        o.order_number?.toLowerCase().includes(query) ||
        o.table_number?.toString().includes(query)
      );
    }
    
    return result;
  }, [normalizedOrders, filterStatus, searchQuery]);

  const selectedOrder = useMemo(() => {
    if (selectedOrderResponse) return normalizeOrder(selectedOrderResponse);
    if (selectedOrderId) return normalizedOrders.find((order) => order.id === selectedOrderId) || null;
    return null;
  }, [normalizedOrders, selectedOrderId, selectedOrderResponse]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(price);
  };

  const formatDate = (date: Date | string | undefined | null) => {
    if (!date) return "-";
    const parsedDate = new Date(date);
    if (!Number.isFinite(parsedDate.getTime())) return "-";
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(parsedDate);
  };

  const activeOrders = normalizedOrders.filter(o =>
    ["draft", "confirmed", "preparing", "ready", "served"].includes(o.status)
  );

  const filterCounts = {
    all:       activeOrders.length,
    draft:     activeOrders.filter(o => o.status === "draft").length,
    confirmed: activeOrders.filter(o => o.status === "confirmed").length,
    preparing: activeOrders.filter(o => o.status === "preparing").length,
    ready:     activeOrders.filter(o => o.status === "ready").length,
    served:    normalizedOrders.filter(o => o.status === "served").length,
    completed: normalizedOrders.filter(o => o.status === "completed").length,
  };

  const handleReprintReceipt = async () => {
    if (!selectedOrder) return;
    setIsPrinting(true);

    const receiptPayload = {
      orderNumber: selectedOrder.order_number,
      tenantName,
      customerName: selectedOrder.customer_name || "",
      tableNumber: selectedOrder.table_number || "",
      paymentMethod: (selectedOrder.payments as any)?.[0]?.payment_method || "cash",
      createdAt: selectedOrder.created_at ? new Date(selectedOrder.created_at) : new Date(),
      subtotal: selectedOrder.subtotal,
      tax: selectedOrder.tax_amount,
      serviceCharge: selectedOrder.service_charge_amount,
      total: selectedOrder.total_amount,
      items: (selectedOrder.items || []).map((item) => ({
        name: item.product_name,
        qty: item.quantity,
        unitPrice: item.quantity > 0 ? Math.round(item.item_subtotal / item.quantity) : 0,
        total: item.item_subtotal,
      })),
    };

    let printJobId: string | null = null;
    try {
      const terminal = await getOrCreateTerminalIdentity(tenantId);
      const job = await enqueuePrintJob({
        tenantId,
        terminalId: terminal.terminalId,
        serverOrderId: selectedOrder.id,
        orderNumber: selectedOrder.order_number,
        type: "receipt",
        payload: receiptPayload,
      });
      printJobId = job.id;
    } catch {
      // non-critical
    }

    try {
      if (printJobId) await markPrinting(printJobId).catch(() => undefined);
      await bluetoothReceiptPrinter.reconnectIfPossible().catch(() => false);
      await bluetoothReceiptPrinter.print(receiptPayload);
      if (printJobId) await markPrinted(printJobId).catch(() => undefined);
      toast({ title: "Struk dicetak", description: `Order #${selectedOrder.order_number} berhasil dicetak.` });
    } catch (err) {
      if (printJobId) await markPrintFailed(printJobId, err instanceof Error ? err.message : "Print gagal").catch(() => undefined);
      toast({
        title: printJobId ? "Struk disimpan ke antrian cetak" : "Cetak struk gagal",
        description: printJobId
          ? "Buka Printer Hub untuk cetak ulang kapan saja."
          : "Hubungkan printer Bluetooth terlebih dahulu.",
        variant: printJobId ? "default" : "destructive",
      });
    } finally {
      setIsPrinting(false);
    }
  };

  const handleProcessTransaction = async () => {
    if (!selectedOrder) return;
    const remainingAmount = selectedOrder.total_amount - selectedOrder.paid_amount;

    if (remainingAmount <= 0) {
      toast({
        title: "Sudah Terbayar",
        description: "Pesanan ini sudah lunas.",
        variant: "destructive",
      });
      return;
    }

    try {
      await recordPaymentMutation.mutateAsync({
        orderId: selectedOrder.id,
        amount: remainingAmount,
        payment_method: "cash",
      });
      toast({
        title: "Berhasil",
        description: `Pembayaran ${formatPrice(remainingAmount)} berhasil dicatat.`,
      });
    } catch (error) {
      toast({
        title: "Gagal",
        description: error instanceof Error ? error.message : "Gagal mencatat pembayaran",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex h-full overflow-hidden bg-slate-50 relative">
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative pb-[60px] md:pb-0">
        <PageHeader
          title="Pesanan"
          subtitle="Kelola dan pantau semua pesanan"
          onBack={() => setLocation("/hub")}
          actions={
            <div className="flex gap-2 text-xs font-bold">
              <div className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg" data-testid="badge-confirmed-count">
                {filterCounts.confirmed} Confirmed
              </div>
              <div className="bg-orange-100 text-orange-700 px-3 py-1.5 rounded-lg" data-testid="badge-preparing-count">
                {filterCounts.preparing} Prep
              </div>
            </div>
          }
          bottomContent={
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Cari pesanan..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search-orders"
                />
              </div>
              <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto no-scrollbar">
                {(["all", "draft", "confirmed", "preparing", "ready", "served", "completed"] as const).map((status) => {
                  const labels: Record<string, string> = {
                    all:       "Semua",
                    draft:     "Ditunda",
                    confirmed: "Dikonfirmasi",
                    preparing: "Diproses",
                    ready:     "Siap Saji",
                    served:    "Disajikan",
                    completed: "Selesai",
                  };
                  return (
                    <button
                      key={status}
                      onClick={() => setFilterStatus(status)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all whitespace-nowrap ${
                        filterStatus === status
                          ? "bg-white text-slate-800 shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                      data-testid={`filter-${status}`}
                    >
                      {labels[status] ?? status}
                      {` (${filterCounts[status]})`}
                    </button>
                  );
                })}
              </div>
            </div>
          }
        />

        {/* Content Area */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Orders List */}
          <div className="flex-1 flex flex-col overflow-hidden md:border-r border-slate-200">
            <ScrollArea className="flex-1 overflow-auto">
              <div className="p-4 md:p-6 space-y-4">
                {isLoading ? (
                  <div className="text-center py-16 text-slate-500">
                    Memuat pesanan...
                  </div>
                ) : filteredOrders.length === 0 ? (
                  <div className="text-center py-16 text-slate-500">
                    Tidak ada pesanan
                  </div>
                ) : (
                  filteredOrders.map((order) => {
                    const statusConfig = ORDER_STATUS_CONFIG[order.status];
                    const paymentConfig = PAYMENT_STATUS_CONFIG[order.payment_status] || PAYMENT_STATUS_CONFIG["unpaid"];

                    return (
                      <button
                        key={order.id}
                        onClick={() => setSelectedOrderId(order.id)}
                        className={`w-full text-left bg-white rounded-xl border border-slate-200 shadow-sm p-4 transition-all hover:border-slate-300 hover:shadow-md ${
                          selectedOrder?.id === order.id 
                            ? "ring-2 ring-blue-500 border-blue-500" 
                            : ""
                        }`}
                        data-testid={`order-card-${order.id}`}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded w-fit mb-1">
                              #{order.order_number}
                            </div>
                            <div className="font-bold text-slate-800 text-sm">
                              {order.customer_name || "Pelanggan"}
                            </div>
                          </div>
                          <div className={`text-[10px] font-bold px-2 py-0.5 rounded ${statusConfig.color}`}>
                            {statusConfig.label}
                          </div>
                        </div>

                        <div className="space-y-1 mb-3">
                          <div className="text-xs text-slate-600">
                            {order.items?.length || 0} item{(order.items?.length || 0) !== 1 ? "s" : ""}
                          </div>
                          {order.items && order.items.slice(0, 2).map((item: any, idx: number) => (
                            <div key={idx} className="text-xs text-slate-500">
                              {item.product_name} x{item.quantity}
                            </div>
                          ))}
                          {order.items && order.items.length > 2 && (
                            <div className="text-xs text-slate-400 italic">
                              +{order.items.length - 2} more items
                            </div>
                          )}
                        </div>

                        <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                          <span className="text-sm font-bold text-slate-600">
                            {formatDate(order.created_at)}
                          </span>
                          <div className="flex items-center gap-2">
                            <div className={`text-[10px] font-bold px-2 py-0.5 rounded ${paymentConfig.color}`}>
                              {paymentConfig.label}
                            </div>
                            <span className="text-lg font-black text-slate-800">
                              {formatPrice(order.total_amount)}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Detail Panel */}
          <div
            className={`fixed md:relative inset-x-0 bottom-0 md:inset-auto md:w-[400px] md:h-full z-[60] bg-white border-l border-slate-200 shadow-2xl md:shadow-none flex flex-col transition-transform duration-300 ease-out ${
              selectedOrder
                ? "translate-y-0"
                : "translate-y-full md:translate-x-full md:translate-y-0 md:w-0 md:border-none"
            } rounded-t-3xl md:rounded-none h-[85vh] md:h-auto`}
          >
            {selectedOrder ? (
              <>
                {/* Panel Header — compact single row */}
                <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
                  {/* Drag handle on mobile */}
                  <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-10 h-1 bg-slate-200 rounded-full md:hidden" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-800 text-base truncate">
                        {selectedOrder.customer_name || "Pelanggan"}
                      </span>
                      <span className="text-xs text-slate-400 font-mono truncate">
                        #{selectedOrder.order_number}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold capitalize ${ORDER_STATUS_CONFIG[selectedOrder.status].color}`}>
                        {selectedOrder.status}
                      </span>
                      <span className="text-xs text-slate-400">
                        {selectedOrder.items?.length || 0} item
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedOrderId(null)}
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-500 flex-shrink-0"
                    data-testid="button-close-details"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Panel Content */}
                <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50 space-y-4">


                  {/* Order Items Section */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <ShoppingBag size={16} /> Item Pesanan ({selectedOrder.items?.length || 0})
                    </h3>
                    {!selectedOrder.items || selectedOrder.items.length === 0 ? (
                      <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center flex flex-col items-center gap-2 text-slate-400">
                        <ChefHat size={32} className="opacity-50" />
                        <p className="text-sm">Tidak ada item</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {selectedOrder.items.map((item, idx) => (
                          <div
                            key={idx}
                            className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm"
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div className="font-bold text-slate-800 text-sm">
                                {item.product_name}
                              </div>
                              <span className="text-sm font-bold text-slate-800">
                                x{item.quantity}
                              </span>
                            </div>
                            {item.variant_name && (
                              <div className="text-xs text-slate-600 mb-2">
                                {item.variant_name}
                              </div>
                            )}
                            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                              <span className="text-xs text-slate-600">
                                Unit
                              </span>
                              <span className="text-sm font-bold text-slate-800">
                                {formatPrice(item.item_subtotal / item.quantity)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Summary Section */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">
                      Ringkasan
                    </h3>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Subtotal</span>
                        <span className="text-slate-800 font-medium">{formatPrice(selectedOrder.subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Pajak</span>
                        <span className="text-slate-800 font-medium">{formatPrice(selectedOrder.tax_amount)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Biaya Layanan</span>
                        <span className="text-slate-800 font-medium">{formatPrice(selectedOrder.service_charge_amount)}</span>
                      </div>
                      {selectedOrder.discount_amount > 0 && (
                        <div className="flex justify-between text-sm text-green-600">
                          <span>Diskon</span>
                          <span>-{formatPrice(selectedOrder.discount_amount)}</span>
                        </div>
                      )}
                      <div className="border-t border-slate-100 pt-2 flex justify-between font-bold text-base">
                        <span className="text-slate-800">Total</span>
                        <span className="text-slate-800">{formatPrice(selectedOrder.total_amount)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Panel Footer — horizontal layout saves vertical space */}
                <div className="px-4 py-3 border-t border-slate-200 bg-white flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-shrink-0 font-semibold py-2 px-3 rounded-lg text-sm"
                    data-testid="button-reprint-receipt"
                    onClick={handleReprintReceipt}
                    disabled={isPrinting}
                  >
                    <Printer size={14} />
                  </Button>
                  <Button 
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg text-sm"
                    data-testid="button-process-transaction"
                    onClick={handleProcessTransaction}
                    disabled={recordPaymentMutation.isPending || selectedOrder.payment_status === "paid"}
                  >
                    {recordPaymentMutation.isPending ? "Memproses..." : "Proses Transaksi"}
                  </Button>

                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400">
                Pilih pesanan
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Overlay */}
      {selectedOrder && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-[1px] z-[55] md:hidden"
          onClick={() => setSelectedOrderId(null)}
        />
      )}

      {/* Mobile Bottom Navigation */}
      <UnifiedBottomNav cartCount={0} />
    </div>
  );
}
