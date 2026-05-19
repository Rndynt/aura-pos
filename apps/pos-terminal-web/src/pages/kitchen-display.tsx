import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  ChefHat,
  ChevronLeft,
  RefreshCcw,
  AlertCircle,
  Clock,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useOrders } from "@/lib/api/hooks";
import { KitchenTicket } from "@/components/kitchen-display/KitchenTicket";
import { useTenant } from "@/context/TenantContext";
import type { Order } from "@pos/domain/orders/types";
import { getActiveTenantId } from "@/lib/tenant";

const ACTIVE_STATUSES = ["confirmed", "preparing", "ready"] as const;
const AUTO_REFRESH_INTERVAL = 20_000; // 20 detik

export default function KitchenDisplayPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { hasModule } = useTenant();
  const isEnabled = hasModule("enable_kitchen_ticket");

  const [isUpdating, setIsUpdating] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const { data, isLoading, error, refetch } = useOrders();
  const orders: Order[] = data?.orders ?? [];

  const activeOrders = orders.filter((o) =>
    (ACTIVE_STATUSES as readonly string[]).includes(o.status)
  );

  const counts = {
    confirmed: activeOrders.filter((o) => o.status === "confirmed").length,
    preparing: activeOrders.filter((o) => o.status === "preparing").length,
    ready: activeOrders.filter((o) => o.status === "ready").length,
  };

  // Auto-refresh setiap 20 detik
  useEffect(() => {
    const interval = setInterval(async () => {
      await refetch();
      setLastRefresh(new Date());
    }, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [refetch]);

  const handleRefresh = async () => {
    await refetch();
    setLastRefresh(new Date());
  };

  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    setIsUpdating(true);
    try {
      const tenantId = getActiveTenantId();
      // ?mode=kitchen memastikan API hanya mengizinkan transisi fulfillment
      // sampai 'served' — kitchen tidak bisa trigger financial close ('completed').
      const res = await fetch(`/api/orders/${orderId}/status?mode=kitchen`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": tenantId,
        },
        body: JSON.stringify({ status: newStatus }),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Gagal update status");

      const labels: Record<string, string> = {
        preparing: "Sedang Diproses",
        ready:     "Siap Saji",
        served:    "Sudah Disajikan",
      };

      toast({
        title: "Status diperbarui",
        description: labels[newStatus] ?? newStatus,
      });

      await refetch();
      setLastRefresh(new Date());
    } catch {
      toast({
        title: "Gagal",
        description: "Tidak dapat memperbarui status order",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // ── Feature gate ────────────────────────────────────────────
  if (!isEnabled) {
    return (
      <div className="flex flex-col h-screen bg-slate-50 items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4 text-center max-w-md">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-slate-100">
            <AlertCircle size={32} className="text-slate-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">
            Kitchen Display Tidak Aktif
          </h1>
          <p className="text-slate-500">
            Fitur ini belum diaktifkan. Hubungi administrator untuk mengaktifkan Kitchen Display.
          </p>
          <button
            onClick={() => setLocation("/")}
            className="mt-2 px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg transition-colors"
          >
            Kembali ke POS
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-100">
      {/* ── Header ────────────────────────────────────────────── */}
      <header className="bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLocation("/")}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-500"
            data-testid="button-back"
            title="Kembali ke POS"
          >
            <ChevronLeft size={22} />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center shadow-sm">
              <ChefHat size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-800 leading-none">
                Kitchen Display
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                {activeOrders.length} antrian aktif
              </p>
            </div>
          </div>
        </div>

        {/* Status summary chips */}
        <div className="hidden md:flex items-center gap-2">
          <StatusChip color="orange" label="Menunggu" count={counts.confirmed} />
          <StatusChip color="yellow" label="Diproses" count={counts.preparing} />
          <StatusChip color="green" label="Siap Saji" count={counts.ready} />
        </div>

        {/* Refresh */}
        <div className="flex items-center gap-3">
          <span className="hidden sm:flex items-center gap-1 text-xs text-slate-400">
            <Clock size={11} />
            {lastRefresh.toLocaleTimeString("id-ID", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            data-testid="button-refresh"
          >
            {isLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCcw size={14} />
            )}
            Refresh
          </button>
        </div>
      </header>

      {/* ── Status legend bar (mobile) ─────────────────────── */}
      <div className="md:hidden bg-white border-b border-slate-100 px-4 py-2 flex items-center gap-3">
        <StatusChip color="orange" label="Menunggu" count={counts.confirmed} />
        <StatusChip color="yellow" label="Diproses" count={counts.preparing} />
        <StatusChip color="green" label="Siap Saji" count={counts.ready} />
      </div>

      {/* ── Ticket Grid ───────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto p-4 md:p-5">
        {isLoading && activeOrders.length === 0 ? (
          <LoadingState />
        ) : error ? (
          <ErrorState onRetry={handleRefresh} />
        ) : activeOrders.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Group by status: Waiting first, then Preparing, then Ready */}
            {(["confirmed", "preparing", "ready"] as const).map((status) => {
              const group = activeOrders.filter((o) => o.status === status);
              if (group.length === 0) return null;
              const sectionLabel = {
                confirmed: "🟠 Menunggu",
                preparing: "🟡 Sedang Diproses",
                ready: "🟢 Siap Saji",
              }[status];
              return (
                <section key={status} className="mb-6">
                  <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 px-0.5">
                    {sectionLabel}{" "}
                    <span className="font-bold text-slate-400 normal-case tracking-normal">
                      ({group.length})
                    </span>
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                    {group.map((order) => (
                      <KitchenTicket
                        key={order.id}
                        order={order}
                        onUpdateStatus={handleUpdateStatus}
                        isLoading={isUpdating}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </main>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function StatusChip({
  color,
  label,
  count,
}: {
  color: "orange" | "yellow" | "green";
  label: string;
  count: number;
}) {
  const colorMap = {
    orange: "bg-orange-50 text-orange-700 border-orange-200",
    yellow: "bg-yellow-50 text-yellow-700 border-yellow-200",
    green: "bg-green-50 text-green-700 border-green-200",
  };
  const dotMap = {
    orange: "bg-orange-500",
    yellow: "bg-yellow-400",
    green: "bg-green-500",
  };
  return (
    <span
      className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${colorMap[color]}`}
    >
      <span className={`w-2 h-2 rounded-full ${dotMap[color]}`} />
      {label}
      <span className="font-black">{count}</span>
    </span>
  );
}

function LoadingState() {
  return (
    <div className="h-full min-h-[300px] flex flex-col items-center justify-center gap-3 text-slate-400">
      <Loader2 size={40} className="animate-spin opacity-40" />
      <p className="text-sm font-medium">Memuat antrian pesanan…</p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="h-full min-h-[300px] flex flex-col items-center justify-center gap-3 text-slate-400">
      <AlertCircle size={40} className="opacity-40" />
      <p className="text-sm font-medium">Gagal memuat data</p>
      <button
        onClick={onRetry}
        className="text-sm font-bold text-blue-600 hover:underline"
      >
        Coba lagi
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="h-full min-h-[300px] flex flex-col items-center justify-center gap-3 text-slate-400">
      <CheckCircle size={48} className="opacity-20 text-green-500" />
      <h3 className="text-lg font-bold text-slate-500">Semua Selesai!</h3>
      <p className="text-sm">Tidak ada pesanan aktif di dapur saat ini.</p>
    </div>
  );
}
