import { useState } from "react";
import { mockupOrders, formatRp } from "../fixtures";

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-slate-100 text-slate-500" },
  confirmed: { label: "Baru", cls: "bg-blue-50 text-blue-700 border border-blue-200" },
  preparing: { label: "Diproses", cls: "bg-amber-50 text-amber-700 border border-amber-200" },
  ready: { label: "Siap Saji", cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  served: { label: "Dikirim", cls: "bg-purple-50 text-purple-700 border border-purple-200" },
};
const PAY_MAP: Record<string, { label: string; cls: string }> = {
  unpaid: { label: "Belum Bayar", cls: "text-slate-400" },
  partial: { label: "Sebagian", cls: "text-amber-600 font-semibold" },
  paid: { label: "Lunas", cls: "text-emerald-600 font-semibold" },
};
const TYPE_MAP: Record<string, { label: string; icon: string }> = {
  DINE_IN: { label: "Dine In", icon: "🪑" },
  TAKE_AWAY: { label: "Take Away", icon: "🛍️" },
  DELIVERY: { label: "Delivery", icon: "🚗" },
};
const TABS = ["Semua", "Dine In", "Take Away", "Delivery"];

export default function MockupActiveOrdersPage() {
  const [activeTab, setActiveTab] = useState("Semua");
  const filtered = activeTab === "Semua" ? mockupOrders : mockupOrders.filter(o => TYPE_MAP[o.type]?.label === activeTab);

  return (
    <div className="w-screen h-screen overflow-hidden bg-slate-50 font-sans select-none flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-sm font-bold">A</div>
          <div>
            <div className="text-base font-bold text-slate-800">Pesanan Aktif</div>
            <div className="text-xs text-slate-400">Aura Coffee · Selasa, 24 Juni 2026</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer">+ Pesanan Baru</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-100 px-6 flex-shrink-0">
        <div className="flex items-center gap-0">
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === tab ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
              {tab}
              {tab === "Semua" && <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">{mockupOrders.length}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Bar */}
      <div className="bg-white border-b border-slate-100 px-6 py-2 flex items-center gap-6 flex-shrink-0">
        {[
          { label: "Total Pesanan", val: mockupOrders.length, color: "text-slate-800" },
          { label: "Diproses", val: mockupOrders.filter(o => o.status === "preparing").length, color: "text-amber-600" },
          { label: "Siap Saji", val: mockupOrders.filter(o => o.status === "ready").length, color: "text-emerald-600" },
          { label: "Omzet Hari Ini", val: formatRp(mockupOrders.reduce((s, o) => s + o.total, 0)), color: "text-blue-600" },
        ].map(stat => (
          <div key={stat.label} className="flex items-center gap-2">
            <span className={`text-sm font-bold ${stat.color}`}>{stat.val}</span>
            <span className="text-xs text-slate-400">{stat.label}</span>
          </div>
        ))}
      </div>

      {/* Order Cards Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-3 gap-4">
          {filtered.map(order => {
            const st = STATUS_MAP[order.status] ?? STATUS_MAP.draft;
            const pay = PAY_MAP[order.payStatus] ?? PAY_MAP.unpaid;
            const tp = TYPE_MAP[order.type] ?? TYPE_MAP.DINE_IN;
            return (
              <div key={order.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
                <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
                  <div className="font-mono text-xs font-bold text-slate-700">{order.number.replace("ORD-20260624-", "#")}</div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                </div>
                <div className="px-4 py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{tp.icon}</span>
                    <div>
                      <div className="text-xs font-semibold text-slate-700">{tp.label}{order.table ? ` · ${order.table}` : ""}</div>
                      {order.customer && <div className="text-[10px] text-slate-400">{order.customer}</div>}
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>{order.items} item</span>
                    <span className="text-[10px] text-slate-400">🕐 {order.time}</span>
                  </div>
                </div>
                <div className="px-4 py-2.5 bg-slate-50 flex items-center justify-between">
                  <span className="text-sm font-black text-slate-800">{formatRp(order.total)}</span>
                  <span className={`text-[10px] ${pay.cls}`}>{pay.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
