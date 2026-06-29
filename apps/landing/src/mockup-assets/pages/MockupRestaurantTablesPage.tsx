import { mockupTables, formatRp } from "../fixtures";

const STATUS = {
  available: { label: "Tersedia", cls: "bg-emerald-50 border-emerald-200 text-emerald-700", dot: "bg-emerald-500", card: "border-slate-100 hover:border-emerald-200" },
  occupied: { label: "Terisi", cls: "bg-amber-50 border-amber-200 text-amber-700", dot: "bg-amber-500", card: "border-amber-200 bg-amber-50/30" },
  reserved: { label: "Reservasi", cls: "bg-blue-50 border-blue-200 text-blue-700", dot: "bg-blue-500", card: "border-blue-200 bg-blue-50/30" },
};

export default function MockupRestaurantTablesPage() {
  const occupied = mockupTables.filter(t => t.status === "occupied").length;
  const available = mockupTables.filter(t => t.status === "available").length;
  const reserved = mockupTables.filter(t => t.status === "reserved").length;

  return (
    <div className="w-screen h-screen overflow-hidden bg-slate-50 font-sans select-none flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-sm font-bold">A</div>
          <div>
            <div className="text-base font-bold text-slate-800">Manajemen Meja</div>
            <div className="text-xs text-slate-400">Aura Coffee · {mockupTables.length} Meja</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {[
            { label: "Tersedia", count: available, dot: "bg-emerald-500" },
            { label: "Terisi", count: occupied, dot: "bg-amber-500" },
            { label: "Reservasi", count: reserved, dot: "bg-blue-500" },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${s.dot}`} />
              <span className="text-xs text-slate-600 font-medium">{s.label}</span>
              <span className="text-xs font-bold text-slate-800">{s.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Floor plan label */}
      <div className="px-6 pt-4 pb-2 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="text-sm font-bold text-slate-700">Lantai 1 — Area Utama</div>
          <div className="flex-1 border-b border-dashed border-slate-200" />
          <button className="text-xs text-blue-600 font-semibold">Tambah Lantai</button>
        </div>
      </div>

      {/* Table grid */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="grid grid-cols-5 gap-4">
          {mockupTables.map(table => {
            const st = STATUS[table.status as keyof typeof STATUS];
            return (
              <div key={table.number}
                className={`bg-white rounded-2xl border-2 p-4 cursor-pointer transition-all hover:shadow-md ${st.card}`}>
                {/* Table icon */}
                <div className="flex justify-center mb-3">
                  <div className="relative">
                    <div className={`w-14 h-10 rounded-lg border-2 ${table.status === "occupied" ? "border-amber-400 bg-amber-50" : table.status === "reserved" ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50"} flex items-center justify-center`}>
                      <span className="text-xs font-black text-slate-600">{table.number}</span>
                    </div>
                    {/* Chairs */}
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 flex gap-2">
                      {Array.from({ length: Math.min(table.seats, 4) / 2 }).map((_, i) => (
                        <div key={i} className="w-3 h-2 rounded-t-sm bg-slate-300" />
                      ))}
                    </div>
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-2">
                      {Array.from({ length: Math.min(table.seats, 4) / 2 }).map((_, i) => (
                        <div key={i} className="w-3 h-2 rounded-b-sm bg-slate-300" />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="text-center mt-2">
                  <div className="text-xs font-bold text-slate-800">Meja {table.number}</div>
                  <div className="text-[10px] text-slate-400">{table.seats} kursi</div>
                  <span className={`mt-1 inline-block text-[9px] font-bold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                </div>

                {table.status === "occupied" && (
                  <div className="mt-2 pt-2 border-t border-amber-200/60 space-y-0.5">
                    <div className="text-[10px] text-slate-500 text-center">{table.items} item</div>
                    <div className="text-xs font-black text-amber-700 text-center">{formatRp(table.total)}</div>
                  </div>
                )}
                {table.status === "reserved" && (
                  <div className="mt-2 pt-2 border-t border-blue-200/60">
                    <div className="text-[10px] text-blue-600 font-semibold text-center">Pk. 20:00</div>
                  </div>
                )}
                {table.status === "available" && (
                  <div className="mt-2">
                    <div className="text-[10px] text-emerald-600 font-semibold text-center">Siap Digunakan</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
