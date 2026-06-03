import { useMemo, useState, useCallback } from "react";
import { useTenant } from "@/context/TenantContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { offlineDb, runSyncEngine } from "@pos/offline";
import type { LocalOrder, SyncStatus } from "@pos/offline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  XCircle,
  Printer,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ElementType }
> = {
  local_only:    { label: "Local Only",     variant: "secondary",    icon: Clock3 },
  pending_sync:  { label: "Pending Sync",   variant: "outline",      icon: Clock3 },
  syncing:       { label: "Syncing…",       variant: "outline",      icon: RefreshCw },
  synced:        { label: "Synced",         variant: "default",      icon: CheckCircle2 },
  failed:        { label: "Failed",         variant: "destructive",  icon: XCircle },
  conflict:      { label: "Conflict",       variant: "destructive",  icon: AlertTriangle },
  cancelled:     { label: "Cancelled",      variant: "secondary",    icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, variant: "outline" as const, icon: Clock3 };
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant} className="flex items-center gap-1 text-xs">
      <Icon className="w-3 h-3" />
      {cfg.label}
    </Badge>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);
}

export function LocalOrderList() {
  const [filter, setFilter] = useState<"all" | SyncStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isRetrying, setIsRetrying] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // Scope all offline data to the currently active tenant to prevent cross-tenant data leakage
  const { tenantId } = useTenant();

  const { data: orders = [], isLoading } = useQuery<LocalOrder[]>({
    queryKey: ["local-orders-list", tenantId],
    queryFn: () =>
      tenantId
        ? offlineDb.local_orders.where("tenantId").equals(tenantId).reverse().sortBy("createdAtLocal")
        : Promise.resolve([]),
    refetchInterval: 4000,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["local-payments-list", tenantId],
    queryFn: () =>
      tenantId
        ? offlineDb.local_order_payments.where("tenantId").equals(tenantId).toArray()
        : Promise.resolve([]),
    refetchInterval: 8000,
  });

  const filtered = useMemo(() => {
    return orders.filter((o: LocalOrder) => {
      if (filter !== "all" && o.syncStatus !== filter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matches =
          o.localOrderNumber?.toLowerCase().includes(q) ||
          o.serverOrderNumber?.toLowerCase().includes(q) ||
          o.localId?.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [orders, filter, searchQuery]);

  const paymentMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of payments) {
      map.set(p.localOrderId, (map.get(p.localOrderId) ?? 0) + p.amount);
    }
    return map;
  }, [payments]);

  const pendingCount = useMemo(
    () => orders.filter((o) => o.syncStatus === "pending_sync" || o.syncStatus === "local_only").length,
    [orders]
  );

  const retrySync = useCallback(async () => {
    if (isRetrying) return;
    setIsRetrying(true);
    try {
      const result = await runSyncEngine();
      toast({
        title: "Sync selesai",
        description: `${result.synced} berhasil, ${result.failed} gagal, ${result.conflicts} konflik.`,
      });
      queryClient.invalidateQueries({ queryKey: ["local-orders-list"] });
    } catch {
      toast({ title: "Sync gagal", description: "Periksa koneksi internet.", variant: "destructive" });
    } finally {
      setIsRetrying(false);
    }
  }, [isRetrying, toast, queryClient]);

  const retrySingleOrder = useCallback(async (order: LocalOrder) => {
    const outboxItems = await offlineDb.sync_outbox
      .where("localEntityId").equals(order.localId)
      .and((i) => i.status === "failed")
      .toArray();
    if (outboxItems.length === 0) {
      toast({ title: "Tidak ada item untuk retry", description: "Order ini tidak ada di outbox yang gagal." });
      return;
    }
    for (const item of outboxItems) {
      await offlineDb.sync_outbox.update(item.id, { status: "pending", nextRetryAt: undefined, lastError: undefined });
    }
    toast({ title: "Dijadwalkan ulang", description: `${outboxItems.length} item siap disync.` });
    queryClient.invalidateQueries({ queryKey: ["local-orders-list"] });
    retrySync();
  }, [toast, queryClient, retrySync]);

  const handleReprint = useCallback(async (order: LocalOrder) => {
    const printJobs = await offlineDb.local_print_jobs
      .where("localOrderId").equals(order.localId)
      .toArray();
    if (printJobs.length === 0) {
      toast({ title: "Tidak ada print job", description: "Tidak ada struk yang tersimpan untuk order ini." });
      return;
    }
    for (const job of printJobs) {
      await offlineDb.local_print_jobs.update(job.id, {
        status: "pending",
        retryCount: 0,
        updatedAt: new Date().toISOString(),
      });
    }
    toast({ title: "Cetak ulang dijadwalkan", description: "Struk akan dicetak ulang." });
  }, [toast]);

  if (isLoading) {
    return (
      <div className="p-8 text-center text-sm text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
        Memuat data lokal…
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-8 text-sm w-48"
          placeholder="Cari no. order"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          data-testid="local-orders-search"
        />
        <Select value={filter} onValueChange={(v) => setFilter(v as "all" | SyncStatus)}>
          <SelectTrigger className="h-8 text-sm w-40" data-testid="local-orders-filter">
            <SelectValue placeholder="Semua status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            <SelectItem value="local_only">Local Only</SelectItem>
            <SelectItem value="pending_sync">Pending Sync</SelectItem>
            <SelectItem value="syncing">Syncing</SelectItem>
            <SelectItem value="synced">Synced</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="conflict">Conflict</SelectItem>
          </SelectContent>
        </Select>

        {pendingCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 text-xs"
            onClick={retrySync}
            disabled={isRetrying}
            data-testid="local-orders-retry-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? "animate-spin" : ""}`} />
            Sync Semua ({pendingCount})
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-400">
          {searchQuery || filter !== "all"
            ? "Tidak ada order yang sesuai filter."
            : "Belum ada transaksi lokal. Order offline akan muncul di sini."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((order) => {
            const paidAmount = paymentMap.get(order.localId) ?? 0;
            const cfg = STATUS_CONFIG[order.syncStatus] ?? STATUS_CONFIG.local_only;
            const isActionable = order.syncStatus === "failed" || order.syncStatus === "conflict";

            return (
              <div
                key={order.localId}
                className="border rounded-lg p-3 space-y-2 text-sm bg-white shadow-sm"
                data-testid={`local-order-card-${order.localId}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">
                      {order.localOrderNumber}
                    </div>
                    {order.serverOrderNumber && (
                      <div className="text-xs text-slate-500">
                        Server: {order.serverOrderNumber}
                      </div>
                    )}
                  </div>
                  <StatusBadge status={order.syncStatus} />
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
                  <div>
                    <span className="text-slate-400">Status Order:</span>{" "}
                    <span className="font-medium">{order.status}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Pembayaran:</span>{" "}
                    <span className="font-medium">{order.paymentStatus}</span>
                  </div>
                  {paidAmount > 0 && (
                    <div>
                      <span className="text-slate-400">Total:</span>{" "}
                      <span className="font-medium">{formatCurrency(paidAmount)}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-slate-400">Waktu:</span>{" "}
                    <span>{formatDate(order.createdAtLocal)}</span>
                  </div>
                  {order.syncedAt && (
                    <div className="col-span-2">
                      <span className="text-slate-400">Synced:</span>{" "}
                      <span>{formatDate(order.syncedAt)}</span>
                    </div>
                  )}
                </div>

                {(isActionable || order.syncStatus === "synced") && (
                  <div className="flex items-center gap-2 pt-1 border-t">
                    {isActionable && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-xs"
                        onClick={() => retrySingleOrder(order)}
                        data-testid={`local-order-retry-${order.localId}`}
                      >
                        <RefreshCw className="w-3 h-3" />
                        Retry Sync
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 text-xs"
                      onClick={() => handleReprint(order)}
                      data-testid={`local-order-reprint-${order.localId}`}
                    >
                      <Printer className="w-3 h-3" />
                      Cetak Ulang
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
