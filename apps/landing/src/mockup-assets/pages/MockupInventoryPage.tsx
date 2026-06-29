import { mockupInventory, formatRp } from "../fixtures";

const STATUS = {
  normal: { label: "Normal", cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  low: { label: "Rendah", cls: "bg-amber-50 text-amber-700 border border-amber-200" },
  critical: { label: "Kritis", cls: "bg-red-50 text-red-700 border border-red-200" },
};

export default function MockupInventoryPage() {
  const criticals = mockupInventory.filter(i => i.status !== "normal").length;

  return (
    <div className="w-screen h-screen overflow-hidden bg-slate-50 font-sans select-none flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-sm font-bold">A</div>
          <div>
            <div className="text-base font-bold text-slate-800">Manajemen Inventori</div>
            <div className="text-xs text-slate-400">Aura Coffee · {mockupInventory.length} Bahan</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {criticals > 0 && (
            <div className="px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-semibold">
              ⚠️ {criticals} perlu restok
            </div>
          )}
          <button className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold">+ Tambah Item</button>
        </div>
      </div>

      {/* Alert banner */}
      <div className="mx-6 mt-4 flex-shrink-0 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
        <span className="text-xl">⚠️</span>
        <div className="flex-1">
          <div className="text-xs font-bold text-amber-800">Stok Rendah Terdeteksi</div>
          <div className="text-[11px] text-amber-700">Susu Fresh Milk, Gula Aren, Tepung Ayam Crispy membutuhkan restok segera.</div>
        </div>
        <button className="text-[11px] font-semibold text-amber-700 whitespace-nowrap">Lihat Semua</button>
      </div>

      {/* Stats */}
      <div className="px-6 mt-4 grid grid-cols-4 gap-3 flex-shrink-0">
        {[
          { label: "Total Item", val: mockupInventory.length, cls: "text-slate-800" },
          { label: "Stok Normal", val: mockupInventory.filter(i => i.status === "normal").length, cls: "text-emerald-600" },
          { label: "Stok Rendah", val: mockupInventory.filter(i => i.status === "low").length, cls: "text-amber-600" },
          { label: "Kritis", val: mockupInventory.filter(i => i.status === "critical").length, cls: "text-red-600" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-100 p-3 text-center">
            <div className={`text-xl font-black ${s.cls}`}>{s.val}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-6 mt-4 pb-6">
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                {["Nama Bahan", "Kategori", "Stok Saat Ini", "Stok Minimum", "Status", "Aksi"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {mockupInventory.map((item, i) => {
                const st = STATUS[item.status as keyof typeof STATUS];
                const pct = Math.min(100, Math.round((item.stock / item.min) * 100));
                return (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="text-sm font-semibold text-slate-800">{item.name}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{item.category}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-sm font-bold text-slate-800">{item.stock} <span className="text-xs font-normal text-slate-400">{item.unit}</span></div>
                      <div className="w-24 h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                        <div className={`h-full rounded-full ${item.status === "critical" ? "bg-red-500" : item.status === "low" ? "bg-amber-400" : "bg-emerald-500"}`}
                          style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-500">{item.min} {item.unit}</td>
                    <td className="px-4 py-3.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <button className="text-[10px] font-semibold text-blue-600 hover:text-blue-800">Opname</button>
                        <span className="text-slate-200">|</span>
                        <button className="text-[10px] font-semibold text-slate-500 hover:text-slate-700">Sesuaikan</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
