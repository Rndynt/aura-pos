import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useTenant } from "@/context/TenantContext";
import { useReportsSummary, type ReportPeriod } from "@/hooks/api/useReportsSummary";
import { FeatureGate } from "@/components/ui/FeatureGate";
import {
  Calendar, ChevronDown, Wallet, ShoppingBag,
  ArrowDownRight, AlertCircle, TrendingUp, CheckCircle,
  AlertTriangle, Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/design";
import { SummaryCard } from "@/components/pos/shared/SummaryCard";
import { DashboardChartPresenter, type ChartDataPoint } from "@/components/pos/shared/DashboardChartPresenter";

const formatIDR = (price: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(price);

const shortIDR = (price: number) =>
  price >= 1_000_000 ? `Rp ${(price / 1_000_000).toFixed(1)}jt`
  : price >= 1_000 ? `Rp ${(price / 1_000).toFixed(0)}rb`
  : formatIDR(price);

const PERIOD_LABELS: Record<ReportPeriod, string> = {
  today: "Hari Ini",
  yesterday: "Kemarin",
  week: "7 Hari",
  month: "Bulan Ini",
};

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const [selectedPeriod, setSelectedPeriod] = useState<ReportPeriod>("today");
  const [activeChartItem, setActiveChartItem] = useState<ChartDataPoint | null>(null);
  const { can, tenantId } = useTenant();
  const hasAnalytics = can("reports_advanced");

  const { data, isLoading, error } = useReportsSummary(tenantId, selectedPeriod);

  const chartData: ChartDataPoint[] = useMemo(() => {
    if (!data?.chartData?.length) return [];
    const max = Math.max(...data.chartData.map((r) => r.value), 1);

    const isHourly = selectedPeriod === "today" || selectedPeriod === "yesterday";

    return data.chartData.map((r) => {
      const d = new Date(r.bucket);
      const label = isHourly
        ? `${String(d.getHours()).padStart(2, "0")}:00`
        : `${d.getDate()}/${d.getMonth() + 1}`;
      return {
        label,
        value: r.value,
        transactions: r.transactions,
        height: Math.max(8, Math.round((r.value / max) * 100)),
      };
    });
  }, [data, selectedPeriod]);

  if (!hasAnalytics) {
    return (
      <div className="flex-1 h-full bg-slate-50 overflow-y-auto pb-24 md:pb-8">
        <PageHeader title="Dashboard" subtitle="Analisa Performa" onBack={() => setLocation("/hub")} />
        <FeatureGate enabled={false} featureName="Dashboard Analitik" />
      </div>
    );
  }

  return (
    <div className="flex-1 h-full bg-slate-50 overflow-y-auto pb-24 md:pb-8">
      <PageHeader
        title="Dashboard"
        subtitle="Analisa Performa"
        onBack={() => setLocation("/hub")}
        actions={
          <div className="relative">
            <select
              value={selectedPeriod}
              onChange={(e) => {
                setSelectedPeriod(e.target.value as ReportPeriod);
                setActiveChartItem(null);
              }}
              className="appearance-none bg-white border border-slate-200 pl-9 pr-8 py-2 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
            >
              {(Object.keys(PERIOD_LABELS) as ReportPeriod[]).map((p) => (
                <option key={p} value={p}>{PERIOD_LABELS[p]}</option>
              ))}
            </select>
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        }
      />

      <div className="p-4 space-y-4 max-w-7xl mx-auto">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <SummaryCard
            icon={Wallet}
            label="Omset"
            value={isLoading ? "..." : shortIDR(data?.revenue ?? 0)}
            trend={{ icon: TrendingUp, value: isLoading ? "Memuat..." : "Data real dari server" }}
            variant="gradient"
          />
          <SummaryCard
            icon={ShoppingBag}
            label="Transaksi"
            value={isLoading ? "..." : String(data?.transactions ?? 0)}
            trend={{ icon: CheckCircle, value: "Order selesai", positive: true }}
          />
          <SummaryCard
            icon={ArrowDownRight}
            label="Avg. Bill"
            value={isLoading ? "..." : shortIDR(data?.avgBill ?? 0)}
            subtitle="Per pelanggan"
          />
          <SummaryCard
            icon={AlertCircle}
            label="Stok Menipis"
            value={isLoading ? "..." : `${data?.lowStock?.length ?? 0} Item`}
            subtitle={data?.lowStock?.length ? "Segera restock!" : "Stok aman"}
            variant="alert"
          />
        </div>

        {/* Chart */}
        {isLoading ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-10 flex items-center justify-center gap-2 text-slate-400">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Memuat data...</span>
          </div>
        ) : error ? (
          <div className="bg-red-50 rounded-2xl border border-red-100 p-6 text-center text-red-500 text-sm">
            <AlertTriangle className="mx-auto mb-2" size={20} />
            Gagal memuat data dashboard
          </div>
        ) : chartData.length > 0 ? (
          <DashboardChartPresenter
            data={chartData}
            activeItem={activeChartItem}
            onItemClick={setActiveChartItem}
            formatValue={formatIDR}
          />
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400">
            <AlertTriangle className="mx-auto mb-2" size={20} />
            <p className="font-semibold text-sm">Belum ada data penjualan untuk periode ini.</p>
          </div>
        )}

        {/* Payment Breakdown */}
        {data?.paymentBreakdown && Object.keys(data.paymentBreakdown).length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Metode Pembayaran</p>
            <div className="space-y-2">
              {Object.entries(data.paymentBreakdown).map(([method, val]) => (
                <div key={method} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600 font-medium">{method}</span>
                  <div className="text-right">
                    <span className="font-bold text-slate-800">{shortIDR(val.total)}</span>
                    <span className="text-xs text-slate-400 ml-2">{val.count}x</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Low Stock List */}
        {(data?.lowStock?.length ?? 0) > 0 && (
          <div className="bg-white rounded-2xl border border-amber-100 p-4">
            <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-3">⚠ Stok Menipis</p>
            <div className="space-y-2">
              {data!.lowStock.map((item) => (
                <div key={item.productId} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 truncate max-w-[70%]">{item.name}</span>
                  <span className="font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg text-xs">
                    Sisa {item.quantity}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
