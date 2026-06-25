import { useQuery } from "@tanstack/react-query";
import { buildApiHeaders } from "@/lib/outlet";

export type ReportPeriod = "today" | "yesterday" | "week" | "month";

export type ReportSummary = {
  period: ReportPeriod;
  range: { start: string; end: string };
  revenue: number;
  transactions: number;
  avgBill: number;
  chartData: Array<{ bucket: string; value: number; transactions: number }>;
  paymentBreakdown: Record<string, { total: number; count: number }>;
  lowStock: Array<{ productId: string; name: string; quantity: number; threshold: number | null }>;
};

export function useReportsSummary(
  tenantId: string | undefined,
  period: ReportPeriod,
  outletId?: string,
) {
  return useQuery<ReportSummary>({
    queryKey: ["/api/reports/summary", tenantId, period, outletId],
    queryFn: async () => {
      const params = new URLSearchParams({ period, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
      if (outletId) params.set("outletId", outletId);

      const res = await fetch(`/api/reports/summary?${params}`, {
        credentials: "include",
        headers: buildApiHeaders(),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const body = await res.json();
      return body.data;
    },
    enabled: !!tenantId,
    staleTime: 60_000,
  });
}
