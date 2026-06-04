/**
 * Sync Conflicts Page — Sprint 5
 *
 * Shows all sync conflicts from the backend:
 *  - PRICE_CHANGED (warning, auto-resolved)
 *  - STOCK_INSUFFICIENT (warning, auto-resolved)
 *  - PRODUCT_INACTIVE / PRODUCT_NOT_FOUND (blocking, needs_review / discard)
 *  - etc.
 *
 * Owner/manager can resolve or ignore each conflict manually.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, Clock, RefreshCw, XCircle, ChevronDown, ChevronUp, Info } from "lucide-react";
import { useTenant } from "@/context/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { PageHeader } from "@/components/design";
import {
  conflictLabel,
  getSeverity,
  type ConflictSeverity,
} from "@pos/offline";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SyncConflict {
  id: string;
  tenantId: string;
  terminalId: string | null;
  localOrderId: string | null;
  serverOrderId: string | null;
  conflictType: string;
  message: string;
  conflictData: unknown;
  resolution: "pending" | "resolved" | "ignored" | "auto_resolved";
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEVERITY_META: Record<ConflictSeverity, { label: string; variant: "destructive" | "default" | "secondary"; icon: typeof AlertTriangle }> = {
  blocking:     { label: "Blocking",    variant: "destructive", icon: XCircle },
  needs_review: { label: "Perlu Review", variant: "default",    icon: AlertTriangle },
  warning:      { label: "Peringatan",  variant: "secondary",   icon: Info },
};

const RESOLUTION_META: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  pending:       { label: "Belum Ditangani", color: "text-amber-600",  icon: Clock },
  auto_resolved: { label: "Auto Resolved",   color: "text-blue-500",   icon: CheckCircle2 },
  resolved:      { label: "Resolved",        color: "text-green-600",  icon: CheckCircle2 },
  ignored:       { label: "Diabaikan",       color: "text-slate-400",  icon: XCircle },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function ConflictCard({ conflict, tenantId }: { conflict: SyncConflict; tenantId: string }) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const severity = getSeverity(conflict.conflictType);
  const severityMeta = SEVERITY_META[severity];
  const SeverityIcon = severityMeta.icon;
  const resMeta = RESOLUTION_META[conflict.resolution] ?? RESOLUTION_META.pending;
  const ResIcon = resMeta.icon;

  const resolve = useMutation({
    mutationFn: (resolution: "resolved" | "ignored") =>
      apiRequest("PATCH", `/api/sync/conflicts/${conflict.id}/resolve`, { resolution, resolved_by: "owner" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sync/conflicts"] });
      toast({ title: "Konflik diperbarui" });
    },
    onError: () => toast({ title: "Gagal memperbarui konflik", variant: "destructive" }),
  });

  const isPending = conflict.resolution === "pending";

  return (
    <Card className="border border-slate-100 shadow-sm">
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex-shrink-0">
            <SeverityIcon size={18} className={
              severity === "blocking" ? "text-red-500" :
              severity === "needs_review" ? "text-amber-500" :
              "text-blue-400"
            } />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-semibold text-sm text-slate-800">
                {conflictLabel(conflict.conflictType)}
              </span>
              <Badge variant={severityMeta.variant} className="text-xs py-0 h-5">
                {severityMeta.label}
              </Badge>
            </div>

            <p className="text-xs text-slate-500 line-clamp-2">{conflict.message}</p>

            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-400">
              <span data-testid={`text-conflict-date-${conflict.id}`}>{formatDate(conflict.createdAt)}</span>
              {conflict.terminalId && <span>Terminal: {conflict.terminalId}</span>}
              {conflict.localOrderId && <span>Local: {conflict.localOrderId.slice(0, 12)}…</span>}
              <span className={`flex items-center gap-1 font-medium ${resMeta.color}`}>
                <ResIcon size={12} />
                {resMeta.label}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
            {isPending && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-green-200 text-green-700 hover:bg-green-50"
                  onClick={() => resolve.mutate("resolved")}
                  disabled={resolve.isPending}
                  data-testid={`button-resolve-conflict-${conflict.id}`}
                >
                  Resolve
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-slate-400 hover:text-slate-600"
                  onClick={() => resolve.mutate("ignored")}
                  disabled={resolve.isPending}
                  data-testid={`button-ignore-conflict-${conflict.id}`}
                >
                  Abaikan
                </Button>
              </>
            )}
            {!!conflict.conflictData && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-slate-400"
                onClick={() => setExpanded(e => !e)}
                data-testid={`button-expand-conflict-${conflict.id}`}
              >
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </Button>
            )}
          </div>
        </div>

        {/* Expanded conflict data */}
        {expanded && !!conflict.conflictData && (
          <div className="mt-3 ml-7 p-3 bg-slate-50 rounded-lg text-xs font-mono text-slate-600 overflow-auto max-h-48">
            <pre>{JSON.stringify(conflict.conflictData, null, 2)}</pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type FilterResolution = "all" | "pending" | "auto_resolved" | "resolved" | "ignored";
type FilterSeverity   = "all" | "blocking" | "needs_review" | "warning";

export default function SyncConflictsPage() {
  const { tenantId, isLoading: tenantLoading } = useTenant();
  const [filterResolution, setFilterResolution] = useState<FilterResolution>("all");
  const [filterSeverity, setFilterSeverity] = useState<FilterSeverity>("all");
  const [filterType, setFilterType] = useState("all");

  const { data, isLoading, refetch, isFetching } = useQuery<{ conflicts: SyncConflict[] }>({
    queryKey: ["/api/sync/conflicts"],
    select: (d: any) => d.data,
    enabled: !tenantLoading,
    refetchInterval: 30_000,
  });

  const conflicts = data?.conflicts ?? [];

  // Derive available conflict types
  const conflictTypes = [...new Set(conflicts.map(c => c.conflictType))];

  // Apply filters
  const filtered = conflicts.filter(c => {
    if (filterResolution !== "all" && c.resolution !== filterResolution) return false;
    if (filterSeverity !== "all" && getSeverity(c.conflictType) !== filterSeverity) return false;
    if (filterType !== "all" && c.conflictType !== filterType) return false;
    return true;
  });

  // Summary counts
  const pending  = conflicts.filter(c => c.resolution === "pending").length;
  const warnings = conflicts.filter(c => getSeverity(c.conflictType) === "warning").length;
  const blocking = conflicts.filter(c => getSeverity(c.conflictType) === "blocking").length;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <PageHeader
        title="Konflik Sinkronisasi"
        subtitle="Kelola konflik dari terminal offline"
        onBack={() => setLocation("/hub")}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5"
            data-testid="button-refresh-conflicts"
          >
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
            Refresh
          </Button>
        }
      />
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Card className="border-amber-100 bg-amber-50">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-amber-700" data-testid="text-conflicts-pending">{pending}</div>
              <div className="text-xs text-amber-600">Belum Ditangani</div>
            </CardContent>
          </Card>
          <Card className="border-red-100 bg-red-50">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-red-700" data-testid="text-conflicts-blocking">{blocking}</div>
              <div className="text-xs text-red-600">Blocking</div>
            </CardContent>
          </Card>
          <Card className="border-blue-100 bg-blue-50">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-blue-700" data-testid="text-conflicts-total">{conflicts.length}</div>
              <div className="text-xs text-blue-600">Total</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <Select value={filterResolution} onValueChange={v => setFilterResolution(v as FilterResolution)}>
            <SelectTrigger className="w-[160px] h-8 text-xs" data-testid="select-filter-resolution">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              <SelectItem value="pending">Belum Ditangani</SelectItem>
              <SelectItem value="auto_resolved">Auto Resolved</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="ignored">Diabaikan</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterSeverity} onValueChange={v => setFilterSeverity(v as FilterSeverity)}>
            <SelectTrigger className="w-[160px] h-8 text-xs" data-testid="select-filter-severity">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Severity</SelectItem>
              <SelectItem value="blocking">Blocking</SelectItem>
              <SelectItem value="needs_review">Perlu Review</SelectItem>
              <SelectItem value="warning">Peringatan</SelectItem>
            </SelectContent>
          </Select>

          {conflictTypes.length > 1 && (
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[180px] h-8 text-xs" data-testid="select-filter-type">
                <SelectValue placeholder="Tipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Tipe</SelectItem>
                {conflictTypes.map(t => (
                  <SelectItem key={t} value={t}>{conflictLabel(t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Conflict list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-slate-200 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <CheckCircle2 size={40} className="mx-auto text-green-400 mb-3" />
            <p className="text-slate-500 font-medium">
              {conflicts.length === 0 ? "Tidak ada konflik tercatat" : "Tidak ada konflik yang cocok filter"}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {conflicts.length === 0
                ? "Semua sinkronisasi terminal berjalan lancar"
                : `${conflicts.length} konflik tersembunyi oleh filter aktif`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(c => (
              <ConflictCard key={c.id} conflict={c} tenantId={tenantId ?? ""} />
            ))}
          </div>
        )}

        {filtered.length > 0 && (
          <p className="text-xs text-slate-400 text-center mt-4">
            Menampilkan {filtered.length} dari {conflicts.length} konflik
          </p>
        )}
        </div>
      </div>
    </div>
  );
}
