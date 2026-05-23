import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ChevronLeft,
  Calendar,
  ChevronDown,
  Wallet,
  ShoppingBag,
  ArrowDownRight,
  AlertCircle,
  TrendingUp,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import { SummaryCard } from "@/components/pos/shared/SummaryCard";
import { DashboardChartPresenter, type ChartDataPoint } from "@/components/pos/shared/DashboardChartPresenter";
import { useOrders } from "@/hooks/api/useOrders";
import { useProducts } from "@/hooks/api/useProducts";
import type { Order } from "@pos/domain/orders/types";

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
  // month
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return { startDate, endDate };
}

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>("today");
  const [activeChartItem, setActiveChartItem] = useState<ChartDataPoint | null>(null);

  const { startDate, endDate } = useMemo(() => getPeriodRange(selectedPeriod), [selectedPeriod]);

  const { data: orderRes, isLoading } = useOrders({ startDate, endDate, limit: 1000 });
  const { data: products = [] } = useProducts();
  const orders: Order[] = (orderRes as any)?.data?.orders ?? (orderRes as any)?.orders ?? [];

  const { chartData, revenue, transactions, avgBill, hasData } = useMemo(() => {
    const periodOrders = orders.filter((o) => o.status !== "cancelled");
    const map = new Map<string, { value: number; transactions: number }>();
    for (const o of periodOrders) {
      const d = new Date(o.created_at);
      const label =
        selectedPeriod === "today" || selectedPeriod === "yesterday"
          ? `${String(d.getHours()).padStart(2, "0")}:00`
          : `${d.getDate()}/${d.getMonth() + 1}`;
      const prev = map.get(label) ?? { value: 0, transactions: 0 };
      prev.value += o.total_amount;
      prev.transactions += 1;
      map.set(label, prev);
    }
    const raw = Array.from(map.entries()).map(([label, v]) => ({ label, ...v }));
    const maxVal = Math.max(...raw.map((r) => r.value), 1);
    const chartData: ChartDataPoint[] = raw.map((r) => ({
      ...r,
      height: Math.max(8, Math.round((r.value / maxVal) * 100)),
    }));
    const revenue = periodOrders.reduce((sum, o) => sum + o.total_amount, 0);
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

  return (
    <div className="flex-1 h-full bg-slate-50 overflow-y-auto pb-24 md:pb-8">
      <header className="bg-white border-b border-slate-200 p-4 sticky top-0 z-20 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => setLocation("/hub")} className="p-2 hover:bg-slate-100 rounded-full transition-colors" data-testid="button-back">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg font-extrabold text-slate-800">Dashboard</h1>
            <p className="text-[10px] text-slate-500 font-medium">Analisa Performa</p>
          </div>
        </div>
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
      </header>

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
