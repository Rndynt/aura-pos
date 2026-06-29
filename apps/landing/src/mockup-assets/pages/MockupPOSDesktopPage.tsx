import { useState } from "react";
import { mockupProducts, mockupCartItems, mockupSubtotal, mockupTax, mockupTotal, mockupCategories, formatRp } from "../fixtures";

const NAV_ITEMS = [
  { icon: "▣", label: "POS", active: true },
  { icon: "≡", label: "Pesanan", active: false },
  { icon: "⊡", label: "Meja", active: false },
  { icon: "◈", label: "Dapur", active: false },
  { icon: "▦", label: "Laporan", active: false },
  { icon: "⊞", label: "Produk", active: false },
  { icon: "◫", label: "Inventori", active: false },
];

export default function MockupPOSDesktopPage() {
  const [activeCategory, setActiveCategory] = useState("Semua");
  const filtered = activeCategory === "Semua" ? mockupProducts : mockupProducts.filter(p => p.category === activeCategory);

  return (
    <div className="flex w-screen h-screen overflow-hidden bg-slate-50 font-sans select-none" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* ── Sidebar ── */}
      <div className="w-[180px] flex-shrink-0 bg-[#0f172a] flex flex-col h-full">
        <div className="px-4 py-4 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-black">A</div>
            <div>
              <div className="text-white text-xs font-bold leading-tight">AuraPoS</div>
              <div className="text-slate-500 text-[9px]">Aura Coffee</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {NAV_ITEMS.map(item => (
            <div key={item.label}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer text-[11px] font-medium transition-colors ${item.active ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>
              <span className="text-sm leading-none opacity-70">{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </nav>
        <div className="px-3 py-3 border-t border-white/5">
          <div className="flex items-center gap-2 px-2">
            <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-[9px] font-bold">A</div>
            <div>
              <div className="text-slate-300 text-[10px] font-medium">Ayu Lestari</div>
              <div className="text-slate-600 text-[9px]">Kasir</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Product Area ── */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between flex-shrink-0">
          <div>
            <div className="text-sm font-bold text-slate-800">Kasir POS</div>
            <div className="text-[10px] text-slate-400">Selasa, 24 Juni 2026 · 19:29</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-100">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-[10px] text-emerald-700 font-medium">Online</span>
            </div>
            <div className="px-2.5 py-1 rounded-lg bg-slate-100 text-[10px] text-slate-600 font-medium border border-slate-200">Dine In</div>
          </div>
        </div>

        {/* Search + categories */}
        <div className="bg-white border-b border-slate-100 px-4 py-2.5 flex items-center gap-3 flex-shrink-0">
          <div className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-slate-400">
              <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8.5 8.5L11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span className="text-[11px] text-slate-400">Cari produk...</span>
          </div>
        </div>
        <div className="bg-white border-b border-slate-100 px-4 py-2 flex items-center gap-1.5 flex-shrink-0 overflow-x-hidden">
          {mockupCategories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-[10px] font-semibold border transition-all ${activeCategory === cat ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-blue-300"}`}>
              {cat}
            </button>
          ))}
        </div>

        {/* Product grid — compact cards */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-3 gap-2.5">
            {filtered.map(product => (
              <div key={product.id}
                className={`bg-white rounded-xl border border-slate-100 overflow-hidden cursor-pointer hover:border-blue-200 hover:shadow-sm transition-all ${!product.available ? "opacity-50" : ""}`}>
                {/* Product image area — compact */}
                <div className="bg-slate-50 h-[72px] flex items-center justify-center text-2xl border-b border-slate-100">
                  {product.emoji}
                </div>
                <div className="p-2.5">
                  <div className="text-[9px] text-slate-400 mb-0.5">{product.category}</div>
                  <div className="text-[11px] font-semibold text-slate-800 leading-tight mb-1.5 truncate">{product.name}</div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-blue-600">{formatRp(product.price)}</span>
                    {!product.available && <span className="text-[9px] text-red-500 font-medium">Habis</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Cart Panel ── */}
      <div className="w-[260px] flex-shrink-0 bg-white border-l border-slate-100 flex flex-col h-full">
        <div className="px-4 py-3 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-slate-800">Keranjang</div>
              <div className="text-[10px] text-slate-400">Dine In · Meja 03</div>
            </div>
            <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
              <span className="text-white text-[9px] font-black">{mockupCartItems.reduce((s, i) => s + i.qty, 0)}</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {mockupCartItems.map((ci, idx) => (
            <div key={idx} className="flex items-center gap-2.5 py-2 border-b border-slate-50">
              <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-base flex-shrink-0">{ci.product.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-semibold text-slate-800 truncate">{ci.product.name}</div>
                <div className="text-[9px] text-slate-400">{formatRp(ci.product.price)}</div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button className="w-5 h-5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold flex items-center justify-center leading-none">−</button>
                <span className="text-[10px] font-bold text-slate-800 w-4 text-center">{ci.qty}</span>
                <button className="w-5 h-5 rounded-md bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center leading-none">+</button>
              </div>
            </div>
          ))}
        </div>

        <div className="px-3 pt-3 pb-3.5 border-t border-slate-100 flex-shrink-0 space-y-1.5">
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>Subtotal</span><span className="font-medium text-slate-700">{formatRp(mockupSubtotal)}</span>
          </div>
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>Pajak (11%)</span><span className="font-medium text-slate-700">{formatRp(mockupTax)}</span>
          </div>
          <div className="flex justify-between items-center pt-1.5 border-t border-slate-100">
            <span className="text-xs font-bold text-slate-800">Total</span>
            <span className="text-sm font-black text-blue-600">{formatRp(mockupTotal)}</span>
          </div>
          <button className="w-full mt-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold transition-colors">
            Bayar Sekarang
          </button>
          <button className="w-full py-2 rounded-xl bg-slate-100 text-slate-600 text-[10px] font-semibold">
            Simpan Draft
          </button>
        </div>
      </div>
    </div>
  );
}
