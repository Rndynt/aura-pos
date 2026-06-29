import { mockupProducts, mockupCategories, formatRp } from "../fixtures";

export default function MockupProductsPage() {
  const cats = mockupCategories.filter(c => c !== "Semua");
  return (
    <div className="w-screen h-screen overflow-hidden bg-slate-50 font-sans select-none flex flex-col">
      <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-sm font-bold">A</div>
          <div>
            <div className="text-base font-bold text-slate-800">Manajemen Produk</div>
            <div className="text-xs text-slate-400">Aura Coffee · {mockupProducts.length} Produk</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <span className="text-slate-400 text-xs">🔍</span>
            <span className="text-slate-400 text-xs">Cari produk...</span>
          </div>
          <button className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold">+ Produk Baru</button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar categories */}
        <div className="w-[200px] bg-white border-r border-slate-100 flex-shrink-0 overflow-y-auto p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 mb-2">Kategori</div>
          {["Semua Produk", ...cats].map((cat, i) => (
            <div key={cat} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium cursor-pointer mb-0.5 ${i === 0 ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-600 hover:bg-slate-50"}`}>
              <span>{cat}</span>
              <span className="text-[10px] text-slate-400 font-normal">
                {i === 0 ? mockupProducts.length : mockupProducts.filter(p => p.category === cat).length}
              </span>
            </div>
          ))}
          <div className="mt-3 px-2">
            <button className="w-full text-[11px] text-blue-600 font-semibold py-1.5 border border-dashed border-blue-200 rounded-lg">+ Kategori Baru</button>
          </div>
        </div>

        {/* Product table */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-500">Semua Produk ({mockupProducts.length})</div>
              <div className="flex items-center gap-2">
                <button className="text-xs text-slate-400 hover:text-slate-600">Filter</button>
                <button className="text-xs text-slate-400 hover:text-slate-600">Urutkan</button>
              </div>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  {["Produk", "Kategori", "Harga", "Status", "Aksi"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {mockupProducts.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-xl">{p.emoji}</div>
                        <div>
                          <div className="text-sm font-semibold text-slate-800">{p.name}</div>
                          <div className="text-[10px] text-slate-400">SKU: PRD-{p.id.toUpperCase()}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{p.category}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-sm font-bold text-slate-800">{formatRp(p.price)}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.available ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                        {p.available ? "Tersedia" : "Habis"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <button className="text-[10px] font-semibold text-blue-600">Edit</button>
                        <span className="text-slate-200">|</span>
                        <button className="text-[10px] font-semibold text-slate-400">Nonaktif</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
