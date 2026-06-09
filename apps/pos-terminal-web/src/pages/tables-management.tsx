import { useState, useMemo, useEffect } from "react";
import { PageHeader } from "@/components/design";
import { useLocation } from "wouter";
import { useTables, useOpenOrders } from "@/lib/api/tableHooks";
import { useCart } from "@/hooks/useCart";
import { getActiveTenantId } from "@/lib/tenant";
import { buildApiHeaders } from "@/lib/outlet";
import { queryClient } from "@/lib/queryClient";
import {
  Search,
  X,
  Users,
  UtensilsCrossed,
  Banknote,
  Edit2,
  ChevronRight,
  CircleDot,
  ReceiptText,
  Clock3,
  AlertOctagon,
  CalendarClock,
  Plus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { UnifiedBottomNav } from "@/components/navigation/UnifiedBottomNav";
import type { Table } from "@pos/domain/seating";

// ─── Status helpers ────────────────────────────────────────────────────────────
type TableStatus = "available" | "occupied" | "reserved" | "maintenance";

const STATUS_CONFIG: Record<TableStatus, {
  label: string;
  dot: string;
  card: string;
  badge: string;
  icon: React.ElementType;
}> = {
  available: {
    label: "Tersedia",
    dot: "bg-emerald-500",
    card: "bg-white border-slate-200 hover:border-emerald-400 hover:shadow-emerald-100/60",
    badge: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    icon: CircleDot,
  },
  occupied: {
    label: "Terisi",
    dot: "bg-orange-500",
    card: "bg-orange-50/60 border-orange-200 hover:border-orange-400",
    badge: "bg-orange-50 text-orange-700 border border-orange-200",
    icon: UtensilsCrossed,
  },
  reserved: {
    label: "Reservasi",
    dot: "bg-blue-500",
    card: "bg-blue-50/40 border-blue-200 hover:border-blue-400",
    badge: "bg-blue-50 text-blue-700 border border-blue-200",
    icon: CalendarClock,
  },
  maintenance: {
    label: "Maintenance",
    dot: "bg-red-500",
    card: "bg-red-50/40 border-red-200",
    badge: "bg-red-50 text-red-700 border border-red-200",
    icon: AlertOctagon,
  },
};

const STATUS_FILTERS = ["all", "available", "occupied", "reserved"] as const;
type FilterType = typeof STATUS_FILTERS[number];

export default function TablesManagementPage() {
  const [, setLocation] = useLocation();
  const cart = useCart();
  const { toast } = useToast();
  const { data: tablesData, isLoading } = useTables();
  const { data: ordersData } = useOpenOrders();
  const [searchTable, setSearchTable] = useState("");
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterType>("all");

  const tables = tablesData?.tables || [];
  const orders = ordersData?.orders || [];

  // ── Real-time update via SSE — invalidate tables & open orders on any change ─
  useEffect(() => {
    const tid = getActiveTenantId();
    const es = new EventSource(`/api/orders/queue/stream?tenant_id=${encodeURIComponent(tid)}`, { withCredentials: true });
    const onUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/open"] });
    };
    es.addEventListener("order_queue_updated", onUpdate as EventListener);
    return () => {
      es.removeEventListener("order_queue_updated", onUpdate as EventListener);
      es.close();
    };
  }, []);

  const getActualTableStatus = (table: Table): TableStatus => {
    if (table.status === "maintenance") return "maintenance";
    if (table.status === "reserved") return "reserved";
    const hasActive = orders.some(
      (o) => o.tableNumber === table.tableNumber && o.status !== "completed" && o.status !== "cancelled"
    );
    return hasActive ? "occupied" : "available";
  };

  const getTableOrders = (table: Table) =>
    orders.filter(
      (o) => o.tableNumber === table.tableNumber && o.status !== "completed" && o.status !== "cancelled"
    );

  const statsCount = useMemo(() => ({
    available: tables.filter((t) => getActualTableStatus(t) === "available").length,
    occupied: tables.filter((t) => getActualTableStatus(t) === "occupied").length,
    reserved: tables.filter((t) => getActualTableStatus(t) === "reserved").length,
    maintenance: tables.filter((t) => getActualTableStatus(t) === "maintenance").length,
  }), [tables, orders]);

  const filteredTables = useMemo(() => {
    return tables.filter((table) => {
      const actualStatus = getActualTableStatus(table);
      const matchesStatus = filterStatus === "all" || actualStatus === filterStatus;
      const q = searchTable.toLowerCase();
      const matchesSearch =
        table.tableNumber.toLowerCase().includes(q) ||
        (table.tableName?.toLowerCase().includes(q) ?? false);
      return matchesStatus && matchesSearch;
    });
  }, [tables, searchTable, filterStatus, orders]);

  const tableOrders = useMemo(() => {
    if (!selectedTable) return [];
    return getTableOrders(selectedTable);
  }, [selectedTable, orders]);

  const fmt = (price: string | number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(
      parseFloat(String(price))
    );

  const handleContinueOrder = async (order: any) => {
    try {
    const _hdrs = buildApiHeaders();
    const res = await fetch(`/api/orders/${order.id}`, { headers: _hdrs, credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch order details");
      const json = await res.json();
      toast({ title: "Order dimuat", description: `Order #${order.orderNumber} siap dilanjutkan.` });
      setLocation(`/pos?continueOrderId=${json.data.id}`);
    } catch {
      toast({ title: "Gagal", description: "Gagal memuat order", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" />
          <span className="text-sm font-medium">Memuat denah meja...</span>
        </div>
      </div>
    );
  }

  const selectedStatus = selectedTable ? getActualTableStatus(selectedTable) : null;
  const selectedConfig = selectedStatus ? STATUS_CONFIG[selectedStatus] : null;

  return (
    <div className="flex h-full overflow-hidden bg-slate-50 relative">

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative pb-[60px] md:pb-0 overflow-hidden">

        {/* ── HEADER ── */}
        <PageHeader
          title="Denah Meja"
          subtitle={`${tables.length} meja terdaftar`}
          onBack={() => setLocation("/hub")}
          actions={
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                {statsCount.available}
              </div>
              <div className="flex items-center gap-1 bg-orange-50 border border-orange-200 text-orange-700 text-xs font-bold px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block" />
                {statsCount.occupied}
              </div>
              {statsCount.reserved > 0 && (
                <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
                  {statsCount.reserved}
                </div>
              )}
            </div>
          }
          bottomContent={

            <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
              <input
                type="text"
                placeholder="Cari meja..."
                className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 outline-none bg-slate-50 focus:bg-white transition-colors"
                value={searchTable}
                onChange={(e) => setSearchTable(e.target.value)}
                data-testid="input-search-tables"
              />
            </div>

            <div className="flex gap-0.5 bg-slate-100 p-0.5 rounded-xl overflow-x-auto no-scrollbar shrink-0">
              {STATUS_FILTERS.map((s) => {
                const count = s === "all" ? tables.length : statsCount[s] ?? 0;
                return (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold capitalize whitespace-nowrap transition-all ${
                      filterStatus === s
                        ? "bg-white text-slate-800 shadow-sm"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                    data-testid={`filter-${s}`}
                  >
                    {s === "all" ? "Semua" : STATUS_CONFIG[s as TableStatus].label}
                    {" "}
                    <span className={`${filterStatus === s ? "text-slate-500" : "text-slate-300"}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
            </div>
          }
        />

        {/* ── TABLE GRID ── */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {filteredTables.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center text-slate-300 gap-2">
              <UtensilsCrossed size={32} className="opacity-50" />
              <p className="text-sm font-medium">Tidak ada meja ditemukan</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredTables.map((table) => {
                const status = getActualTableStatus(table);
                const cfg = STATUS_CONFIG[status];
                const activeOrders = getTableOrders(table);
                const totalAmount = activeOrders.reduce((s, o) => s + parseFloat(String(o.total || 0)), 0);
                const isSelected = selectedTable?.id === table.id;

                return (
                  <button
                    key={table.id}
                    onClick={() => setSelectedTable(isSelected ? null : table)}
                    className={`relative group rounded-2xl border-2 p-4 flex flex-col transition-all duration-200 active:scale-95 text-left shadow-sm hover:shadow-md ${cfg.card} ${
                      isSelected ? "ring-2 ring-offset-2 ring-blue-500 border-blue-400" : ""
                    }`}
                    data-testid={`table-select-${table.tableNumber}`}
                  >
                    {/* Status dot */}
                    <div className="flex items-center justify-between mb-3">
                      <div className={`w-2 h-2 rounded-full ${cfg.dot} ${status === "occupied" ? "animate-pulse" : ""}`} />
                      {status === "occupied" && activeOrders.length > 0 && (
                        <div className="flex items-center gap-0.5 text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded-full">
                          <ReceiptText size={9} />
                          <span className="text-[9px] font-black">{activeOrders.length}</span>
                        </div>
                      )}
                      {status === "maintenance" && (
                        <AlertOctagon size={12} className="text-red-500" />
                      )}
                      {status === "reserved" && (
                        <CalendarClock size={12} className="text-blue-500" />
                      )}
                    </div>

                    {/* Table number */}
                    <div className="flex-1 flex flex-col justify-center my-1">
                      <span className="text-3xl font-black text-slate-800 leading-none tracking-tight">
                        {table.tableNumber}
                      </span>
                      {table.tableName && table.tableName !== table.tableNumber && (
                        <span className="text-[10px] text-slate-400 font-medium mt-1 truncate">
                          {table.tableName}
                        </span>
                      )}
                    </div>

                    {/* Bottom row */}
                    <div className="flex items-end justify-between mt-3 pt-2 border-t border-black/5">
                      <div className="flex items-center gap-1 text-slate-400">
                        <Users size={10} />
                        <span className="text-[10px] font-semibold">{table.capacity}</span>
                      </div>
                      {status === "occupied" && totalAmount > 0 ? (
                        <span className="text-[10px] font-black text-orange-600">
                          {new Intl.NumberFormat("id-ID", { notation: "compact", compactDisplay: "short" }).format(totalAmount)}
                        </span>
                      ) : (
                        <span className={`text-[10px] font-bold ${cfg.badge} px-1.5 py-0.5 rounded-full`}>
                          {cfg.label}
                        </span>
                      )}
                    </div>

                    {/* Hover chevron */}
                    <ChevronRight
                      size={14}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity ${isSelected ? "opacity-100 text-blue-400" : ""}`}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── MOBILE OVERLAY ── */}
      {selectedTable && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-[55] md:hidden"
          onClick={() => setSelectedTable(null)}
        />
      )}

      {/* ── DETAIL PANEL ── */}
      <div
        className={`fixed md:relative inset-x-0 bottom-0 md:inset-auto z-[60] bg-white flex flex-col transition-all duration-300 ease-out
          md:border-l md:border-slate-100
          rounded-t-3xl md:rounded-none
          ${selectedTable
            ? "translate-y-0 md:w-[380px] md:opacity-100"
            : "translate-y-full md:translate-y-0 md:w-0 md:opacity-0 md:overflow-hidden md:border-none"
          }
          h-[88vh] md:h-full shadow-2xl md:shadow-none`}
      >
        {selectedTable && selectedConfig && (
          <>
            {/* Panel Header */}
            <div className="flex-shrink-0 px-5 pt-5 pb-4 border-b border-slate-100">
              {/* Drag handle - mobile only */}
              <div className="flex justify-center mb-4 md:hidden">
                <div className="w-10 h-1 rounded-full bg-slate-200" />
              </div>

              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {/* Big table number badge */}
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl border-2 ${
                    selectedStatus === "occupied"
                      ? "bg-orange-50 border-orange-200 text-orange-700"
                      : selectedStatus === "available"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : selectedStatus === "reserved"
                      ? "bg-blue-50 border-blue-200 text-blue-700"
                      : "bg-red-50 border-red-200 text-red-700"
                  }`}>
                    {selectedTable.tableNumber}
                  </div>
                  <div>
                    <h2 className="text-base font-black text-slate-800 leading-tight">
                      {selectedTable.tableName || `Meja ${selectedTable.tableNumber}`}
                    </h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${selectedConfig.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${selectedConfig.dot}`} />
                        {selectedConfig.label}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Users size={11} />
                        {selectedTable.capacity} kursi
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedTable(null)}
                  className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
                  data-testid="button-close-details"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Panel Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 bg-slate-50/50 space-y-3">
              {/* Section label */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
                  Order Aktif
                </span>
                <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  {tableOrders.length}
                </span>
              </div>

              {tableOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-300">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
                    <UtensilsCrossed size={28} className="opacity-60" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-400">Tidak ada order aktif</p>
                    <p className="text-xs text-slate-300 mt-1">Meja siap untuk pelanggan baru</p>
                  </div>
                </div>
              ) : (
                tableOrders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm"
                  >
                    {/* Order header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-lg">
                          #{order.orderNumber}
                        </span>
                        <span className="text-xs font-semibold text-slate-700">
                          {order.customerName || "Tamu"}
                        </span>
                      </div>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                        order.paymentStatus === "paid"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : order.paymentStatus === "partial"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-red-50 text-red-600 border-red-200"
                      }`}>
                        {order.paymentStatus === "paid"
                          ? "LUNAS"
                          : order.paymentStatus === "partial"
                          ? "SEBAGIAN"
                          : "BELUM BAYAR"}
                      </span>
                    </div>

                    {/* Order items */}
                    <div className="px-4 py-3 space-y-2">
                      {order.orderItems?.slice(0, 3).map((item: any, idx: number) => (
                        <div key={idx} className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-700 truncate">
                              {item.productName || item.product_name}
                            </p>
                            {(item.variant_name || item.variantName) && (
                              <p className="text-[10px] text-slate-400 truncate">
                                {item.variant_name || item.variantName}
                              </p>
                            )}
                          </div>
                          <span className="text-xs font-bold text-slate-500 flex-shrink-0">
                            ×{item.quantity}
                          </span>
                        </div>
                      ))}
                      {order.orderItems && order.orderItems.length > 3 && (
                        <p className="text-[10px] text-slate-400 font-medium">
                          +{order.orderItems.length - 3} item lainnya
                        </p>
                      )}
                    </div>

                    {/* Order total + action */}
                    <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-t border-slate-100">
                      <div>
                        <p className="text-[10px] text-slate-400 font-medium">Total</p>
                        <p className="text-base font-black text-slate-800">
                          {fmt(order.total)}
                        </p>
                      </div>
                      {order.paymentStatus !== "paid" && (
                        <button
                          onClick={() => handleContinueOrder(order)}
                          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-3 py-2 rounded-xl transition-all shadow-sm shadow-blue-200"
                          data-testid={`button-continue-order-${order.id}`}
                        >
                          <Edit2 size={12} />
                          Lanjutkan
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Panel Footer */}
            <div className="flex-shrink-0 px-5 py-4 border-t border-slate-100 bg-white">
              {selectedStatus === "available" ? (
                <button
                  onClick={() => setLocation(`/pos?table=${selectedTable.tableNumber}`)}
                  className="w-full bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-slate-200"
                  data-testid="button-new-order"
                >
                  <Plus size={16} />
                  Order Baru
                </button>
              ) : selectedStatus === "occupied" ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (tableOrders.length > 0) handleContinueOrder(tableOrders[0]);
                    }}
                    className="flex-1 bg-orange-500 hover:bg-orange-600 active:scale-[0.99] text-white py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-orange-200"
                    data-testid="button-checkout-table"
                  >
                    <Banknote size={16} />
                    Bayar
                  </button>
                  <button
                    onClick={() => setLocation(`/pos?table=${selectedTable.tableNumber}`)}
                    className="w-12 h-[54px] bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl flex items-center justify-center transition-colors"
                    title="Tambah order"
                    data-testid="button-add-order"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              ) : selectedStatus === "reserved" ? (
                <button
                  onClick={() => setLocation(`/pos?table=${selectedTable.tableNumber}`)}
                  className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
                  data-testid="button-new-order"
                >
                  <Plus size={16} />
                  Mulai Order
                </button>
              ) : (
                <div className="flex items-center justify-center gap-2 py-3 text-red-500 bg-red-50 rounded-2xl border border-red-200">
                  <AlertOctagon size={16} />
                  <span className="text-sm font-bold">Sedang Maintenance</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Mobile Bottom Navigation */}
      <UnifiedBottomNav cartCount={cart.items.length} />
    </div>
  );
}
