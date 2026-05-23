import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, WifiOff } from "lucide-react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { offlineDb } from "@pos/offline";
import { useSyncEngine } from "@/hooks/useSyncEngine";
import { useTerminalHeartbeat } from "@/hooks/useTerminalHeartbeat";

export function SyncStatusWidget() {
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [pending, failed, conflicts, meta] = await Promise.all([
        offlineDb.sync_outbox.where("status").equals("pending").count(),
        offlineDb.sync_outbox.where("status").equals("failed").count(),
        offlineDb.sync_conflicts.count(),
        offlineDb.sync_meta.get("last_sync_at"),
      ]);

      if (!mounted) return;
      setPendingCount(pending);
      setFailedCount(failed);
      setConflictCount(conflicts);
      setLastSyncAt(meta?.value ?? null);
    };

    load().catch(() => undefined);
    const t = setInterval(() => load().catch(() => undefined), 5000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, []);

  const { isOnline } = useNetworkStatus(pendingCount);
  const { run, isSyncing } = useSyncEngine();
  useTerminalHeartbeat();

  const severity: "green" | "yellow" | "red" | "gray" = !isOnline
    ? "gray"
    : failedCount > 0 || conflictCount > 0
      ? "red"
      : pendingCount > 0
        ? "yellow"
        : "green";

  const style = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    yellow: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
    gray: "bg-slate-100 text-slate-600 border-slate-200",
  }[severity];

  return (
    <button
      type="button"
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs font-semibold ${style}`}
      title="Sync now"
      data-testid="sync-status-widget"
      onClick={() => run().catch(() => undefined)}
    >
      {!isOnline ? <WifiOff className="w-3.5 h-3.5" /> : failedCount > 0 || conflictCount > 0 ? <AlertTriangle className="w-3.5 h-3.5" /> : pendingCount > 0 ? <Clock3 className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
      <span>{isSyncing ? "Syncing" : !isOnline ? "Offline" : failedCount > 0 || conflictCount > 0 ? "Need Review" : pendingCount > 0 ? "Pending Sync" : "Synced"}</span>
      <span className="opacity-80">P:{pendingCount}</span>
      <span className="opacity-80">F:{failedCount}</span>
      <span className="opacity-80">C:{conflictCount}</span>
      {lastSyncAt && <span className="opacity-70 hidden md:inline">{new Date(lastSyncAt).toLocaleTimeString("id-ID")}</span>}
    </button>
  );
}
