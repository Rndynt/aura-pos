import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { List, Download, Printer } from "lucide-react";
import { useFeatures } from "@/hooks/useFeatures";
import { FeatureGate } from "@/components/ui/FeatureGate";
import { CustomSelect, PageHeader } from "@/components/design";
import { useOrders } from "@/hooks/api/useOrders";

const formatIDR = (price: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(price);

type PeriodLabel = "Hari Ini" | "Minggu Ini" | "Bulan Ini";

function getPeriodRange(period: PeriodLabel): { startDate: Date; endDate: Date } {
  const now = new Date();
  const endDate = new Date(now);
  endDate.setHours(23, 59, 59, 999);

  if (period === "Hari Ini") {
    const startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    return { startDate, endDate };
  }
  if (period === "Minggu Ini") {
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - 6);
    startDate.setHours(0, 0, 0, 0);
    return { startDate, endDate };
  }
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return { startDate, endDate };
}

// Normalize raw API order (camelCase from Drizzle) to consistent shape
function norm(o: any) {
  return {
    id: o.id,
    orderNumber: o.orderNumber ?? o.order_number ?? "",
    customerName: o.customerName ?? o.customer_name ?? "",
    tableNumber: o.tableNumber ?? o.table_number ?? "",
    total: parseFloat(o.total ?? o.totalAmount ?? o.total_amount ?? 0),
    paymentStatus: o.paymentStatus ?? o.payment_status ?? "unpaid",
    status: o.status ?? "",
    date: new Date(o.orderDate ?? o.createdAt ?? o.created_at ?? 0),
  };
}

const ReportsPage = () => {
  const [, setLocation] = useLocation();
  const [period, setPeriod] = useState<PeriodLabel>("Hari Ini");
  const { hasFeature } = useFeatures();
  const hasSalesReports = hasFeature("sales_reports");

  const { startDate, endDate } = useMemo(() => getPeriodRange(period), [period]);
  const { data: orderRes, isLoading } = useOrders({ startDate, endDate, limit: 1000 });

  const rawOrders: any[] = (orderRes as any)?.data?.orders ?? (orderRes as any)?.orders ?? [];
  const orders = rawOrders.map(norm);

  const gross = orders.reduce((s, o) => s + o.total, 0);
  const paid = orders.filter((o) => o.paymentStatus === "paid").length;
  const avgOrder = orders.length ? gross / orders.length : 0;

  if (!hasSalesReports) {
    return (
      <div className="flex flex-col h-full bg-slate-50">
        <PageHeader title="Laporan Penjualan" subtitle="Analisis detail transaksi" onBack={() => setLocation("/hub")} />
        <FeatureGate enabled={false} featureName="Laporan Penjualan" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <PageHeader
        title="Laporan Penjualan"
        subtitle="Analisis detail transaksi"
        onBack={() => setLocation("/hub")}
        actions={
          <>
            <div className="relative flex-1 md:flex-none md:w-40">
              <CustomSelect
                value={period}
                onChange={(e) => setPeriod(e.target.value as PeriodLabel)}
                options={[
                  { value: "Hari Ini", label: "Hari Ini" },
                  { value: "Minggu Ini", label: "Minggu Ini" },
                  { value: "Bulan Ini", label: "Bulan Ini" },
                ]}
              />
            </div>
            <button className="bg-blue-50 text-blue-600 p-2.5 rounded-xl" data-testid="button-download">
              <Download size={18} />
            </button>
            <button className="bg-slate-100 text-slate-600 p-2.5 rounded-xl" data-testid="button-print">
              <Printer size={18} />
            </button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border">
            <p className="text-xs text-slate-500 font-bold uppercase mb-1">Omset Kotor</p>
            <h3 className="text-2xl font-black text-slate-800">{formatIDR(gross)}</h3>
          </div>
          <div className="bg-white p-4 rounded-xl border">
            <p className="text-xs text-slate-500 font-bold uppercase mb-1">Total Transaksi</p>
            <h3 className="text-2xl font-black text-slate-800">{orders.length}</h3>
          </div>
          <div className="bg-white p-4 rounded-xl border">
            <p className="text-xs text-slate-500 font-bold uppercase mb-1">Transaksi Lunas</p>
            <h3 className="text-2xl font-black text-slate-800">{paid}</h3>
          </div>
          <div className="bg-white p-4 rounded-xl border">
            <p className="text-xs text-slate-500 font-bold uppercase mb-1">Rata-rata Order</p>
            <h3 className="text-2xl font-black text-slate-800">{formatIDR(avgOrder)}</h3>
          </div>
        </div>

        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <List size={16} /> Riwayat Transaksi
            </h3>
            {!isLoading && (
              <span className="text-xs text-slate-400 font-medium">{orders.length} transaksi</span>
            )}
          </div>

          {isLoading ? (
            <div className="p-6 text-sm text-slate-500">Memuat data laporan...</div>
          ) : orders.length === 0 ? (
            <div className="p-8 text-center text-slate-500">Belum ada transaksi pada periode ini.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-slate-500 font-bold border-b bg-white">
                  <tr>
                    <th className="p-4">ID Order</th>
                    <th className="p-4">Waktu</th>
                    <th className="p-4">Pelanggan</th>
                    <th className="p-4 text-right">Total</th>
                    <th className="p-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((trx) => (
                    <tr key={trx.id} className="hover:bg-slate-50">
                      <td className="p-4 font-bold text-blue-600">{trx.orderNumber}</td>
                      <td className="p-4 text-slate-500">
                        {isNaN(trx.date.getTime())
                          ? "-"
                          : trx.date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="p-4 font-medium text-slate-700">
                        {trx.customerName || trx.tableNumber || "Walk-in"}
                      </td>
                      <td className="p-4 text-right font-bold text-slate-800">{formatIDR(trx.total)}</td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          trx.paymentStatus === "paid"
                            ? "bg-green-100 text-green-700"
                            : trx.paymentStatus === "partial"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}>
                          {trx.paymentStatus === "paid" ? "Lunas" : trx.paymentStatus === "partial" ? "Sebagian" : "Belum Bayar"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;
