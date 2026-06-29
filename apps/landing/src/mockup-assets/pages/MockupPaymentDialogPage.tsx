import { useState } from "react";
import { mockupTotal, formatRp } from "../fixtures";

const METHODS = [
  { id: "cash", label: "Tunai", icon: "💵", sub: "Pembayaran tunai langsung" },
  { id: "qris", label: "QRIS Manual", icon: "📱", sub: "Transfer via QR code" },
  { id: "transfer", label: "Transfer Bank", icon: "🏦", sub: "Transfer manual via rekening" },
];
const FLOWS = [
  { id: "full", label: "Bayar Penuh", icon: "✅" },
  { id: "dp", label: "Down Payment", icon: "💰" },
  { id: "multi", label: "Multi Payment", icon: "🔀" },
  { id: "split", label: "Split Bill", icon: "⚡" },
];

export default function MockupPaymentDialogPage() {
  const [method, setMethod] = useState("cash");
  const [flow, setFlow] = useState("full");

  return (
    <div className="w-screen h-screen overflow-hidden font-sans select-none relative">
      {/* Background: blurred POS */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6">
        {/* Dialog */}
        <div className="bg-white rounded-2xl shadow-2xl w-[540px] max-h-[90vh] overflow-hidden flex flex-col">
          {/* Dialog header */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <div className="text-base font-bold text-slate-800">Proses Pembayaran</div>
              <div className="text-xs text-slate-400 font-mono">ORD-20260624-0003 · Meja 03</div>
            </div>
            <button className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-sm font-bold">×</button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Payment flow */}
            <div className="px-6 py-4 border-b border-slate-50">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">Jenis Pembayaran</div>
              <div className="grid grid-cols-4 gap-2">
                {FLOWS.map(f => (
                  <button key={f.id} onClick={() => setFlow(f.id)}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border text-center transition-colors ${flow === f.id ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-blue-200"}`}>
                    <span className="text-lg">{f.icon}</span>
                    <span className={`text-[10px] font-semibold leading-tight ${flow === f.id ? "text-blue-700" : "text-slate-600"}`}>{f.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Payment methods */}
            <div className="px-6 py-4 border-b border-slate-50">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">Metode Pembayaran</div>
              <div className="space-y-2">
                {METHODS.map(m => (
                  <button key={m.id} onClick={() => setMethod(m.id)}
                    className={`w-full flex items-center gap-3.5 p-3.5 rounded-xl border transition-colors ${method === m.id ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-blue-200"}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${method === m.id ? "bg-blue-100" : "bg-slate-100"}`}>{m.icon}</div>
                    <div className="flex-1 text-left">
                      <div className={`text-sm font-semibold ${method === m.id ? "text-blue-800" : "text-slate-700"}`}>{m.label}</div>
                      <div className="text-[11px] text-slate-400">{m.sub}</div>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${method === m.id ? "border-blue-600 bg-blue-600" : "border-slate-300"}`}>
                      {method === m.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className="px-6 py-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">Ringkasan Tagihan</div>
              <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-slate-500">Subtotal</span><span className="text-slate-700 font-medium">Rp 120.900</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-500">Pajak (11%)</span><span className="text-slate-700 font-medium">Rp 13.300</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-500">Terbayar (DP)</span><span className="text-emerald-600 font-medium">Rp 35.000</span></div>
                <div className="flex justify-between text-sm font-bold border-t border-slate-200 pt-2 mt-1">
                  <span className="text-slate-800">Sisa Tagihan</span>
                  <span className="text-blue-700 text-base">{formatRp(mockupTotal - 35000)}</span>
                </div>
              </div>

              {method === "cash" && (
                <div className="mt-3 bg-white rounded-xl border border-slate-200 p-3.5">
                  <div className="text-[11px] text-slate-500 mb-1">Jumlah Diterima (Tunai)</div>
                  <div className="text-xl font-black text-slate-900">{formatRp(mockupTotal)}</div>
                  <div className="text-xs text-emerald-600 font-semibold mt-0.5">Kembalian: Rp 0</div>
                </div>
              )}
            </div>
          </div>

          {/* Dialog footer */}
          <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
            <button className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold">Batal</button>
            <button className="flex-2 px-6 py-3 rounded-xl bg-blue-600 text-white text-sm font-bold">
              Konfirmasi Pembayaran
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
