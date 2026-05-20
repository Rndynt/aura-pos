// @ts-nocheck
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Banknote, CreditCard, QrCode, Delete } from "lucide-react";
import type { PaymentMethod } from "@/hooks/useCart";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (method: PaymentMethod, cashReceived?: number) => void;
  onMethodChange?: (method: PaymentMethod) => void;
  cartTotal: number;
  isSubmitting?: boolean;
  defaultPaymentMethod?: PaymentMethod;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

const fmtNum = (n: number) =>
  new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0 }).format(n);

const NUMPAD = ["7","8","9","4","5","6","1","2","3","000","0","⌫"] as const;

export function PaymentMethodDialog({
  open, onClose, onConfirm, onMethodChange,
  cartTotal, isSubmitting = false, defaultPaymentMethod = "cash",
}: Props) {
  const [method, setMethod] = useState<PaymentMethod>(defaultPaymentMethod);
  const [cashRaw, setCashRaw] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (open) { setMethod(defaultPaymentMethod); setCashRaw(""); setIsProcessing(false); }
  }, [open, defaultPaymentMethod]);

  const selectMethod = (m: PaymentMethod) => { setMethod(m); onMethodChange?.(m); };

  const handleKey = (k: string) => {
    if (k === "⌫") { setCashRaw(p => p.slice(0, -1)); return; }
    setCashRaw(p => {
      const next = k === "000" ? (p === "" ? "" : p + "000") : p + k;
      return parseInt(next || "0") > 99_999_999 ? p : next;
    });
  };

  const cashAmount = parseInt(cashRaw) || 0;
  const change = cashAmount - cartTotal;
  const isEnough = change >= 0;

  const handleProcess = () => {
    if (isSubmitting || isProcessing) return;
    if (method === "cash" && !isEnough) return;
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      onConfirm(method, method === "cash" ? cashAmount || cartTotal : undefined);
    }, 400);
  };

  const loading = isProcessing || isSubmitting;

  return (
    <Dialog open={open} onOpenChange={next => { if (!loading && !next) { setCashRaw(""); onClose(); } }}>
      <DialogTitle className="sr-only">Pembayaran</DialogTitle>
      <DialogContent
        className="p-0 gap-0 max-w-2xl w-full rounded-2xl overflow-hidden flex flex-row"
        style={{ height: 520 }}
        data-testid="dialog-payment-method"
      >

        {/* ── KIRI: Metode ── */}
        <div className="w-44 flex-shrink-0 bg-slate-50 border-r border-slate-200 flex flex-col p-3 gap-1">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 mb-2">Metode</p>
          {([ ["cash","Tunai",Banknote], ["ewallet","QRIS",QrCode], ["card","Kartu",CreditCard] ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => selectMethod(id)}
              className={`flex items-center gap-3 w-full px-3 py-3 rounded-xl transition-all text-left ${
                method === id
                  ? "bg-white border-2 border-blue-600 text-blue-600 shadow-sm"
                  : "hover:bg-white border-2 border-transparent text-slate-500 hover:text-slate-700"
              }`}
              data-testid={`sidebar-payment-${id}`}
            >
              <Icon size={18} />
              <span className="font-bold text-sm">{label}</span>
            </button>
          ))}

          {/* Total di bawah metode */}
          <div className="mt-auto pt-4 border-t border-slate-200">
            <p className="text-[10px] text-slate-400 font-semibold px-1 mb-1">Total Tagihan</p>
            <p className="text-xl font-black text-slate-800 px-1 tabular-nums leading-tight" data-testid="text-payment-total">
              {fmt(cartTotal)}
            </p>
          </div>
        </div>

        {/* ── KANAN: Panel pembayaran ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* ── TUNAI ── */}
          {method === "cash" && (
            <div className="flex-1 flex flex-col">

              {/* Display uang diterima */}
              <div className="px-5 pt-5 pb-3 border-b border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Uang Diterima</p>
                <div className="flex items-baseline gap-2 bg-slate-50 border-2 border-blue-500 rounded-2xl px-4 py-3">
                  <span className="text-base font-bold text-slate-400">Rp</span>
                  <span className="flex-1 text-3xl font-black text-slate-800 tabular-nums min-h-[40px] leading-tight" data-testid="input-cash-received">
                    {cashRaw === "" ? <span className="text-slate-300 font-black">0</span> : fmtNum(cashAmount)}
                  </span>
                </div>
              </div>

              {/* Numpad + quick amounts */}
              <div className="flex flex-1 min-h-0">

                {/* Numpad 3×4 */}
                <div className="flex-1 grid grid-cols-3 gap-2 p-4">
                  {NUMPAD.map(k => (
                    <button
                      key={k}
                      onClick={() => handleKey(k)}
                      className={`rounded-xl font-bold text-lg flex items-center justify-center transition-all active:scale-95 select-none ${
                        k === "⌫"
                          ? "bg-red-50 border border-red-100 text-red-500 hover:bg-red-100"
                          : "bg-white border border-slate-200 text-slate-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 shadow-sm"
                      }`}
                    >
                      {k === "⌫" ? <Delete size={18} /> : k}
                    </button>
                  ))}
                </div>

                {/* Kanan numpad: quick + kembalian + tombol bayar */}
                <div className="w-44 flex-shrink-0 flex flex-col gap-2 p-4 pl-0">
                  {/* Quick amounts */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {[{l:"Pas", v:cartTotal},{l:"50K", v:50000},{l:"100K", v:100000},{l:"200K", v:200000}].map(q => (
                      <button
                        key={q.l}
                        onClick={() => setCashRaw(String(q.v))}
                        className="py-2 text-xs font-bold bg-slate-100 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 border border-transparent text-slate-500 rounded-lg transition-colors"
                      >
                        {q.l}
                      </button>
                    ))}
                  </div>

                  {/* Kembalian / Kurang */}
                  <div className={`flex-1 rounded-xl flex flex-col items-center justify-center text-center px-2 ${
                    isEnough ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
                  }`}>
                    <p className={`text-xs font-bold mb-0.5 ${isEnough ? "text-green-600" : "text-red-500"}`}>
                      {isEnough ? "Kembalian" : "Kurang"}
                    </p>
                    <p className={`text-lg font-black tabular-nums leading-tight ${isEnough ? "text-green-700" : "text-red-600"}`} data-testid="text-change-amount">
                      {fmt(Math.abs(change))}
                    </p>
                  </div>

                  {/* Tombol bayar */}
                  <button
                    onClick={handleProcess}
                    disabled={loading || !isEnough}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-200 transition-all active:scale-[0.98]"
                    data-testid="button-confirm-payment"
                  >
                    {loading ? "Memproses…" : "Bayar"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── QRIS ── */}
          {method === "ewallet" && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8">
              <div className="bg-white p-5 rounded-2xl border-2 border-slate-800 shadow-sm">
                <QrCode size={140} className="text-slate-800" />
              </div>
              <div className="text-center">
                <p className="font-bold text-slate-800 text-lg">Scan QRIS</p>
                <p className="text-sm text-slate-400 mt-1">Menunggu pembayaran…</p>
              </div>
              <button
                onClick={handleProcess}
                disabled={loading}
                className="mt-2 px-10 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white rounded-xl font-bold shadow-lg shadow-blue-200 transition-all active:scale-[0.98]"
                data-testid="button-confirm-payment"
              >
                {loading ? "Memproses…" : "Konfirmasi Pembayaran"}
              </button>
            </div>
          )}

          {/* ── KARTU ── */}
          {method === "card" && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8">
              <div className="bg-blue-50 p-8 rounded-full">
                <CreditCard size={56} className="text-blue-600" />
              </div>
              <div className="text-center">
                <p className="font-bold text-slate-800 text-lg">Kartu Debit / Kredit</p>
                <p className="text-sm text-slate-400 mt-1 max-w-[200px]">Silakan gesek / tap kartu pada mesin EDC.</p>
              </div>
              <button
                onClick={handleProcess}
                disabled={loading}
                className="mt-2 px-10 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white rounded-xl font-bold shadow-lg shadow-blue-200 transition-all active:scale-[0.98]"
                data-testid="button-confirm-payment"
              >
                {loading ? "Memproses…" : "Konfirmasi Pembayaran"}
              </button>
            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
}
