import { useMemo, useState } from "react";
import { useOrder, useOrders, useRecordPayment } from "@/lib/api/hooks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { UnifiedBottomNav } from "@/components/navigation/UnifiedBottomNav";
import { 
  X, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  ChefHat,
  CheckCircle,
  Search,
  ShoppingBag,
} from "lucide-react";
import type { Order, OrderItem, SelectedOption } from "@pos/domain/orders/types";

const ORDER_STATUS_CONFIG = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-700" },
  confirmed: { label: "Confirmed", color: "bg-blue-100 text-blue-700" },
  preparing: { label: "Preparing", color: "bg-orange-100 text-orange-700" },
  ready: { label: "Ready", color: "bg-emerald-100 text-emerald-700" },
  completed: { label: "Completed", color: "bg-green-100 text-green-700" },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700" },
};

const PAYMENT_STATUS_CONFIG = {
  paid: { label: "PAID", color: "bg-green-100 text-green-700" },
  partial: { label: "PARTIAL", color: "bg-amber-100 text-amber-700" },
  unpaid: { label: "UNPAID", color: "bg-gray-100 text-gray-700" },
};

type OrderStatusFilter = "all" | "confirmed" | "preparing" | "ready" | "served" | "completed";

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
  const { toast } = useToast();

  const { data, isLoading } = useOrders();
  const { data: selectedOrderResponse } = useOrder(selectedOrderId || undefined);
  const recordPaymentMutation = useRecordPayment();

  const normalizedOrders = useMemo(
    () => (data?.orders || []).map((order) => normalizeOrder(order)),
    [data]
  );

  const filteredOrders = useMemo(() => {
    const activeOrders = normalizedOrders.filter(o => 
      ["draft", "confirmed", "preparing", "ready"].includes(o.status)
    );
    
    let result = activeOrders;
    
    if (filterStatus !== "all") {
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
    confirmed: activeOrders.filter(o => o.status === "confirmed").length,
    preparing: activeOrders.filter(o => o.status === "preparing").length,
    ready:     activeOrders.filter(o => o.status === "ready").length,
    served:    normalizedOrders.filter(o => o.status === "served").length,
    completed: normalizedOrders.filter(o => o.status === "completed").length,
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
        {/* Header */}
        <div className="bg-white border-b border-slate-200 p-4 md:p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-800" data-testid="heading-orders">
                Pesanan
              </h1>
              <p className="text-slate-500 text-sm">
                Kelola dan pantau semua pesanan Anda
              </p>
            </div>
            <div className="flex gap-2 text-xs font-bold">
              <div className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg">
                {filterCounts.confirmed} Confirmed
              </div>
              <div className="bg-orange-100 text-orange-700 px-3 py-1.5 rounded-lg">
                {filterCounts.preparing} Prep
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4 justify-between">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Cari pesanan..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-orders"
              />
            </div>

            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto no-scrollbar">
              {(["all", "confirmed", "preparing", "ready", "served", "completed"] as const).map((status) => {
                const labels: Record<string, string> = {
                  all:       "Semua",
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
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition-all whitespace-nowrap ${
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
        </div>

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
                {/* Panel Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800 mb-1">
                      Detail Pesanan
                    </h2>
                    <div className="flex items-center gap-3 text-sm text-slate-500">
                      <span className="font-bold text-slate-800 text-lg">
                        {selectedOrder.customer_name || "Pelanggan"}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedOrderId(null)}
                    className="p-2 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-500"
                    data-testid="button-close-details"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Panel Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 space-y-6">
                  {/* Status Section */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">
                      Status
                    </h3>
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold capitalize ${ORDER_STATUS_CONFIG[selectedOrder.status].color}`}>
                      {selectedOrder.status}
                    </div>
                  </div>

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

                {/* Panel Footer */}
                <div className="p-6 border-t border-slate-200 bg-white">
                  <Button 
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg"
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
