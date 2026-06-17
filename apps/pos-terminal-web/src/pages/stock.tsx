import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import {
  Package,
  AlertCircle,
  History,
  Plus,
  Minus,
  Check,
  X,
  ArrowUpCircle,
  ArrowDownCircle,
  Lock,
  Search,
  RefreshCw,
  ClipboardList,
  BarChart2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Filter,
  FileSearch,
  ArrowLeftRight,
  BellRing,
  ChevronDown,
  ChevronRight,
  Send,
  Truck,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/design";
import {
  useStockProducts,
  useAdjustStock,
  useInventoryMovements,
  useProductMovements,
  useCreateMovement,
  useInventoryReport,
  MOVEMENT_TYPE_LABELS,
  type StockProduct,
  type MovementsFilter,
} from "@/hooks/api/useInventory";
import {
  useLowStockItems,
  useSetLowStockThreshold,
  useOpnames,
  useOpnameDetail,
  useCreateOpname,
  useUpdateOpnameItem,
  useSubmitOpname,
  useApproveOpname,
  useCancelOpname,
  useTransfers,
  useTransferDetail,
  useCreateTransfer,
  useSubmitTransfer,
  useReceiveTransfer,
  useCancelTransfer,
  type StockOpname,
  type StockTransfer,
} from "@/hooks/api/useInventoryAdvanced";
import { useTenant } from "@/context/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { useOutlets } from "@/hooks/api/useOutlets";

const formatIDR = (v: number | string) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(Number(v));

const formatDate = (d: string) =>
  new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(d));

// ── MOVEMENT TYPES available to the user in advanced mode ────────────────────
const MOVEMENT_OPTIONS = [
  { value: "ADJUSTMENT_IN",  label: "Tambah Stok",    sign: +1 },
  { value: "ADJUSTMENT_OUT", label: "Kurang Stok",    sign: -1 },
  { value: "PURCHASE",       label: "Pembelian Baru", sign: +1 },
  { value: "DAMAGE",         label: "Rusak/Terbuang", sign: -1 },
  { value: "RETURN",         label: "Retur Masuk",    sign: +1 },
] as const;

// ── Quick Adjust Inline ───────────────────────────────────────────────────────
function QuickAdjust({ product, onDone }: { product: StockProduct; onDone: () => void }) {
  const [value, setValue] = useState(product.stockQty.toString());
  const adjust = useAdjustStock();
  const { addToast } = useToast();

  const handleSave = async () => {
    const qty = parseInt(value, 10);
    if (isNaN(qty)) return;
    try {
      await adjust.mutateAsync({ productId: product.id, qty, mode: "set" });
      addToast("Stok diperbarui", "success");
      onDone();
    } catch {
      addToast("Gagal memperbarui stok", "error");
    }
  };

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setValue((v) => String(Math.max(0, parseInt(v || "0") - 1)))}
        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
      >
        <Minus size={12} />
      </button>
      <input
        type="number"
        className="w-14 text-center border border-slate-300 rounded-lg px-1 py-1 text-sm font-bold focus:outline-none focus:border-blue-400"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onDone(); }}
        autoFocus
      />
      <button
        onClick={() => setValue((v) => String(parseInt(v || "0") + 1))}
        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
      >
        <Plus size={12} />
      </button>
      <button
        onClick={handleSave}
        disabled={adjust.isPending}
        className="w-7 h-7 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center"
      >
        <Check size={12} />
      </button>
      <button
        onClick={onDone}
        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
      >
        <X size={12} />
      </button>
    </div>
  );
}

// ── Advanced Movement Dialog ──────────────────────────────────────────────────
function AdvancedAdjustDialog({
  product,
  onClose,
}: {
  product: StockProduct;
  onClose: () => void;
}) {
  const [movType, setMovType] = useState<string>("ADJUSTMENT_IN");
  const [qty, setQty] = useState("1");
  const [notes, setNotes] = useState("");
  const createMov = useCreateMovement();
  const { addToast } = useToast();

  const selectedOption = MOVEMENT_OPTIONS.find((o) => o.value === movType)!;
  const delta = (parseInt(qty, 10) || 0) * selectedOption.sign;
  const preview = product.stockQty + delta;

  const handleSubmit = async () => {
    if (!qty || parseInt(qty) <= 0) return;
    try {
      await createMov.mutateAsync({
        productId: product.id,
        movementType: movType,
        quantityDelta: delta,
        notes: notes || undefined,
      });
      addToast("Pergerakan stok dicatat", "success");
      onClose();
    } catch {
      addToast("Gagal mencatat pergerakan stok", "error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-bold text-slate-800 text-base">Catat Pergerakan Stok</h3>
            <p className="text-sm text-slate-500 mt-0.5 truncate max-w-xs">{product.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
        </div>

        {/* Movement Type */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-500">Tipe Pergerakan</label>
          <div className="grid grid-cols-2 gap-2">
            {MOVEMENT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setMovType(opt.value)}
                className={`text-xs font-bold px-3 py-2 rounded-xl border text-left transition-all ${
                  movType === opt.value
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
                }`}
              >
                <span className="mr-1">{opt.sign > 0 ? "+" : "−"}</span>{opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Qty */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-500">Jumlah Unit</label>
          <input
            type="number"
            min="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            placeholder="1"
          />
        </div>

        {/* Stok preview */}
        <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between text-sm">
          <span className="text-slate-500">Stok sekarang</span>
          <span className="font-bold text-slate-700">{product.stockQty}</span>
          <span className="text-slate-400 font-bold mx-1">→</span>
          <span className={`font-black text-base ${preview < 0 ? "text-red-600" : preview < 10 ? "text-orange-600" : "text-emerald-600"}`}>
            {preview}
          </span>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-500">Catatan (opsional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Contoh: Pembelian dari supplier X, No. PO: 001"
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none h-16"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={createMov.isPending || !qty || parseInt(qty) <= 0}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
          >
            {createMov.isPending ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Product History Drawer ────────────────────────────────────────────────────
function ProductHistoryDrawer({ product, onClose }: { product: StockProduct; onClose: () => void }) {
  const { data, isLoading } = useProductMovements(product.id);
  const movements = data?.data.movements ?? [];

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl w-full max-w-lg max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white rounded-t-2xl">
          <div>
            <h3 className="font-bold text-slate-800">Riwayat Stok</h3>
            <p className="text-xs text-slate-500 truncate max-w-xs">{product.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoading ? (
            <div className="text-center py-8 text-slate-400 text-sm">Memuat riwayat...</div>
          ) : movements.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">Belum ada riwayat pergerakan stok</div>
          ) : (
            movements.map((m) => {
              const meta = MOVEMENT_TYPE_LABELS[m.movementType] ?? { label: m.movementType, color: "text-slate-600 bg-slate-50 border-slate-200" };
              const isPositive = m.quantityDelta > 0;
              return (
                <div key={m.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className={`mt-0.5 ${isPositive ? "text-emerald-500" : "text-red-400"}`}>
                    {isPositive ? <ArrowUpCircle size={16} /> : <ArrowDownCircle size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${meta.color}`}>{meta.label}</span>
                      <span className={`text-sm font-black ${isPositive ? "text-emerald-600" : "text-red-500"}`}>
                        {isPositive ? "+" : ""}{m.quantityDelta}
                      </span>
                      {m.quantityBefore != null && m.quantityAfter != null && (
                        <span className="text-xs text-slate-400">{m.quantityBefore} → {m.quantityAfter}</span>
                      )}
                    </div>
                    {m.notes && <p className="text-xs text-slate-500 mt-1 truncate">{m.notes}</p>}
                    <p className="text-[10px] text-slate-400 mt-1">{formatDate(m.createdAt)}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

const ALL_MOVEMENT_FILTER_OPTIONS = [
  { value: "", label: "Semua Tipe" },
  { value: "SALE", label: "Terjual" },
  { value: "OFFLINE_SALE", label: "Offline" },
  { value: "ADJUSTMENT_IN", label: "Tambah" },
  { value: "ADJUSTMENT_OUT", label: "Kurang" },
  { value: "PURCHASE", label: "Pembelian" },
  { value: "DAMAGE", label: "Rusak" },
  { value: "RETURN", label: "Retur" },
  { value: "INITIAL", label: "Awal" },
  { value: "OPNAME_ADJUSTMENT", label: "Opname" },
  { value: "TRANSFER_OUT", label: "Transfer Keluar" },
  { value: "TRANSFER_IN", label: "Transfer Masuk" },
];

// ── All Movements Tab ─────────────────────────────────────────────────────────
function AllMovementsTab() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const filters: MovementsFilter = useMemo(() => ({
    ...(typeFilter ? { type: typeFilter } : {}),
    limit: 100,
  }), [typeFilter]);

  const { data, isLoading, refetch, isFetching } = useInventoryMovements(filters);
  const movements = data?.data.movements ?? [];

  const filtered = useMemo(() =>
    search
      ? movements.filter((m) =>
          (m.productName ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (m.notes ?? "").toLowerCase().includes(search.toLowerCase())
        )
      : movements,
    [movements, search]
  );

  return (
    <div className="space-y-3">
      {/* Search + refresh */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari produk atau catatan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 transition-colors"
        >
          <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Type filter chips */}
      <div className="flex gap-1.5 flex-wrap">
        <Filter size={12} className="text-slate-400 self-center flex-shrink-0" />
        {ALL_MOVEMENT_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setTypeFilter(opt.value)}
            data-testid={`filter-type-${opt.value || "all"}`}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
              typeFilter === opt.value
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Memuat riwayat...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">
          {search || typeFilter ? "Tidak ada hasil sesuai filter" : "Belum ada riwayat pergerakan stok"}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 font-bold">
              <tr>
                <th className="p-3 text-left">Produk</th>
                <th className="p-3 text-left">Tipe</th>
                <th className="p-3 text-center">Delta</th>
                <th className="p-3 text-center hidden md:table-cell">Sebelum → Sesudah</th>
                <th className="p-3 text-right">Waktu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((m) => {
                const meta = MOVEMENT_TYPE_LABELS[m.movementType] ?? { label: m.movementType, color: "text-slate-600 bg-slate-50 border-slate-200" };
                const isPos = m.quantityDelta > 0;
                return (
                  <tr key={m.id} className="hover:bg-slate-50 transition-colors" data-testid={`movement-row-${m.id}`}>
                    <td className="p-3">
                      <p className="font-semibold text-slate-700 truncate max-w-[120px]">{m.productName}</p>
                      {m.notes && <p className="text-[10px] text-slate-400 truncate max-w-[120px]">{m.notes}</p>}
                    </td>
                    <td className="p-3">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${meta.color}`}>{meta.label}</span>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`font-black text-sm ${isPos ? "text-emerald-600" : "text-red-500"}`}>
                        {isPos ? "+" : ""}{m.quantityDelta}
                      </span>
                    </td>
                    <td className="p-3 text-center text-xs text-slate-400 hidden md:table-cell">
                      {m.quantityBefore ?? "–"} → {m.quantityAfter ?? "–"}
                    </td>
                    <td className="p-3 text-right text-xs text-slate-400 whitespace-nowrap">{formatDate(m.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Laporan Tab ───────────────────────────────────────────────────────────────
function LaporanTab() {
  const [period, setPeriod] = useState(30);
  const { data, isLoading, isError, error, refetch } = useInventoryReport(period);
  const report = data?.data;

  const formatIDRLocal = (v: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);

  const PERIOD_OPTIONS = [
    { value: 7, label: "7 Hari" },
    { value: 30, label: "30 Hari" },
    { value: 90, label: "90 Hari" },
  ];

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-slate-500">Periode:</span>
        <div className="flex gap-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              data-testid={`period-${opt.value}`}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                period === opt.value
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-500 border-slate-200 hover:border-blue-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Memuat laporan...</div>
      ) : isError ? (
        <div className="text-center py-12 space-y-3">
          <p className="text-sm font-semibold text-red-500">Gagal memuat laporan</p>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">{(error as Error)?.message ?? "Terjadi kesalahan server"}</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Coba Lagi
          </button>
        </div>
      ) : !report ? (
        <div className="text-center py-16 text-slate-400 text-sm">Memuat data...</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
                  <ShoppingCart size={13} className="text-blue-600" />
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Unit Terjual</span>
              </div>
              <p className="text-2xl font-black text-slate-800" data-testid="text-total-units-sold">
                {report.salesSummary.totalUnitsSold.toLocaleString("id-ID")}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">dari {report.salesSummary.totalOrders} transaksi</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-7 h-7 bg-emerald-100 rounded-lg flex items-center justify-center">
                  <DollarSign size={13} className="text-emerald-600" />
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Nilai Stok</span>
              </div>
              <p className="text-lg font-black text-slate-800 truncate" data-testid="text-stock-value">
                {formatIDRLocal(report.stockValue.totalValue)}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">{report.stockValue.totalUnits} unit tersisa ({report.stockValue.totalTracked} produk)</p>
            </div>
          </div>

          {/* Top 10 produk terlaku */}
          {report.topSold.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                <TrendingUp size={14} className="text-emerald-600" />
                <h3 className="font-bold text-slate-700 text-sm">Top Produk Terlaku</h3>
                <span className="text-[10px] text-slate-400">({period} hari terakhir)</span>
              </div>
              <div className="divide-y divide-slate-50">
                {report.topSold.map((item, idx) => (
                  <div key={item.productId} className="px-4 py-2.5 flex items-center gap-3" data-testid={`top-sold-${item.productId}`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 ${
                      idx === 0 ? "bg-amber-400 text-white" :
                      idx === 1 ? "bg-slate-300 text-slate-700" :
                      idx === 2 ? "bg-orange-300 text-white" :
                      "bg-slate-100 text-slate-500"
                    }`}>{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-700 truncate text-sm">{item.productName}</p>
                      <p className="text-[10px] text-slate-400">{item.category}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-black text-slate-800 text-sm">{item.totalSold}</p>
                      <p className="text-[10px] text-slate-400">unit</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Movement breakdown */}
          {report.movementBreakdown.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                <BarChart2 size={14} className="text-blue-600" />
                <h3 className="font-bold text-slate-700 text-sm">Breakdown Pergerakan</h3>
                <span className="text-[10px] text-slate-400">({period} hari terakhir)</span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 font-bold">
                  <tr>
                    <th className="px-4 py-2 text-left">Tipe</th>
                    <th className="px-4 py-2 text-center">Transaksi</th>
                    <th className="px-4 py-2 text-center text-emerald-600">Masuk</th>
                    <th className="px-4 py-2 text-center text-red-500">Keluar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {report.movementBreakdown.map((row) => {
                    const meta = MOVEMENT_TYPE_LABELS[row.movementType] ?? { label: row.movementType, color: "text-slate-600 bg-slate-50 border-slate-200" };
                    return (
                      <tr key={row.movementType} className="hover:bg-slate-50" data-testid={`breakdown-${row.movementType}`}>
                        <td className="px-4 py-2.5">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${meta.color}`}>{meta.label}</span>
                        </td>
                        <td className="px-4 py-2.5 text-center font-bold text-slate-700">{row.count}</td>
                        <td className="px-4 py-2.5 text-center text-emerald-600 font-semibold">
                          {row.totalIn > 0 ? `+${row.totalIn}` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-center text-red-500 font-semibold">
                          {row.totalOut > 0 ? `-${row.totalOut}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {report.topSold.length === 0 && report.movementBreakdown.length === 0 && (
            <div className="text-center py-12 text-slate-400 text-sm">
              Belum ada pergerakan stok dalam {period} hari terakhir
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Low Stock Tab ──────────────────────────────────────────────────────────────
function LowStockTab() {
  const { data, isLoading, refetch, isFetching } = useLowStockItems();
  const setThreshold = useSetLowStockThreshold();
  const { addToast } = useToast();
  const items = data?.data.items ?? [];
  const [editingThreshold, setEditingThreshold] = useState<{ productId: string; value: string } | null>(null);

  const handleSaveThreshold = async (productId: string, value: string) => {
    const t = parseInt(value, 10);
    if (isNaN(t) || t < 0) return;
    try {
      await setThreshold.mutateAsync({ productId, threshold: t });
      addToast("Threshold stok rendah diperbarui", "success");
      setEditingThreshold(null);
    } catch {
      addToast("Gagal memperbarui threshold", "error");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Produk yang stoknya berada di bawah atau sama dengan threshold</p>
        <button onClick={() => refetch()} disabled={isFetching} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
          <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Memuat data stok rendah...</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-12 gap-3">
          <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center">
            <CheckCircle2 size={22} className="text-emerald-600" />
          </div>
          <p className="font-bold text-slate-700 text-sm">Semua stok aman</p>
          <p className="text-xs text-slate-400">Tidak ada produk di bawah threshold stok rendah</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2 bg-orange-50 border-b border-orange-100 flex items-center gap-2">
            <BellRing size={13} className="text-orange-500" />
            <span className="text-xs font-bold text-orange-700">{items.length} produk butuh perhatian</span>
          </div>
          {items.map((item, idx) => (
            <div key={item.productId} data-testid={`low-stock-row-${item.productId}`} className={`p-3 flex items-center gap-3 ${idx > 0 ? "border-t border-slate-100" : ""}`}>
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${item.isOutOfStock ? "bg-red-500" : "bg-orange-400"}`} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-800 text-sm truncate">{item.productName}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-slate-400">{item.category}</span>
                  {item.sku && <span className="text-[10px] text-slate-400">SKU: {item.sku}</span>}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-right">
                  <p className={`font-black text-base ${item.isOutOfStock ? "text-red-600" : "text-orange-600"}`}>{item.quantity}</p>
                  <p className="text-[10px] text-slate-400">stok saat ini</p>
                </div>
                <div className="text-right">
                  {editingThreshold?.productId === item.productId ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        className="w-16 border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-center focus:outline-none focus:border-blue-400"
                        value={editingThreshold.value}
                        onChange={(e) => setEditingThreshold({ productId: item.productId, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveThreshold(item.productId, editingThreshold.value);
                          if (e.key === "Escape") setEditingThreshold(null);
                        }}
                        autoFocus
                      />
                      <button onClick={() => handleSaveThreshold(item.productId, editingThreshold.value)} className="w-6 h-6 bg-emerald-500 text-white rounded-md flex items-center justify-center">
                        <Check size={11} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingThreshold({ productId: item.productId, value: String(item.threshold) })}
                      className="text-right hover:bg-slate-50 rounded-lg p-1 transition-colors"
                      title="Klik untuk ubah threshold"
                      data-testid={`threshold-edit-${item.productId}`}
                    >
                      <p className="font-bold text-xs text-slate-500">{item.threshold}</p>
                      <p className="text-[10px] text-slate-400">threshold</p>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
        <p className="text-xs text-blue-700">
          <span className="font-bold">💡 Tips:</span> Klik angka threshold untuk mengubah batas stok rendah per produk. Default: 10 unit.
        </p>
      </div>
    </div>
  );
}

// ── Opname Status Badge ───────────────────────────────────────────────────────
const OPNAME_STATUS_STYLE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  submitted: "bg-blue-100 text-blue-700 border-blue-200",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-100 text-red-600 border-red-200",
};
const OPNAME_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Diajukan",
  approved: "Disetujui",
  cancelled: "Dibatalkan",
};

// ── Opname Detail Drawer ──────────────────────────────────────────────────────
function OpnameDetailDrawer({ opnameId, onClose }: { opnameId: string; onClose: () => void }) {
  const { data, isLoading } = useOpnameDetail(opnameId);
  const updateItem = useUpdateOpnameItem();
  const submitOpname = useSubmitOpname();
  const approveOpname = useApproveOpname();
  const cancelOpname = useCancelOpname();
  const { addToast } = useToast();
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const opname = data?.data;

  const handleSaveCount = async (productId: string) => {
    if (!opname) return;
    const qty = parseInt(editValue, 10);
    if (isNaN(qty) || qty < 0) return;
    try {
      await updateItem.mutateAsync({ opnameId, productId, countedQuantity: qty });
      setEditingProductId(null);
    } catch {
      addToast("Gagal menyimpan hitungan", "error");
    }
  };

  const handleSubmit = async () => {
    if (!opname) return;
    try {
      await submitOpname.mutateAsync({ opnameId });
      addToast("Opname diajukan untuk persetujuan", "success");
      onClose();
    } catch {
      addToast("Gagal mengajukan opname", "error");
    }
  };

  const handleApprove = async () => {
    if (!opname) return;
    try {
      await approveOpname.mutateAsync({ opnameId });
      addToast("Opname disetujui — stok telah diperbarui", "success");
      onClose();
    } catch {
      addToast("Gagal menyetujui opname", "error");
    }
  };

  const handleCancel = async () => {
    if (!opname) return;
    try {
      await cancelOpname.mutateAsync({ opnameId });
      addToast("Opname dibatalkan", "success");
      onClose();
    } catch {
      addToast("Gagal membatalkan opname", "error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white rounded-t-2xl">
          <div>
            <h3 className="font-bold text-slate-800">Stock Opname</h3>
            {opname && <p className="text-xs text-slate-500">{opname.opnameNumber} · <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${OPNAME_STATUS_STYLE[opname.status]}`}>{OPNAME_STATUS_LABEL[opname.status]}</span></p>}
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoading ? (
            <div className="text-center py-8 text-slate-400 text-sm">Memuat data opname...</div>
          ) : !opname ? null : (
            <>
              {opname.notes && (
                <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600">{opname.notes}</div>
              )}
              <div className="grid grid-cols-3 gap-1 text-[10px] font-bold text-center mb-2">
                <span className="text-slate-400">PRODUK</span>
                <span className="text-blue-500">SISTEM</span>
                <span className="text-emerald-600">HITUNG</span>
              </div>
              {opname.items?.map((item) => (
                <div key={item.id} className={`flex items-center gap-3 p-3 rounded-xl border ${item.varianceQuantity !== 0 ? "border-orange-200 bg-orange-50" : "border-slate-100 bg-white"}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-slate-800 truncate">{item.productId.slice(0, 8)}...</p>
                    {item.varianceQuantity !== 0 && (
                      <span className={`text-[10px] font-bold ${item.varianceQuantity > 0 ? "text-emerald-600" : "text-red-500"}`}>
                        Selisih: {item.varianceQuantity > 0 ? "+" : ""}{item.varianceQuantity}
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-bold text-blue-600 w-10 text-center">{item.systemQuantity}</span>
                  {opname.status === "draft" && editingProductId === item.productId ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        className="w-16 border border-slate-300 rounded-lg px-2 py-1 text-sm font-bold text-center focus:outline-none focus:border-blue-400"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveCount(item.productId);
                          if (e.key === "Escape") setEditingProductId(null);
                        }}
                        autoFocus
                      />
                      <button onClick={() => handleSaveCount(item.productId)} className="w-7 h-7 bg-emerald-500 text-white rounded-md flex items-center justify-center">
                        <Check size={12} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { if (opname.status === "draft") { setEditingProductId(item.productId); setEditValue(String(item.countedQuantity)); }}}
                      disabled={opname.status !== "draft"}
                      className={`w-16 text-center text-sm font-black rounded-lg py-1 ${opname.status === "draft" ? "hover:bg-white border border-slate-200 cursor-pointer" : "cursor-default"} ${item.varianceQuantity !== 0 ? "text-orange-600" : "text-emerald-700"}`}
                    >
                      {item.countedQuantity}
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        {opname && (
          <div className="p-4 border-t border-slate-100 flex gap-2">
            {opname.status === "draft" && (
              <>
                <button onClick={handleCancel} className="px-3 py-2 rounded-xl border border-red-200 text-red-600 text-sm font-bold hover:bg-red-50 transition-colors">
                  Batalkan
                </button>
                <button onClick={handleSubmit} disabled={submitOpname.isPending} className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
                  <Send size={13} /> {submitOpname.isPending ? "Mengajukan..." : "Ajukan untuk Persetujuan"}
                </button>
              </>
            )}
            {opname.status === "submitted" && (
              <>
                <button onClick={handleCancel} className="px-3 py-2 rounded-xl border border-slate-200 text-slate-500 text-sm font-bold hover:bg-slate-50 transition-colors">
                  Batalkan
                </button>
                <button onClick={handleApprove} disabled={approveOpname.isPending} className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
                  <CheckCircle2 size={13} /> {approveOpname.isPending ? "Memproses..." : "Setujui & Perbarui Stok"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Opname Tab ────────────────────────────────────────────────────────────────
function OpnameTab() {
  const { data, isLoading, refetch, isFetching } = useOpnames();
  const createOpname = useCreateOpname();
  const { addToast } = useToast();
  const opnames = data?.data.opnames ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleCreate = async () => {
    try {
      const result = await createOpname.mutateAsync({});
      addToast("Opname baru dibuat", "success");
      setSelectedId(result.data.id);
    } catch {
      addToast("Gagal membuat opname", "error");
    }
  };

  return (
    <div className="space-y-3">
      {selectedId && (
        <OpnameDetailDrawer opnameId={selectedId} onClose={() => { setSelectedId(null); refetch(); }} />
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Catat penghitungan stok fisik dan sesuaikan dengan sistem</p>
        <button
          onClick={handleCreate}
          disabled={createOpname.isPending}
          data-testid="button-create-opname"
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <Plus size={13} /> Opname Baru
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Memuat data opname...</div>
      ) : opnames.length === 0 ? (
        <div className="flex flex-col items-center py-12 gap-3">
          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center">
            <FileSearch size={22} className="text-blue-500" />
          </div>
          <p className="font-bold text-slate-700 text-sm">Belum ada opname</p>
          <p className="text-xs text-slate-400 text-center max-w-xs">Buat opname untuk menghitung stok fisik dan menyesuaikan dengan sistem</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {opnames.map((opname, idx) => (
            <button
              key={opname.id}
              data-testid={`opname-row-${opname.id}`}
              onClick={() => setSelectedId(opname.id)}
              className={`w-full p-3 flex items-center gap-3 hover:bg-slate-50 text-left transition-colors ${idx > 0 ? "border-t border-slate-100" : ""}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-slate-800 text-sm">{opname.opnameNumber}</p>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${OPNAME_STATUS_STYLE[opname.status]}`}>
                    {OPNAME_STATUS_LABEL[opname.status]}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {new Date(opname.startedAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                  {opname.startedBy && ` · ${opname.startedBy}`}
                </p>
              </div>
              <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-center">
        <button onClick={() => refetch()} disabled={isFetching} className="text-xs text-slate-400 flex items-center gap-1 hover:text-slate-600 transition-colors">
          <RefreshCw size={11} className={isFetching ? "animate-spin" : ""} /> Refresh
        </button>
      </div>
    </div>
  );
}

// ── Transfer Status Badge ──────────────────────────────────────────────────────
const TRANSFER_STATUS_STYLE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  submitted: "bg-blue-100 text-blue-700 border-blue-200",
  received: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-100 text-red-600 border-red-200",
};
const TRANSFER_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Dikirim",
  received: "Diterima",
  cancelled: "Dibatalkan",
};

// ── Transfer Detail Drawer ────────────────────────────────────────────────────
function TransferDetailDrawer({ transferId, onClose }: { transferId: string; onClose: () => void }) {
  const { data, isLoading } = useTransferDetail(transferId);
  const submitTransfer = useSubmitTransfer();
  const receiveTransfer = useReceiveTransfer();
  const cancelTransfer = useCancelTransfer();
  const { addToast } = useToast();

  const transfer = data?.data;

  const handleSubmit = async () => {
    try {
      await submitTransfer.mutateAsync({ transferId });
      addToast("Transfer dikirim — stok outlet asal dikurangi", "success");
      onClose();
    } catch (e: any) {
      addToast(e?.message ?? "Gagal mengirim transfer", "error");
    }
  };

  const handleReceive = async () => {
    try {
      await receiveTransfer.mutateAsync({ transferId });
      addToast("Transfer diterima — stok outlet tujuan bertambah", "success");
      onClose();
    } catch {
      addToast("Gagal menerima transfer", "error");
    }
  };

  const handleCancel = async () => {
    try {
      await cancelTransfer.mutateAsync({ transferId });
      addToast("Transfer dibatalkan", "success");
      onClose();
    } catch {
      addToast("Gagal membatalkan transfer", "error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white rounded-t-2xl">
          <div>
            <h3 className="font-bold text-slate-800">Transfer Stok</h3>
            {transfer && (
              <p className="text-xs text-slate-500">
                {transfer.transferNumber} · <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${TRANSFER_STATUS_STYLE[transfer.status]}`}>{TRANSFER_STATUS_LABEL[transfer.status]}</span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading ? (
            <div className="text-center py-8 text-slate-400 text-sm">Memuat data transfer...</div>
          ) : !transfer ? null : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-orange-500 mb-1">DARI OUTLET</p>
                  <p className="text-sm font-bold text-slate-700 truncate">{transfer.fromOutletId.slice(0, 16)}...</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-blue-500 mb-1">KE OUTLET</p>
                  <p className="text-sm font-bold text-slate-700 truncate">{transfer.toOutletId.slice(0, 16)}...</p>
                </div>
              </div>
              {transfer.notes && (
                <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600">{transfer.notes}</div>
              )}
              <div>
                <p className="text-xs font-bold text-slate-500 mb-2">ITEM TRANSFER</p>
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  {transfer.items?.map((item, idx) => (
                    <div key={item.id} className={`flex items-center gap-3 p-3 ${idx > 0 ? "border-t border-slate-100" : ""}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-700 truncate">{item.productId.slice(0, 20)}...</p>
                        {item.notes && <p className="text-[11px] text-slate-400">{item.notes}</p>}
                      </div>
                      <span className="font-black text-base text-slate-800">{item.quantity} <span className="text-[10px] font-bold text-slate-400">unit</span></span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {transfer && (
          <div className="p-4 border-t border-slate-100 flex gap-2">
            {transfer.status === "draft" && (
              <>
                <button onClick={handleCancel} className="px-3 py-2 rounded-xl border border-red-200 text-red-600 text-sm font-bold hover:bg-red-50 transition-colors">Batalkan</button>
                <button onClick={handleSubmit} disabled={submitTransfer.isPending} className="flex-1 py-2 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-1.5">
                  <Send size={13} /> {submitTransfer.isPending ? "Memproses..." : "Kirim Transfer"}
                </button>
              </>
            )}
            {transfer.status === "submitted" && (
              <>
                <button onClick={handleCancel} className="px-3 py-2 rounded-xl border border-slate-200 text-slate-500 text-sm font-bold hover:bg-slate-50 transition-colors">Batalkan</button>
                <button onClick={handleReceive} disabled={receiveTransfer.isPending} className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
                  <Truck size={13} /> {receiveTransfer.isPending ? "Memproses..." : "Terima Stok"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Create Transfer Drawer ────────────────────────────────────────────────────
type TransferItem = { productId: string; quantity: number };

function CreateTransferDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { data: outletsData } = useOutlets();
  const { data: productsData } = useStockProducts();
  const createTransfer = useCreateTransfer();
  const { addToast } = useToast();

  const outlets = outletsData?.outlets ?? [];
  const trackedProducts = (productsData?.data?.items ?? []).filter((p: StockProduct) => p.stockTrackingEnabled);

  const [fromOutletId, setFromOutletId] = useState("");
  const [toOutletId, setToOutletId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<TransferItem[]>([{ productId: "", quantity: 1 }]);

  const addItem = () => setItems((prev) => [...prev, { productId: "", quantity: 1 }]);
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const updateItem = (idx: number, patch: Partial<TransferItem>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const canSubmit =
    fromOutletId &&
    toOutletId &&
    fromOutletId !== toOutletId &&
    items.length > 0 &&
    items.every((it) => it.productId && it.quantity > 0);

  const handleCreate = async () => {
    if (!canSubmit) return;
    try {
      await createTransfer.mutateAsync({ fromOutletId, toOutletId, notes: notes || undefined, items });
      addToast("Transfer stok berhasil dibuat (status: Draft)", "success");
      onCreated();
      onClose();
    } catch (e: any) {
      addToast(e?.message ?? "Gagal membuat transfer", "error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white rounded-t-2xl">
          <div>
            <h3 className="font-bold text-slate-800">Buat Transfer Stok</h3>
            <p className="text-xs text-slate-500">Pindahkan stok antar outlet</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 mb-1 block">Dari Outlet</label>
              <select
                value={fromOutletId}
                onChange={(e) => setFromOutletId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                data-testid="select-from-outlet"
              >
                <option value="">Pilih outlet asal</option>
                {outlets.map((o) => (
                  <option key={o.id} value={o.id} disabled={o.id === toOutletId}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 mb-1 block">Ke Outlet</label>
              <select
                value={toOutletId}
                onChange={(e) => setToOutletId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                data-testid="select-to-outlet"
              >
                <option value="">Pilih outlet tujuan</option>
                {outlets.map((o) => (
                  <option key={o.id} value={o.id} disabled={o.id === fromOutletId}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-500">Item Transfer</label>
              <button
                onClick={addItem}
                className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700"
                data-testid="button-add-transfer-item"
              >
                <Plus size={12} /> Tambah Item
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-slate-50 rounded-xl p-2">
                  <select
                    value={item.productId}
                    onChange={(e) => updateItem(idx, { productId: e.target.value })}
                    className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400 bg-white"
                    data-testid={`select-product-${idx}`}
                  >
                    <option value="">Pilih produk</option>
                    {trackedProducts.map((p: StockProduct) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (stok: {p.stockQty ?? 0})
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => updateItem(idx, { quantity: Math.max(1, item.quantity - 1) })}
                      className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100"
                    >
                      <Minus size={12} />
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-12 text-center border border-slate-200 rounded-lg px-1 py-1.5 text-sm font-bold focus:outline-none focus:border-blue-400"
                      data-testid={`input-qty-${idx}`}
                    />
                    <button
                      onClick={() => updateItem(idx, { quantity: item.quantity + 1 })}
                      className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  {items.length > 1 && (
                    <button
                      onClick={() => removeItem(idx)}
                      className="w-7 h-7 rounded-lg bg-red-50 text-red-400 flex items-center justify-center hover:bg-red-100 flex-shrink-0"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {trackedProducts.length === 0 && (
              <p className="text-xs text-amber-600 mt-2">Belum ada produk dengan tracking stok aktif.</p>
            )}
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 mb-1 block">Catatan (opsional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan transfer stok..."
              rows={2}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none"
              data-testid="input-transfer-notes"
            />
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 flex gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50">
            Batal
          </button>
          <button
            onClick={handleCreate}
            disabled={!canSubmit || createTransfer.isPending}
            data-testid="button-submit-transfer"
            className="flex-1 py-2 rounded-xl bg-violet-600 text-white text-sm font-bold hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <ArrowLeftRight size={14} />
            {createTransfer.isPending ? "Membuat..." : "Buat Transfer (Draft)"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Transfer Tab ──────────────────────────────────────────────────────────────
function TransferTab() {
  const { data, isLoading, refetch, isFetching, error } = useTransfers();
  const { addToast } = useToast();
  const transfers = data?.data.transfers ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const noMultiLocation = (error as any)?.message?.includes("403") || (error as any)?.message?.includes("Multi Lokasi");

  return (
    <div className="space-y-3">
      {selectedId && (
        <TransferDetailDrawer transferId={selectedId} onClose={() => { setSelectedId(null); refetch(); }} />
      )}
      {showCreate && (
        <CreateTransferDrawer onClose={() => setShowCreate(false)} onCreated={() => refetch()} />
      )}

      {noMultiLocation ? (
        <div className="flex flex-col items-center py-12 gap-3">
          <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center">
            <Lock size={22} className="text-amber-600" />
          </div>
          <p className="font-bold text-slate-700 text-sm">Modul Multi Lokasi Diperlukan</p>
          <p className="text-xs text-slate-400 text-center max-w-xs">Transfer stok antar outlet membutuhkan modul Multi Lokasi. Aktifkan dari halaman Marketplace.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Transfer stok antar outlet dalam satu tenant</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCreate(true)}
                data-testid="button-buat-transfer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-xs font-bold rounded-xl hover:bg-violet-700 transition-colors"
              >
                <Plus size={13} /> Buat Transfer
              </button>
              <button onClick={() => refetch()} disabled={isFetching} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-slate-400 text-sm">Memuat data transfer...</div>
          ) : transfers.length === 0 ? (
            <div className="flex flex-col items-center py-12 gap-4">
              <div className="w-12 h-12 bg-violet-50 rounded-2xl flex items-center justify-center">
                <ArrowLeftRight size={22} className="text-violet-500" />
              </div>
              <div className="text-center">
                <p className="font-bold text-slate-700 text-sm">Belum ada transfer stok</p>
                <p className="text-xs text-slate-400 mt-1">Buat transfer untuk pindahkan stok antar outlet</p>
              </div>
              <button
                onClick={() => setShowCreate(true)}
                data-testid="button-buat-transfer-empty"
                className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white text-sm font-bold rounded-xl hover:bg-violet-700 transition-colors"
              >
                <Plus size={14} /> Buat Transfer Pertama
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {transfers.map((transfer, idx) => (
                <button
                  key={transfer.id}
                  data-testid={`transfer-row-${transfer.id}`}
                  onClick={() => setSelectedId(transfer.id)}
                  className={`w-full p-3 flex items-center gap-3 hover:bg-slate-50 text-left transition-colors ${idx > 0 ? "border-t border-slate-100" : ""}`}
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    transfer.status === "received" ? "bg-emerald-100 text-emerald-600" :
                    transfer.status === "submitted" ? "bg-blue-100 text-blue-600" :
                    transfer.status === "cancelled" ? "bg-red-100 text-red-400" :
                    "bg-slate-100 text-slate-500"
                  }`}>
                    <ArrowLeftRight size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-slate-800 text-sm">{transfer.transferNumber}</p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${TRANSFER_STATUS_STYLE[transfer.status]}`}>
                        {TRANSFER_STATUS_LABEL[transfer.status]}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {transfer.items?.length ?? 0} item · {new Date(transfer.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Upgrade Prompt ────────────────────────────────────────────────────────────
function UpgradePrompt({ feature }: { feature: string }) {
  const [, setLocation] = useLocation();
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
      <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center">
        <Lock size={24} className="text-amber-600" />
      </div>
      <p className="font-bold text-slate-700">{feature}</p>
      <p className="text-sm text-slate-400 max-w-xs">
        Fitur ini termasuk dalam modul <span className="font-bold text-amber-600">Advanced Inventory</span>. Aktifkan dari halaman Marketplace.
      </p>
      <button
        onClick={() => setLocation("/marketplace")}
        className="mt-1 px-4 py-2 bg-amber-500 text-white text-sm font-bold rounded-xl hover:bg-amber-600 transition-colors"
      >
        Lihat di Marketplace
      </button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function StockPage() {
  const [, setLocation] = useLocation();
  const { can } = useTenant();
  const isBasic = can("inventory_basic_stock");
  const isAdvanced = can("inventory_advanced_stock");

  const { data, isLoading, refetch, isFetching } = useStockProducts();
  const items = data?.data.items ?? [];
  const summary = data?.data.summary ?? { total: 0, lowStock: 0, outOfStock: 0 };

  const isMultiLocation = can("multi_location");

  const [filter, setFilter] = useState<"all" | "low" | "out">("all");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"stock" | "history" | "report" | "opname" | "transfer" | "lowstock">("stock");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [advancedDialogProduct, setAdvancedDialogProduct] = useState<StockProduct | null>(null);
  const [historyProduct, setHistoryProduct] = useState<StockProduct | null>(null);

  const { addToast } = useToast();

  const filtered = useMemo(() => {
    let list = items;
    if (filter === "low") list = list.filter((i) => i.isLowStock && !i.isOutOfStock);
    if (filter === "out") list = list.filter((i) => i.isOutOfStock);
    if (search) list = list.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()) || (i.sku ?? "").toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [items, filter, search]);

  return (
    <div className="flex flex-col h-full bg-slate-50 animate-in fade-in">
      {/* Dialogs */}
      {advancedDialogProduct && (
        <AdvancedAdjustDialog
          product={advancedDialogProduct}
          onClose={() => setAdvancedDialogProduct(null)}
        />
      )}
      {historyProduct && (
        <ProductHistoryDrawer
          product={historyProduct}
          onClose={() => setHistoryProduct(null)}
        />
      )}

      <PageHeader
        title="Stok & Inventaris"
        subtitle="Kelola ketersediaan dan pergerakan stok"
        onBack={() => setLocation("/hub")}
        actions={
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="bg-white border border-slate-200 text-slate-500 px-3 py-2 rounded-xl text-sm flex items-center gap-1.5 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} /> Refresh
          </button>
        }
        tabs={
          <div className="flex gap-5 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setActiveTab("stock")}
              data-testid="tab-stock"
              className={`py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
                activeTab === "stock" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              <Package size={14} /> Daftar Stok
            </button>
            <button
              onClick={() => setActiveTab("history")}
              data-testid="tab-history"
              className={`py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0 ${
                activeTab === "history" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              <ClipboardList size={14} /> Riwayat
              {!isAdvanced && <Lock size={11} className="text-amber-500" />}
            </button>
            <button
              onClick={() => setActiveTab("report")}
              data-testid="tab-report"
              className={`py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0 ${
                activeTab === "report" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              <BarChart2 size={14} /> Laporan
              {!isAdvanced && <Lock size={11} className="text-amber-500" />}
            </button>
            <button
              onClick={() => setActiveTab("lowstock")}
              data-testid="tab-lowstock"
              className={`py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0 ${
                activeTab === "lowstock" ? "border-orange-500 text-orange-600" : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              <BellRing size={14} /> Stok Rendah
              {!isAdvanced && <Lock size={11} className="text-amber-500" />}
            </button>
            <button
              onClick={() => setActiveTab("opname")}
              data-testid="tab-opname"
              className={`py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0 ${
                activeTab === "opname" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              <FileSearch size={14} /> Opname
              {!isAdvanced && <Lock size={11} className="text-amber-500" />}
            </button>
            <button
              onClick={() => setActiveTab("transfer")}
              data-testid="tab-transfer"
              className={`py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0 ${
                activeTab === "transfer" ? "border-violet-600 text-violet-600" : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              <ArrowLeftRight size={14} /> Transfer
              {(!isAdvanced || !isMultiLocation) && <Lock size={11} className="text-amber-500" />}
            </button>
          </div>
        }
      />

      {activeTab === "history" ? (
        <div className="flex-1 overflow-y-auto p-4 pb-20">
          {isAdvanced ? <AllMovementsTab /> : <UpgradePrompt feature="Riwayat Pergerakan Stok" />}
        </div>
      ) : activeTab === "report" ? (
        <div className="flex-1 overflow-y-auto p-4 pb-20">
          {isAdvanced ? <LaporanTab /> : <UpgradePrompt feature="Laporan Inventaris" />}
        </div>
      ) : activeTab === "lowstock" ? (
        <div className="flex-1 overflow-y-auto p-4 pb-20">
          {isAdvanced ? <LowStockTab /> : <UpgradePrompt feature="Pantauan Stok Rendah" />}
        </div>
      ) : activeTab === "opname" ? (
        <div className="flex-1 overflow-y-auto p-4 pb-20">
          {isAdvanced ? <OpnameTab /> : <UpgradePrompt feature="Stock Opname" />}
        </div>
      ) : activeTab === "transfer" ? (
        <div className="flex-1 overflow-y-auto p-4 pb-20">
          {isAdvanced && isMultiLocation ? (
            <TransferTab />
          ) : isAdvanced && !isMultiLocation ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center">
                <Lock size={24} className="text-amber-600" />
              </div>
              <p className="font-bold text-slate-700">Modul Multi Lokasi Diperlukan</p>
              <p className="text-sm text-slate-400 max-w-xs">
                Transfer stok antar outlet membutuhkan modul <span className="font-bold text-amber-600">Multi Lokasi</span>. Aktifkan dari halaman Marketplace.
              </p>
            </div>
          ) : (
            <UpgradePrompt feature="Transfer Stok Antar Outlet" />
          )}
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="px-4 pt-4 grid grid-cols-3 gap-3">
            <button
              onClick={() => setFilter("all")}
              data-testid="filter-all"
              className={`p-3 rounded-xl border shadow-sm transition-all text-left ${
                filter === "all" ? "bg-slate-800 text-white border-slate-800" : "bg-white border-slate-200"
              }`}
            >
              <div className={`text-[10px] font-bold uppercase mb-1 flex items-center gap-1 ${filter === "all" ? "text-slate-300" : "text-slate-400"}`}>
                <Package size={10} /> Total
              </div>
              <div className={`text-xl font-black ${filter === "all" ? "text-white" : "text-slate-800"}`} data-testid="text-total-items">
                {summary.total}
              </div>
            </button>

            <button
              onClick={() => setFilter("low")}
              data-testid="filter-low"
              className={`p-3 rounded-xl border shadow-sm transition-all text-left ${
                filter === "low" ? "bg-orange-500 text-white border-orange-500" : "bg-white border-slate-200"
              }`}
            >
              <div className={`text-[10px] font-bold uppercase mb-1 flex items-center gap-1 ${filter === "low" ? "text-orange-100" : "text-orange-500"}`}>
                <AlertCircle size={10} /> Menipis
              </div>
              <div className={`text-xl font-black ${filter === "low" ? "text-white" : "text-orange-600"}`} data-testid="text-low-stock">
                {summary.lowStock}
              </div>
            </button>

            <button
              onClick={() => setFilter("out")}
              data-testid="filter-out"
              className={`p-3 rounded-xl border shadow-sm transition-all text-left ${
                filter === "out" ? "bg-red-600 text-white border-red-600" : "bg-white border-slate-200"
              }`}
            >
              <div className={`text-[10px] font-bold uppercase mb-1 flex items-center gap-1 ${filter === "out" ? "text-red-100" : "text-red-500"}`}>
                <X size={10} /> Habis
              </div>
              <div className={`text-xl font-black ${filter === "out" ? "text-white" : "text-red-600"}`} data-testid="text-out-stock">
                {summary.outOfStock}
              </div>
            </button>
          </div>

          {/* Search */}
          <div className="px-4 pt-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari nama produk atau SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                data-testid="input-search-stock"
              />
            </div>
          </div>

          {/* Tier notice */}
          {!isAdvanced && (
            <div className="mx-4 mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
              <Lock size={13} className="text-amber-500 flex-shrink-0" />
              <p className="text-xs text-amber-700 flex-1">
                <span className="font-bold">Stok Dasar aktif.</span> Aktifkan <span className="font-bold">Stok Lanjutan</span> untuk catat tipe mutasi (pembelian, rusak, retur) + riwayat audit trail.
              </p>
              <button
                onClick={() => setLocation("/marketplace")}
                className="text-[10px] font-bold text-amber-600 underline flex-shrink-0 hover:text-amber-800"
              >
                Upgrade
              </button>
            </div>
          )}

          {/* Product List */}
          <div className="flex-1 overflow-y-auto p-4 pb-20 space-y-2">
            {isLoading ? (
              <div className="text-center py-12 text-slate-400">Memuat data stok...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                {items.length === 0
                  ? "Belum ada produk dengan tracking stok aktif. Aktifkan di halaman Produk."
                  : "Tidak ada produk yang sesuai filter"}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                {filtered.map((product, idx) => (
                  <div
                    key={product.id}
                    data-testid={`stock-row-${product.id}`}
                    className={`p-3 flex items-center gap-3 transition-colors hover:bg-slate-50 ${
                      idx > 0 ? "border-t border-slate-100" : ""
                    } ${!product.isActive ? "opacity-60" : ""}`}
                  >
                    {/* Image */}
                    <div className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                          <Package size={16} />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 truncate text-sm">{product.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-slate-400">{product.category}</span>
                        {product.sku && (
                          <span className="text-[10px] text-slate-400">SKU: {product.sku}</span>
                        )}
                      </div>
                    </div>

                    {/* Stock badge / quick adjust */}
                    <div className="flex items-center gap-2">
                      {editingId === product.id ? (
                        <QuickAdjust product={product} onDone={() => setEditingId(null)} />
                      ) : (
                        <>
                          {/* Stock badge */}
                          <button
                            onClick={() => setEditingId(product.id)}
                            title="Klik untuk edit stok langsung"
                            data-testid={`badge-stock-${product.id}`}
                            className={`px-2.5 py-1 rounded-lg font-black text-sm border transition-all hover:scale-105 ${
                              product.isOutOfStock
                                ? "bg-red-50 border-red-200 text-red-600 hover:bg-red-100"
                                : product.isLowStock
                                ? "bg-orange-50 border-orange-200 text-orange-600 hover:bg-orange-100"
                                : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                            }`}
                          >
                            {product.stockQty}
                            <span className="text-[9px] font-bold ml-0.5 opacity-60">unit</span>
                          </button>

                          {/* Advanced: movement record */}
                          {isAdvanced && (
                            <button
                              onClick={() => setAdvancedDialogProduct(product)}
                              title="Catat pergerakan stok"
                              data-testid={`button-movement-${product.id}`}
                              className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100 flex items-center justify-center transition-colors"
                            >
                              <History size={14} />
                            </button>
                          )}

                          {/* Advanced: see history */}
                          {isAdvanced && (
                            <button
                              onClick={() => setHistoryProduct(product)}
                              title="Lihat riwayat stok produk ini"
                              data-testid={`button-history-${product.id}`}
                              className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 flex items-center justify-center transition-colors"
                            >
                              <ClipboardList size={14} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
