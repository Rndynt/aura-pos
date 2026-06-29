import { mockupReports, formatRp } from "../fixtures";

const maxSales = Math.max(...mockupReports.hourlyData.map(h => h.sales));

export default function MockupReportsMobilePage() {
  return (
    <div className="w-[390px] min-h-screen bg-slate-50 font-sans select-none overflow-x-hidden">
      {/* Status bar */}
      <div className="bg-blue-600 px-5 pt-3 pb-5">
        <div className="flex justify-between items-center text-white text-xs mb-4 opacity-70">
          <span>19:29</span><span>●●● 4G 100%</span>
        </div>
        <div className="text-white text-lg font-bold">Laporan Hari Ini</div>
        <div className="text-blue-200 text-xs">Selasa, 24 Juni 2026 · Aura Coffee</div>
      </div>

      {/* Hero card */}
      <div className="mx-4 -mt-3 bg-white rounded-2xl shadow-lg border border-slate-100 p-4 mb-4">
        <div className="text-xs text-slate-500 mb-1">Total Penjualan</div>
        <div className="text-2xl font-black text-slate-900">{formatRp(mockupReports.salesTotal)}</div>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-emerald-500 text-xs font-bold">↑ 12.4%</span>
          <span className="text-slate-400 text-xs">vs kemarin</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="px-4 mb-4 grid grid-cols-3 gap-3">
        {[
          { label: "Transaksi", val: mockupReports.transactions, suffix: "", color: "text-blue-600" },
          { label: "Rata-rata", val: formatRp(mockupReports.avgTransaction), suffix: "", color: "text-purple-600" },
          { label: "Item Terjual", val: mockupReports.itemsSold, suffix: "", color: "text-amber-600" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-100 p-3 text-center">
            <div className={`text-base font-black ${s.color}`}>{s.val}</div>
            <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div className="mx-4 mb-4 bg-white rounded-2xl border border-slate-100 p-4">
        <div className="text-xs font-bold text-slate-700 mb-3">Penjualan per Jam</div>
        <div className="flex items-end gap-1 h-20">
          {mockupReports.hourlyData.map(h => (
            <div key={h.hour} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full rounded-t-sm bg-blue-500 transition-all"
                style={{ height: `${Math.round((h.sales / maxSales) * 72)}px` }} />
              <span className="text-[8px] text-slate-400">{h.hour}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Payment breakdown */}
      <div className="mx-4 mb-4 bg-white rounded-2xl border border-slate-100 p-4">
        <div className="text-xs font-bold text-slate-700 mb-3">Metode Pembayaran</div>
        <div className="space-y-2.5">
          {[
            { label: "Tunai", amount: mockupReports.cashPayment, pct: Math.round(mockupReports.cashPayment / mockupReports.salesTotal * 100), color: "bg-emerald-500" },
            { label: "Non Tunai", amount: mockupReports.nonCashPayment, pct: Math.round(mockupReports.nonCashPayment / mockupReports.salesTotal * 100), color: "bg-blue-500" },
          ].map(p => (
            <div key={p.label}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-slate-600">{p.label}</span>
                <span className="text-xs font-bold text-slate-800">{formatRp(p.amount)}</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full ${p.color} rounded-full`} style={{ width: `${p.pct}%` }} />
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">{p.pct}%</div>
            </div>
          ))}
        </div>
      </div>

      {/* Top products */}
      <div className="mx-4 mb-4 bg-white rounded-2xl border border-slate-100 p-4">
        <div className="text-xs font-bold text-slate-700 mb-3">Produk Terlaris</div>
        <div className="space-y-2">
          {mockupReports.topProducts.map((p, i) => (
            <div key={p.name} className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-blue-50 flex items-center justify-center text-[10px] font-black text-blue-600">{i + 1}</div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-700 truncate">{p.name}</div>
                <div className="text-[10px] text-slate-400">{p.qty} terjual</div>
              </div>
              <div className="text-xs font-bold text-slate-700">{formatRp(p.revenue)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom nav */}
      <div className="mx-0 border-t border-slate-100 bg-white px-6 py-2 flex justify-around">
        {[
          { icon: "⊞", label: "POS", active: false },
          { icon: "📋", label: "Pesanan", active: false },
          { icon: "📊", label: "Laporan", active: true },
          { icon: "⚙️", label: "Pengaturan", active: false },
        ].map(n => (
          <div key={n.label} className={`flex flex-col items-center gap-0.5 ${n.active ? "text-blue-600" : "text-slate-400"}`}>
            <span className="text-lg">{n.icon}</span>
            <span className="text-[9px] font-medium">{n.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
