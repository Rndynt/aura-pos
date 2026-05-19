import { Clock, PlayCircle, CheckCircle, Utensils, ConciergeBell } from "lucide-react";
import type { Order } from "@pos/domain/orders/types";

interface KitchenTicketProps {
  order: Order;
  onUpdateStatus: (orderId: string, status: string) => void;
  isLoading?: boolean;
}

const STATUS_CONFIG = {
  confirmed: {
    border: "border-orange-500",
    headerBg: "bg-orange-500",
    badge: "bg-orange-100 text-orange-700 border-orange-200",
    label: "Menunggu",
    dot: "bg-orange-500",
  },
  preparing: {
    border: "border-yellow-400",
    headerBg: "bg-yellow-400",
    badge: "bg-yellow-100 text-yellow-700 border-yellow-200",
    label: "Diproses",
    dot: "bg-yellow-400",
  },
  ready: {
    border: "border-green-500",
    headerBg: "bg-green-500",
    badge: "bg-green-100 text-green-700 border-green-200",
    label: "Siap Saji",
    dot: "bg-green-500",
  },
  served: {
    border: "border-purple-400",
    headerBg: "bg-purple-400",
    badge: "bg-purple-100 text-purple-700 border-purple-200",
    label: "Disajikan",
    dot: "bg-purple-400",
  },
};

function getElapsed(createdAt: Date | string | undefined): string {
  if (!createdAt) return "-";
  const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  if (diff < 60) return `${diff}d`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins} mnt`;
  return `${Math.floor(mins / 60)} jam`;
}

function getElapsedMinutes(createdAt: Date | string | undefined): number {
  if (!createdAt) return 0;
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}

function formatTime(date: Date | string | undefined): string {
  if (!date) return "-";
  return new Date(date).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function KitchenTicket({
  order,
  onUpdateStatus,
  isLoading = false,
}: KitchenTicketProps) {
  const cfg = STATUS_CONFIG[order.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.confirmed;
  const elapsedMins = getElapsedMinutes(order.created_at);
  const isUrgent = elapsedMins >= 15 && order.status !== "ready" && order.status !== "served";

  // Fulfillment progression — kitchen hanya sampai 'served'.
  // 'completed' adalah financial close milik kasir, BUKAN kitchen.
  const handleNext = () => {
    const next: Record<string, string> = {
      confirmed: "preparing",
      preparing: "ready",
      ready:     "served",   // ✅ kitchen selesai saat makanan disajikan
    };
    const nextStatus = next[order.status];
    if (nextStatus) onUpdateStatus(order.id, nextStatus);
  };

  return (
    <div
      className={`flex flex-col bg-white rounded-xl shadow-md border-l-4 ${cfg.border} overflow-hidden transition-all hover:shadow-lg`}
      data-testid={`ticket-${order.id}`}
    >
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100">
        {/* Row 1: Status badge + order number */}
        <div className="flex items-center justify-between gap-1 mb-1">
          <span className="font-black text-sm text-slate-800 tracking-tight leading-none truncate">
            {order.order_number}
          </span>
          <span
            className={`shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.badge}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
        </div>

        {/* Row 2: Table + customer */}
        <div className="flex items-center gap-2 mb-2">
          {order.table_number && (
            <span className="bg-slate-800 text-white text-[11px] font-black px-2 py-0.5 rounded leading-none shrink-0">
              Meja {order.table_number}
            </span>
          )}
          <p className="text-sm text-slate-500 font-medium truncate">
            {order.customer_name || "Walk-in"}
          </p>
        </div>

        {/* Row 3: Time + elapsed */}
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {formatTime(order.created_at)}
          </span>
          <span className={`font-bold ${isUrgent ? "text-red-500 animate-pulse" : "text-slate-400"}`}>
            {getElapsed(order.created_at)}
          </span>
          {isUrgent && (
            <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
              TERLAMBAT
            </span>
          )}
        </div>
      </div>

      {/* ── Items List ──────────────────────────────────────── */}
      <div className="flex-1 px-4 py-3 space-y-2">
        {order.items && order.items.length > 0 ? (
          order.items.map((item, idx) => (
            <div key={item.id ?? idx} className="flex items-start gap-3">
              <div className="w-7 h-7 shrink-0 flex items-center justify-center rounded-md bg-slate-100 font-black text-sm text-slate-700">
                {item.quantity}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800 leading-tight">
                  {item.product_name}
                </p>
                {item.variant_name && (
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Varian: {item.variant_name}
                  </p>
                )}
                {item.selected_options && item.selected_options.length > 0 && (
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {item.selected_options.map((o) => o.option_name).join(", ")}
                  </p>
                )}
                {item.notes && (
                  <p className="text-[11px] text-orange-600 font-medium italic mt-0.5">
                    ⚑ {item.notes}
                  </p>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
            <Utensils size={14} />
            <span className="italic">Tidak ada item</span>
          </div>
        )}
      </div>

      {/* ── Total item count ───────────────────────────────── */}
      <div className="px-4 pb-2 text-[11px] text-slate-400 font-medium">
        {order.items?.reduce((sum, i) => sum + i.quantity, 0) ?? 0} item
        {order.notes && (
          <span className="ml-2 text-orange-500 font-semibold">
            • Catatan: {order.notes}
          </span>
        )}
      </div>

      {/* ── Action Button ──────────────────────────────────── */}
      <div className="px-3 pb-3">
        {order.status === "confirmed" && (
          <button
            onClick={handleNext}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 text-white font-bold text-sm h-10 rounded-lg transition-colors"
            data-testid={`button-start-prep-${order.id}`}
          >
            <PlayCircle size={16} /> Mulai Proses
          </button>
        )}
        {order.status === "preparing" && (
          <button
            onClick={handleNext}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:opacity-60 text-white font-bold text-sm h-10 rounded-lg transition-colors"
            data-testid={`button-ready-${order.id}`}
          >
            <CheckCircle size={16} /> Tandai Siap
          </button>
        )}
        {order.status === "ready" && (
          <button
            onClick={handleNext}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 disabled:opacity-60 text-white font-bold text-sm h-10 rounded-lg transition-colors"
            data-testid={`button-serve-${order.id}`}
          >
            <ConciergeBell size={16} /> Sajikan ke Meja
          </button>
        )}
        {order.status === "served" && (
          <div className="w-full flex items-center justify-center gap-2 bg-purple-50 text-purple-600 border border-purple-200 font-semibold text-sm h-10 rounded-lg">
            <ConciergeBell size={14} /> Sudah Disajikan
          </div>
        )}
      </div>
    </div>
  );
}
