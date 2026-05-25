import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useFeatures } from "@/hooks/useFeatures";
import { FeatureGate } from "@/components/ui/FeatureGate";
import {
  Calendar, ChevronDown, Wallet, ShoppingBag,
  ArrowDownRight, AlertCircle, TrendingUp, CheckCircle, AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/design";
import { SummaryCard } from "@/components/pos/shared/SummaryCard";
import { DashboardChartPresenter, type ChartDataPoint } from "@/components/pos/shared/DashboardChartPresenter";
import { useOrders } from "@/hooks/api/useOrders";
import { useProducts } from "@/hooks/api/useProducts";

const formatIDR = (price: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(price);
const shortIDR = (price: number) =>
  price >= 1_000_000 ? `Rp ${(price / 1_000_000).toFixed(1)}jt` : price >= 1_000 ? `Rp ${(price / 1_000).toFixed(0)}rb` : formatIDR(price);

type PeriodKey = "today" | "yesterday" | "week" | "month";

function getPeriodRange(period: PeriodKey): { startDate: Date; endDate: Date } {
  const now = new Date();
  const endDate = new Date(now);
  endDate.setHours(23, 59, 59, 999);

  if (period === "today") {
    const startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    return { startDate, endDate };
  }
  if (period === "yesterday") {
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - 1);
    startDate.setHours(0, 0, 0, 0);
    const end = new Date(startDate);
    end.setHours(23, 59, 59, 999);
    return { startDate, endDate: end };
  }
  if (period === "week") {
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - 6);
    startDate.setHours(0, 0, 0, 0);
    return { startDate, endDate };
  }
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return { startDate, endDate };
}

// Normalize raw Drizzle camelCase response to consistent shape
function norm(o: any) {
  return {
    id: o.id,
    total: parseFloat(o.total ?? o.totalAmount ?? o.total_amount ?? 0),
    status: o.status ?? "",
    date: new Date(o.orderDate ?? o.createdAt ?? o.created_at ?? 0),
  };
}

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>("today");
  const { hasFeature } = useFeatures();
  const hasAnalytics = hasFeature("analytics_dashboard");
  const [activeChartItem, setActiveChartItem] = useState<ChartDataPoint | null>(null);

  const { startDate, endDate } = useMemo(() => getPeriodRange(selectedPeriod), [selectedPeriod]);

  const { data: orderRes, isLoading } = useOrders({ startDate, endDate, limit: 1000 });
  const { data: products = [] } = useProducts();

  const rawOrders: any[] = (orderRes as any)?.data?.orders ?? (orderRes as any)?.orders ?? [];
  const orders = rawOrders.map(norm);

  const { chartData, revenue, transactions, avgBill, hasData } = useMemo(() => {
    const periodOrders = orders.filter((o) => o.status !== "cancelled");
    const map = new Map<string, { value: number; transactions: number }>();

    for (const o of periodOrders) {
      const label =
        selectedPeriod === "today" || selectedPeriod === "yesterday"
          ? `${String(o.date.getHours()).padStart(2, "0")}:00`
          : `${o.date.getDate()}/${o.date.getMonth() + 1}`;
      const prev = map.get(label) ?? { value: 0, transactions: 0 };
      prev.value += o.total;
      prev.transactions += 1;
      map.set(label, prev);
    }

    const raw = Array.from(map.entries()).map(([label, v]) => ({ label, ...v }));
    const maxVal = Math.max(...raw.map((r) => r.value), 1);
    const chartData: ChartDataPoint[] = raw.map((r) => ({
      ...r,
      height: Math.max(8, Math.round((r.value / maxVal) * 100)),
    }));

    const revenue = periodOrders.reduce((sum, o) => sum + o.total, 0);
    const transactions = periodOrders.length;

    return {
      chartData,
      revenue,
      transactions,
      avgBill: transactions ? revenue / transactions : 0,
      hasData: periodOrders.length > 0,
    };
  }, [orders, selectedPeriod]);

  const lowStockProducts = useMemo(
    () => products.filter((p: any) => typeof p.stock_qty === "number" && p.stock_qty > 0 && p.stock_qty < 10),
    [products]
  );

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
              onChange={(e) => { setSelectedPeriod(e.target.value as PeriodKey); setActiveChartItem(null); }}
              className="appearance-none bg-white border border-slate-200 pl-9 pr-8 py-2 rounded-xl text-xs font-bold"
            >
              <option value="today">Hari Ini</option>
              <option value="yesterday">Kemarin</option>
              <option value="week">7 Hari</option>
              <option value="month">Bulan Ini</option>
            </select>
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2" />
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2" />
          </div>
        }
      />

      <div className="p-4 space-y-4 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <SummaryCard icon={Wallet} label="Omset" value={shortIDR(revenue)} trend={{ icon: TrendingUp, value: hasData ? "Data real" : "Belum ada data" }} variant="gradient" />
          <SummaryCard icon={ShoppingBag} label="Transaksi" value={transactions} trend={{ icon: CheckCircle, value: "Order", positive: true }} />
          <SummaryCard icon={ArrowDownRight} label="Avg. Bill" value={shortIDR(avgBill)} subtitle="Per pelanggan" />
          <SummaryCard icon={AlertCircle} label="Stok Menipis" value={`${lowStockProducts.length} Item`} subtitle={lowStockProducts.length ? "Segera restock!" : "Stok aman"} variant="alert" />
        </div>

        {isLoading ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-6 text-sm text-slate-500">Memuat data dashboard...</div>
        ) : chartData.length ? (
          <DashboardChartPresenter data={chartData} activeItem={activeChartItem} onItemClick={setActiveChartItem} formatValue={formatIDR} />
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-500">
            <AlertTriangle className="mx-auto mb-2" />
            <p className="font-semibold">Belum ada data penjualan untuk periode ini.</p>
          </div>
        )}
      </div>
    </div>
  );
}
