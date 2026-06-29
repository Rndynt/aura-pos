import { mockupReports, mockupOrders, formatRp } from "../fixtures";

const maxSales = Math.max(...mockupReports.hourlyData.map(h => h.sales));

export default function MockupDashboardPage() {
  return (
    <div className="w-screen h-screen overflow-hidden bg-slate-50 font-sans select-none flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-sm font-bold">A</div>
          <div>
            <div className="text-base font-bold text-slate-800">Dashboard</div>
            <div className="text-xs text-slate-400">Aura Coffee · Selasa, 24 Juni 2026</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-slate-100 text-xs text-slate-600 font-medium cursor-pointer">Hari Ini ▾</div>
          <div className="px-3 py-1.5 rounded-lg bg-slate-100 text-xs text-slate-600 font-medium cursor-pointer">Semua Outlet ▾</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Total Penjualan", val: formatRp(mockupReports.salesTotal), icon: "💰", change: "+12.4%", up: true, sub: "vs kemarin" },
            { label: "Transaksi", val: mockupReports.transactions, icon: "🧾", change: "+8.2%", up: true, sub: "vs kemarin" },
            { label: "Rata-rata Transaksi", val: formatRp(mockupReports.avgTransaction), icon: "📊", change: "+3.8%", up: true, sub: "vs kemarin" },
            { label: "Item Terjual", val: mockupReports.itemsSold, icon: "📦", change: "-2.1%", up: false, sub: "vs kemarin" },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xl">{s.icon}</div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.up ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                  {s.change}
                </span>
              </div>
              <div className="text-xl font-black text-slate-900">{s.val}</div>
              <div className="text-xs text-slate-400 mt-0.5">{s.label}</div>
              <div className="text-[10px] text-slate-300 mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Bar chart */}
          <div className="col-span-2 bg-white rounded-2xl border border-slate-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-bold text-slate-800">Penjualan Hari Ini</div>
              <div className="text-[10px] text-slate-400">per jam · IDR</div>
            </div>
            <div className="flex items-end gap-1.5 h-32">
              {mockupReports.hourlyData.map(h => (
                <div key={h.hour} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-t-md bg-blue-500 hover:bg-blue-600 transition-colors cursor-pointer"
                    style={{ height: `${Math.round((h.sales / maxSales) * 112)}px` }} />
                  <span className="text-[8px] text-slate-400">{h.hour}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-4">
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500" /><span className="text-[10px] text-slate-400">Penjualan</span></div>
              <div className="text-[10px] text-slate-400">Peak: 12:00 — {formatRp(1240000)}</div>
            </div>
          </div>

          {/* Top products */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <div className="text-sm font-bold text-slate-800 mb-4">Produk Terlaris</div>
            <div className="space-y-3">
              {mockupReports.topProducts.slice(0, 5).map((p, i) => (
                <div key={p.name} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center text-[11px] font-black text-blue-600">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-700 truncate">{p.name}</div>
                    <div className="w-full h-1 bg-slate-100 rounded-full mt-1 overflow-hidden">
                      <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.round(p.qty / mockupReports.topProducts[0].qty * 100)}%` }} />
                    </div>
                  </div>
                  <div className="text-[10px] font-bold text-slate-600 flex-shrink-0">{p.qty}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent transactions */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="text-sm font-bold text-slate-800">Transaksi Terkini</div>
            <button className="text-xs text-blue-600 font-semibold">Lihat Semua</button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                {["No. Order", "Jenis", "Item", "Total", "Status Bayar", "Waktu"].map(h => (
                  <th key={h} className="text-left px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {mockupOrders.slice(0, 5).map(o => (
                <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 font-mono text-xs font-bold text-slate-700">{o.number.replace("ORD-20260624-", "#")}</td>
                  <td className="px-5 py-3 text-xs text-slate-600">{o.type === "DINE_IN" ? `🪑 ${o.table}` : o.type === "TAKE_AWAY" ? "🛍️ Take Away" : "🚗 Delivery"}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{o.items} item</td>
                  <td className="px-5 py-3 text-xs font-bold text-slate-800">{formatRp(o.total)}</td>
                  <td className="px-5 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${o.payStatus === "paid" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : o.payStatus === "partial" ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-slate-100 text-slate-500"}`}>
                      {o.payStatus === "paid" ? "Lunas" : o.payStatus === "partial" ? "Sebagian" : "Belum Bayar"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-400">{o.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
