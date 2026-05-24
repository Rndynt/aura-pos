import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Printer, RefreshCw, CheckCircle2, XCircle, Clock, AlertCircle, Trash2 } from "lucide-react";
import { getAllPrintJobs, markPrinting, markPrinted, markPrintFailed, retryPrintJob, cancelPrintJob, deletePrintJob } from "@pos/offline";
import type { LocalPrintJob } from "@pos/offline";
import { bluetoothReceiptPrinter } from "@/lib/receiptPrinter";
import type { ReceiptPrintPayload } from "@/lib/receiptPrinter";
import { useTerminalIdentity } from "@/hooks/useTerminalIdentity";
import { getActiveTenantId } from "@/lib/tenant";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const STATUS_CONFIG: Record<LocalPrintJob["status"], { label: string; color: string; icon: typeof Clock }> = {
  pending:   { label: "Menunggu",   color: "text-amber-600 bg-amber-50 border-amber-200",   icon: Clock },
  printing:  { label: "Mencetak",   color: "text-blue-600 bg-blue-50 border-blue-200",      icon: RefreshCw },
  printed:   { label: "Tercetak",   color: "text-green-600 bg-green-50 border-green-200",   icon: CheckCircle2 },
  failed:    { label: "Gagal",      color: "text-red-600 bg-red-50 border-red-200",         icon: XCircle },
  cancelled: { label: "Dibatalkan", color: "text-slate-500 bg-slate-50 border-slate-200",   icon: XCircle },
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export function PrintQueuePanel() {
  const terminal = useTerminalIdentity();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: jobs = [], isLoading, refetch } = useQuery<LocalPrintJob[]>({
    queryKey: ["print-jobs", terminal?.terminalId],
    queryFn: () => {
      if (!terminal) return Promise.resolve([]);
      return getAllPrintJobs(getActiveTenantId(), terminal.terminalId, 50);
    },
    enabled: !!terminal,
    refetchInterval: 5000,
  });

  const pending = jobs.filter((j) => j.status === "pending" || j.status === "printing").length;
  const failed  = jobs.filter((j) => j.status === "failed").length;

  const reprintMutation = useMutation({
    mutationFn: async (job: LocalPrintJob) => {
      await markPrinting(job.id);
      const raw = job.payload as ReceiptPrintPayload & { createdAt: string | Date };
      const payload: ReceiptPrintPayload = {
        ...raw,
        createdAt: raw.createdAt instanceof Date ? raw.createdAt : new Date(raw.createdAt),
      };
      try {
        await bluetoothReceiptPrinter.reconnectIfPossible().catch(() => false);
        await bluetoothReceiptPrinter.print(payload);
        await markPrinted(job.id);
        return "printed";
      } catch (err) {
        await markPrintFailed(job.id, err instanceof Error ? err.message : "Print gagal");
        throw err;
      }
    },
    onSuccess: (_, job) => {
      queryClient.invalidateQueries({ queryKey: ["print-jobs", terminal?.terminalId] });
      toast({ title: "Struk berhasil dicetak", description: `Order ${job.orderNumber || job.id.slice(0, 8)}` });
    },
    onError: (err) => {
      queryClient.invalidateQueries({ queryKey: ["print-jobs", terminal?.terminalId] });
      toast({
        title: "Cetak ulang gagal",
        description: err instanceof Error ? err.message : "Periksa koneksi printer.",
        variant: "destructive",
      });
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (id: string) => {
      await retryPrintJob(id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["print-jobs", terminal?.terminalId] }),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      await cancelPrintJob(id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["print-jobs", terminal?.terminalId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await deletePrintJob(id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["print-jobs", terminal?.terminalId] }),
  });

  if (!terminal) {
    return (
      <div className="p-4 text-sm text-slate-500 text-center">
        Memuat identitas terminal…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Printer size={18} className="text-slate-600" />
          <h2 className="font-bold text-slate-800">Antrian Cetak</h2>
          {pending > 0 && (
            <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-xs">
              {pending} menunggu
            </Badge>
          )}
          {failed > 0 && (
            <Badge variant="destructive" className="text-xs">
              {failed} gagal
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
        </Button>
      </div>

      {jobs.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-sm">
          <Printer size={32} className="mx-auto mb-2 opacity-40" />
          <p>Belum ada antrian cetak.</p>
          <p className="text-xs mt-1">Struk akan muncul di sini setelah order berhasil.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => {
            const cfg = STATUS_CONFIG[job.status];
            const Icon = cfg.icon;
            const isBusy = reprintMutation.isPending && reprintMutation.variables?.id === job.id;

            return (
              <div
                key={job.id}
                data-testid={`print-job-card-${job.id}`}
                className="border border-slate-200 rounded-xl p-3 bg-white space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}
                    >
                      <Icon size={11} className={job.status === "printing" ? "animate-spin" : ""} />
                      {cfg.label}
                    </span>
                    <span className="text-xs text-slate-500 font-medium truncate">
                      {job.type === "receipt" ? "Struk" : "Tiket Dapur"}
                      {job.orderNumber ? ` #${job.orderNumber}` : ""}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0">{formatTime(job.createdAt)}</span>
                </div>

                {job.lastError && (
                  <div className="flex items-start gap-1.5 text-xs text-red-600 bg-red-50 rounded-lg px-2 py-1.5">
                    <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                    <span className="break-all">{job.lastError}</span>
                  </div>
                )}

                <div className="flex items-center gap-1.5 pt-0.5">
                  {(job.status === "pending" || job.status === "failed") && (
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      disabled={isBusy || bluetoothReceiptPrinter.getState() === "disconnected"}
                      onClick={() => reprintMutation.mutate(job)}
                      data-testid={`button-reprint-${job.id}`}
                    >
                      <Printer size={12} className="mr-1" />
                      {isBusy ? "Mencetak…" : job.status === "failed" ? "Cetak Ulang" : "Cetak"}
                    </Button>
                  )}

                  {job.status === "failed" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => retryMutation.mutate(job.id)}
                      disabled={retryMutation.isPending}
                    >
                      <RefreshCw size={12} className="mr-1" />
                      Reset
                    </Button>
                  )}

                  {job.status === "pending" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-slate-500"
                      onClick={() => cancelMutation.mutate(job.id)}
                      disabled={cancelMutation.isPending}
                    >
                      Batalkan
                    </Button>
                  )}

                  {(job.status === "printed" || job.status === "cancelled") && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-slate-400 hover:text-red-500"
                      onClick={() => deleteMutation.mutate(job.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-print-job-${job.id}`}
                    >
                      <Trash2 size={12} />
                    </Button>
                  )}

                  {job.status === "failed" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-slate-400 hover:text-red-500 ml-auto"
                      onClick={() => deleteMutation.mutate(job.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 size={12} />
                    </Button>
                  )}

                  {job.retryCount > 0 && (
                    <span className="text-xs text-slate-400 ml-auto">
                      {job.retryCount}× gagal
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
