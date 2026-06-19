// @ts-nocheck
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Banknote, CreditCard, QrCode, Delete, X, Plus, Trash2, CheckCircle2, AlertCircle,
} from "lucide-react";
import type { PaymentMethod, CartItem } from "@/hooks/useCart";
import { getItemEffectiveTotal } from "@/hooks/useCart";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (method: PaymentMethod, cashReceived?: number, partialAmount?: number) => void;
  onMethodChange?: (method: PaymentMethod) => void;
  cartTotal: number;
  cartItems?: CartItem[];
  isSubmitting?: boolean;
  defaultPaymentMethod?: PaymentMethod;
  allowPartial?: boolean;
  allowMultiPayment?: boolean;
  allowSplitBill?: boolean;
  initialPartialMode?: boolean;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
const fmtNum = (n: number) =>
  new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0 }).format(n);

const NUMPAD = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "000", "0", "⌫"] as const;
type PaymentFlow = "full" | "dp" | "multi" | "split";

const METHODS = [
  { id: "cash" as PaymentMethod, label: "Tunai", Icon: Banknote },
  { id: "ewallet" as PaymentMethod, label: "QRIS", Icon: QrCode },
  { id: "card" as PaymentMethod, label: "Kartu", Icon: CreditCard },
];

// Bill A=blue, B=violet, C=amber, D=rose
const BILL_COLORS = [
  {
    active: "bg-blue-600 text-white border-blue-600",
    inactive: "bg-white text-blue-600 border-blue-300",
    item: "bg-blue-600 text-white",
    total: "bg-blue-50 text-blue-700",
    shadow: "shadow-blue-200",
  },
  {
    active: "bg-violet-600 text-white border-violet-600",
    inactive: "bg-white text-violet-600 border-violet-300",
    item: "bg-violet-600 text-white",
    total: "bg-violet-50 text-violet-700",
    shadow: "shadow-violet-200",
  },
  {
    active: "bg-amber-500 text-white border-amber-500",
    inactive: "bg-white text-amber-600 border-amber-300",
    item: "bg-amber-500 text-white",
    total: "bg-amber-50 text-amber-700",
    shadow: "shadow-amber-200",
  },
  {
    active: "bg-rose-500 text-white border-rose-500",
    inactive: "bg-white text-rose-600 border-rose-300",
    item: "bg-rose-500 text-white",
    total: "bg-rose-50 text-rose-700",
    shadow: "shadow-rose-200",
  },
];

function useIsLandscape() {
  const [isLandscape, setIsLandscape] = useState(
    () => typeof window !== "undefined" && window.innerWidth > window.innerHeight && window.innerWidth < 1024
  );
  useEffect(() => {
    const check = () =>
      setIsLandscape(window.innerWidth > window.innerHeight && window.innerWidth < 1024);
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);
  return isLandscape;
}

export function PaymentMethodDialog({
  open,
  onClose,
  onConfirm,
  onMethodChange,
  cartTotal,
  cartItems = [],
  isSubmitting = false,
  defaultPaymentMethod = "cash",
  allowPartial = false,
  allowMultiPayment = false,
  allowSplitBill = false,
  initialPartialMode = false,
}: Props) {
  const [method, setMethod] = useState<PaymentMethod>(defaultPaymentMethod);
  const [cashRaw, setCashRaw] = useState("");
  const [partialRaw, setPartialRaw] = useState("");
  const [flow, setFlow] = useState<PaymentFlow>(initialPartialMode ? "dp" : "full");
  const [isProcessing, setIsProcessing] = useState(false);
  const isLandscape = useIsLandscape();

  // ── Multi payment state ─────────────────────────────────────────────────
  const [multiEntries, setMultiEntries] = useState<Array<{ id: number; method: PaymentMethod; amount: number }>>([]);
  const [multiRaw, setMultiRaw] = useState("");
  const [multiMethod, setMultiMethod] = useState<PaymentMethod>("cash");

  // ── Split bill state ────────────────────────────────────────────────────
  // itemBillMap: itemId → bill label ("A","B",...) or undefined = unassigned
  const [splitBills, setSplitBills] = useState<string[]>(["A", "B"]);
  const [activeBill, setActiveBill] = useState<string>("A");
  const [itemBillMap, setItemBillMap] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    if (!open) return;
    setMethod(defaultPaymentMethod);
    setCashRaw("");
    setPartialRaw("");
    setFlow(initialPartialMode ? "dp" : "full");
    setIsProcessing(false);
    setMultiEntries([]);
    setMultiRaw("");
    setMultiMethod("cash");
    setSplitBills(["A", "B"]);
    setActiveBill("A");
    setItemBillMap({});
  }, [open, defaultPaymentMethod, initialPartialMode]);

  // ── Derived: full ────────────────────────────────────────────────────────
  const cashAmount = parseInt(cashRaw) || 0;
  const change = cashAmount - cartTotal;
  const isEnough = change >= 0;
  const partialAmount = parseInt(partialRaw) || 0;
  const remaining = cartTotal - partialAmount;
  const isValidPartial = partialAmount > 0 && partialAmount < cartTotal;
  const loading = isProcessing || isSubmitting;

  // ── Derived: multi ───────────────────────────────────────────────────────
  const multiPaid = multiEntries.reduce((s, e) => s + e.amount, 0);
  const multiRemaining = Math.max(0, cartTotal - multiPaid);
  const multiInputAmount = parseInt(multiRaw) || 0;
  const multiCanAdd = multiInputAmount > 0 && multiInputAmount <= multiRemaining;
  const multiComplete = multiRemaining === 0;

  // ── Derived: split ───────────────────────────────────────────────────────
  const getBillForItem = (itemId: string): string | undefined => itemBillMap[itemId];
  const unassignedCount = cartItems.filter(item => !getBillForItem(item.id)).length;
  const getBillTotal = (bill: string) =>
    cartItems.reduce((sum, item) => getBillForItem(item.id) === bill ? sum + getItemEffectiveTotal(item) : sum, 0);
  const activeBillTotal = getBillTotal(activeBill);
  const canPayActiveBill = activeBillTotal > 0;

  const handleItemTap = (itemId: string) => {
    const current = getBillForItem(itemId);
    if (current === activeBill) {
      // unassign
      setItemBillMap(prev => { const next = { ...prev }; delete next[itemId]; return next; });
    } else {
      // assign to active bill
      setItemBillMap(prev => ({ ...prev, [itemId]: activeBill }));
    }
  };

  const addBill = () => {
    if (splitBills.length >= 4) return;
    const next = String.fromCharCode(65 + splitBills.length);
    setSplitBills(prev => [...prev, next]);
    setActiveBill(next);
  };

  const getItemLabel = (item: CartItem): string => {
    const parts: string[] = [];
    if (item.variant?.name) parts.push(item.variant.name);
    if (item.selectedOptions?.length) {
      parts.push(...item.selectedOptions.map(o => o.option_name).filter(Boolean));
    }
    return parts.length ? `${item.product.name} · ${parts.join(", ")}` : item.product.name;
  };

  // ── Handlers ─────────────────────────────────────────────────────────────
  const selectMethod = (nextMethod: PaymentMethod) => {
    setMethod(nextMethod);
    onMethodChange?.(nextMethod);
  };

  const handleKey = (key: string) => {
    const current = flow === "dp" ? partialRaw : cashRaw;
    const setRaw = flow === "dp" ? setPartialRaw : setCashRaw;
    if (key === "⌫") { setRaw(current.slice(0, -1)); return; }
    const next = key === "000" ? (current === "" ? "" : current + "000") : current + key;
    if (parseInt(next || "0") <= 99_999_999) setRaw(next);
  };

  const handleProcess = () => {
    if (loading) return;
    if (flow === "dp") {
      if (!isValidPartial) return;
      setIsProcessing(true);
      setTimeout(() => { setIsProcessing(false); onConfirm(method, undefined, partialAmount); }, 400);
      return;
    }
    if (flow === "multi") {
      if (!multiComplete) return;
      setIsProcessing(true);
      setTimeout(() => { setIsProcessing(false); onConfirm(method); }, 400);
      return;
    }
    if (flow === "split") {
      if (!canPayActiveBill) return;
      setIsProcessing(true);
      const isLastBill = activeBillTotal >= cartTotal - 1; // within 1 IDR rounding
      setTimeout(() => {
        setIsProcessing(false);
        if (isLastBill) {
          onConfirm(method);
        } else {
          onConfirm(method, undefined, activeBillTotal);
        }
      }, 400);
      return;
    }
    // full
    if (method === "cash" && !isEnough) return;
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      onConfirm(method, method === "cash" ? cashAmount || cartTotal : undefined);
    }, 400);
  };

  const close = () => { if (loading) return; setCashRaw(""); setPartialRaw(""); onClose(); };

  const hasExtraFlows = allowPartial || allowMultiPayment || allowSplitBill;

  /* ── Left panel ──────────────────────────────────────────────────────── */
  const LeftPanel = () => (
    <div className={`flex flex-col ${isLandscape ? "w-[180px] border-r border-slate-100 flex-shrink-0" : "w-full"}`}>
      <div className="px-4 pt-4 pb-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Pembayaran</p>
        <p className="text-xl font-black text-slate-900 tabular-nums leading-tight" data-testid="text-payment-total">
          {fmt(cartTotal)}
        </p>
      </div>

      {hasExtraFlows && (
        <div className="px-4 mb-3 flex gap-1.5 flex-wrap">
          {([
            ["full", "Bayar Penuh"],
            ...(allowPartial ? [["dp", "DP"]] : []),
            ...(allowMultiPayment ? [["multi", "Multi"]] : []),
            ...(allowSplitBill ? [["split", "Split"]] : []),
          ] as [PaymentFlow, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => { setFlow(id); setCashRaw(""); setPartialRaw(""); }}
              className={`flex-1 text-xs font-bold py-1.5 px-2 rounded-lg transition-all ${
                flow === id ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
              data-testid={`button-payment-flow-${id}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Method selector — hidden in split (irrelevant to split display) */}
      {flow !== "split" && (
        <div className="px-4 mb-3">
          <div className={`grid gap-2 ${isLandscape ? "grid-cols-1" : "grid-cols-3"}`}>
            {METHODS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => selectMethod(id)}
                className={`flex items-center gap-2 py-2.5 px-3 rounded-xl border-2 transition-all font-bold text-xs ${
                  isLandscape ? "justify-start" : "flex-col justify-center"
                } ${
                  method === id
                    ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200"
                    : "bg-white border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-600"
                }`}
                data-testid={`sidebar-payment-${id}`}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  /* ── Content area ────────────────────────────────────────────────────── */
  const ContentArea = () => (
    <div className={`flex flex-col flex-1 min-h-0 ${isLandscape ? "overflow-y-auto" : ""}`}>

      {/* ── DP ── */}
      {flow === "dp" && (
        <>
          <div className="px-4 mb-2">
            <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1.5">Jumlah DP</p>
            <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl px-4 py-2.5 flex items-center gap-2 min-h-[50px]">
              <span className="text-sm font-bold text-amber-400">Rp</span>
              <span className="flex-1 text-xl font-black text-slate-800 tabular-nums" data-testid="input-partial-amount">
                {partialRaw === "" ? <span className="text-slate-300">0</span> : fmtNum(partialAmount)}
              </span>
            </div>
          </div>
          <div className="px-4 mb-2 grid grid-cols-4 gap-1.5">
            {[{ l: "25%", v: Math.round(cartTotal * 0.25) }, { l: "50%", v: Math.round(cartTotal * 0.5) }, { l: "75%", v: Math.round(cartTotal * 0.75) }, { l: "Reset", v: 0 }].map((p) => (
              <button key={p.l} onClick={() => setPartialRaw(p.v > 0 ? String(p.v) : "")}
                className={`py-1.5 text-xs font-bold rounded-lg transition-colors border ${partialAmount === p.v && p.v > 0 ? "bg-amber-400 text-white border-amber-400" : p.l === "Reset" ? "bg-slate-100 border-transparent text-slate-400 hover:bg-red-50 hover:text-red-500" : "bg-slate-100 border-transparent text-slate-500 hover:bg-amber-50 hover:text-amber-600"}`}>
                {p.l}
              </button>
            ))}
          </div>
          <div className="px-4 grid grid-cols-3 gap-1.5 mb-2">
            {NUMPAD.map((key) => (
              <button key={key} onClick={() => handleKey(key)}
                className={`h-11 rounded-xl font-bold text-lg flex items-center justify-center transition-all active:scale-95 select-none border ${
                  key === "⌫" ? "bg-red-50 border-red-100 text-red-500 hover:bg-red-100" : "bg-white border-slate-200 text-slate-700 hover:bg-amber-50 hover:border-amber-300 shadow-sm"
                }`}>
                {key === "⌫" ? <Delete size={16} /> : key}
              </button>
            ))}
          </div>
          <div className="px-4 pb-4 flex items-center gap-2">
            <div className={`flex-1 rounded-xl px-3 py-2 text-center border ${isValidPartial ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-200"}`}>
              <p className={`text-[9px] font-bold uppercase tracking-wider ${isValidPartial ? "text-amber-500" : "text-slate-400"}`}>Sisa Tagihan</p>
              <p className={`text-sm font-black tabular-nums ${isValidPartial ? "text-amber-700" : "text-slate-400"}`} data-testid="text-remaining-balance">
                {fmt(isValidPartial ? remaining : cartTotal)}
              </p>
            </div>
            <button onClick={handleProcess} disabled={loading || !isValidPartial}
              className="flex-1 h-11 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm shadow-lg shadow-amber-200 transition-all active:scale-[0.98]"
              data-testid="button-confirm-partial">
              {loading ? "Memproses…" : partialAmount > 0 ? `DP ${fmt(partialAmount)}` : "Masukkan Jumlah"}
            </button>
          </div>
        </>
      )}

      {/* ── FULL CASH ── */}
      {flow === "full" && method === "cash" && (
        <>
          <div className="px-4 mb-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Uang Diterima</p>
            <div className="bg-slate-50 border-2 border-blue-500 rounded-2xl px-4 py-2.5 flex items-center gap-2 min-h-[50px]">
              <span className="text-sm font-bold text-slate-400">Rp</span>
              <span className="flex-1 text-xl font-black text-slate-800 tabular-nums" data-testid="input-cash-received">
                {cashRaw === "" ? <span className="text-slate-300">0</span> : fmtNum(cashAmount)}
              </span>
            </div>
          </div>
          <div className="px-4 mb-2 grid grid-cols-4 gap-1.5">
            {[{ l: "Pas", v: cartTotal }, { l: "50K", v: 50000 }, { l: "100K", v: 100000 }, { l: "200K", v: 200000 }].map((p) => (
              <button key={p.l} onClick={() => setCashRaw(String(p.v))}
                className="py-1.5 text-xs font-bold bg-slate-100 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 border border-transparent text-slate-500 rounded-lg transition-colors">
                {p.l}
              </button>
            ))}
          </div>
          <div className="px-4 grid grid-cols-3 gap-1.5 mb-2">
            {NUMPAD.map((key) => (
              <button key={key} onClick={() => handleKey(key)}
                className={`h-11 rounded-xl font-bold text-lg flex items-center justify-center transition-all active:scale-95 select-none border ${
                  key === "⌫" ? "bg-red-50 border-red-100 text-red-500 hover:bg-red-100" : "bg-white border-slate-200 text-slate-700 hover:bg-blue-50 hover:border-blue-300 shadow-sm"
                }`}>
                {key === "⌫" ? <Delete size={16} /> : key}
              </button>
            ))}
          </div>
          <div className="px-4 pb-4 flex items-center gap-2">
            <div className={`flex-1 rounded-xl px-3 py-2 text-center border ${isEnough ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
              <p className={`text-[9px] font-bold uppercase tracking-wider ${isEnough ? "text-green-500" : "text-red-400"}`}>{isEnough ? "Kembalian" : "Kurang"}</p>
              <p className={`text-sm font-black tabular-nums ${isEnough ? "text-green-700" : "text-red-600"}`} data-testid="text-change-amount">
                {fmt(Math.abs(change))}
              </p>
            </div>
            <button onClick={handleProcess} disabled={loading || !isEnough}
              className="flex-1 h-11 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white rounded-xl font-bold shadow-lg shadow-blue-200 transition-all active:scale-[0.98]"
              data-testid="button-confirm-payment">
              {loading ? "Memproses…" : "Bayar"}
            </button>
          </div>
        </>
      )}

      {/* ── QRIS ── */}
      {flow === "full" && method === "ewallet" && (
        <div className="flex flex-col items-center justify-center gap-3 px-6 pb-6">
          <div className="bg-white p-4 rounded-2xl border-2 border-slate-800 shadow-sm">
            <QrCode size={isLandscape ? 80 : 100} className="text-slate-800" />
          </div>
          <div className="text-center">
            <p className="font-bold text-slate-800">Scan QRIS</p>
            <p className="text-sm text-slate-400 mt-0.5">Menunggu pembayaran…</p>
          </div>
          <button onClick={handleProcess} disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white rounded-xl font-bold shadow-lg shadow-blue-200 transition-all active:scale-[0.98]"
            data-testid="button-confirm-payment">
            {loading ? "Memproses…" : "Konfirmasi Pembayaran"}
          </button>
        </div>
      )}

      {/* ── KARTU ── */}
      {flow === "full" && method === "card" && (
        <div className="flex flex-col items-center justify-center gap-3 px-6 pb-6">
          <div className="bg-blue-50 p-6 rounded-full">
            <CreditCard size={isLandscape ? 36 : 44} className="text-blue-600" />
          </div>
          <div className="text-center">
            <p className="font-bold text-slate-800">Kartu Debit / Kredit</p>
            <p className="text-sm text-slate-400 mt-0.5 max-w-[200px]">Silakan gesek / tap kartu pada mesin EDC.</p>
          </div>
          <button onClick={handleProcess} disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white rounded-xl font-bold shadow-lg shadow-blue-200 transition-all active:scale-[0.98]"
            data-testid="button-confirm-payment">
            {loading ? "Memproses…" : "Konfirmasi Pembayaran"}
          </button>
        </div>
      )}

      {/* ── MULTI PAYMENT ── */}
      {flow === "multi" && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Progress header */}
          <div className="bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-3">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-teal-100">Terbayar {fmt(multiPaid)}</span>
              <span className="text-white font-bold">Sisa {fmt(multiRemaining)}</span>
            </div>
            <div className="bg-teal-800/40 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, cartTotal > 0 ? (multiPaid / cartTotal) * 100 : 0)}%` }}
              />
            </div>
          </div>

          {/* Entries */}
          {multiEntries.length > 0 && (
            <div className="px-4 pt-3 pb-1 space-y-1.5 max-h-[120px] overflow-y-auto">
              {multiEntries.map(e => {
                const m = METHODS.find(m => m.id === e.method)!;
                return (
                  <div key={e.id} className="flex items-center gap-2 rounded-xl px-3 py-2 bg-slate-50 border border-slate-200">
                    <m.Icon size={13} className="text-slate-500 flex-shrink-0" />
                    <span className="text-xs text-slate-600 flex-1">{m.label}</span>
                    <span className="text-sm font-black text-slate-800 tabular-nums">{fmt(e.amount)}</span>
                    <button onClick={() => setMultiEntries(prev => prev.filter(x => x.id !== e.id))}
                      className="text-slate-300 hover:text-red-400 transition-colors ml-1">
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add section */}
          {!multiComplete && (
            <div className="px-4 pt-3 pb-2 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Tambah Pembayaran</p>
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                {METHODS.map(({ id, label, Icon }) => (
                  <button key={id} onClick={() => setMultiMethod(id)}
                    className={`flex flex-col items-center gap-1 py-2 rounded-xl border-2 text-xs font-bold transition-all ${
                      multiMethod === id ? "bg-teal-50 border-teal-400 text-teal-700" : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"
                    }`}>
                    <Icon size={15} />
                    {label}
                  </button>
                ))}
              </div>
              <div className="bg-slate-50 border-2 border-teal-400 rounded-2xl px-4 py-2 flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-slate-400">Rp</span>
                <span className="flex-1 text-lg font-black text-slate-800 tabular-nums">
                  {multiRaw === "" ? <span className="text-slate-300">0</span> : fmtNum(multiInputAmount)}
                </span>
                <button onClick={() => setMultiRaw(String(multiRemaining))}
                  className="text-[10px] font-bold text-teal-600 bg-teal-50 border border-teal-200 px-2 py-1 rounded-lg">
                  Sisa
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1 mb-2">
                {NUMPAD.map((key) => (
                  <button key={key}
                    onClick={() => {
                      if (key === "⌫") { setMultiRaw(r => r.slice(0, -1)); return; }
                      const next = key === "000" ? (multiRaw === "" ? "" : multiRaw + "000") : multiRaw + key;
                      if (parseInt(next || "0") <= 99_999_999) setMultiRaw(next);
                    }}
                    className={`h-9 rounded-lg font-bold text-base flex items-center justify-center transition-all active:scale-95 select-none border ${
                      key === "⌫" ? "bg-red-50 border-red-100 text-red-500" : "bg-white border-slate-200 text-slate-700 hover:bg-teal-50 hover:border-teal-200 shadow-sm"
                    }`}>
                    {key === "⌫" ? <Delete size={14} /> : key}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  if (!multiCanAdd) return;
                  setMultiEntries(prev => [...prev, { id: Date.now(), method: multiMethod, amount: multiInputAmount }]);
                  setMultiRaw("");
                }}
                disabled={!multiCanAdd}
                className="w-full py-2.5 rounded-xl bg-teal-500 hover:bg-teal-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold text-sm flex items-center justify-center gap-1.5 transition-all">
                <Plus size={14} />
                Tambah {METHODS.find(m => m.id === multiMethod)?.label}
                {multiInputAmount > 0 ? ` · ${fmt(multiInputAmount)}` : ""}
              </button>
            </div>
          )}

          {multiComplete && (
            <div className="px-4 pb-4 pt-3">
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2 mb-3">
                <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
                <p className="text-xs font-bold text-green-700">Semua pembayaran terpenuhi!</p>
              </div>
              <button onClick={handleProcess} disabled={loading}
                className="w-full py-3 bg-green-500 hover:bg-green-600 disabled:bg-slate-200 text-white font-bold rounded-xl shadow-lg shadow-green-200 transition-all active:scale-[0.98]"
                data-testid="button-confirm-payment">
                {loading ? "Memproses…" : "Selesaikan Pembayaran"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── SPLIT BILL ── */}
      {flow === "split" && (
        <div className="flex flex-col" style={{ minHeight: 0 }}>

          {/* Step 1: Bill selector */}
          <div className="px-4 pt-3 pb-2 border-b border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              1 · Pilih Bill Aktif
            </p>
            <div className="flex gap-2 items-center">
              {splitBills.map((bill, idx) => {
                const colors = BILL_COLORS[idx % BILL_COLORS.length];
                const isActive = activeBill === bill;
                const billTotal = getBillTotal(bill);
                return (
                  <button
                    key={bill}
                    onClick={() => setActiveBill(bill)}
                    className={`flex-1 flex flex-col items-center py-2 px-1 rounded-xl border-2 transition-all font-black text-sm ${
                      isActive ? colors.active + " shadow-lg " + colors.shadow : colors.inactive
                    }`}
                  >
                    <span>Bill {bill}</span>
                    <span className={`text-[10px] font-semibold mt-0.5 tabular-nums ${isActive ? "text-white/80" : "opacity-60"}`}>
                      {fmt(billTotal)}
                    </span>
                  </button>
                );
              })}
              {splitBills.length < 4 && (
                <button
                  onClick={addBill}
                  className="w-10 h-14 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 flex items-center justify-center hover:border-slate-400 hover:text-slate-500 transition-all flex-shrink-0"
                >
                  <Plus size={18} />
                </button>
              )}
            </div>
          </div>

          {/* Step 2: item list */}
          <div className="px-4 pt-2 pb-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              2 · Ketuk Item → Masuk ke Bill {activeBill}
            </p>
          </div>

          <div className="overflow-y-auto px-4 pb-2 space-y-1.5" style={{ maxHeight: "38vh" }}>
            {cartItems.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">Tidak ada item di keranjang</p>
            ) : (
              cartItems.map(item => {
                const assignedBill = getBillForItem(item.id);
                const assignedIdx = assignedBill ? splitBills.indexOf(assignedBill) : -1;
                const assignedColors = assignedIdx >= 0 ? BILL_COLORS[assignedIdx % BILL_COLORS.length] : null;
                const isOnActiveBill = assignedBill === activeBill;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemTap(item.id)}
                    className={`w-full flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-all active:scale-[0.98] ${
                      isOnActiveBill
                        ? "border-blue-300 bg-blue-50"
                        : assignedBill
                        ? "border-slate-200 bg-white opacity-60"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    {/* Assignment badge */}
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-black transition-all ${
                      assignedColors
                        ? assignedColors.item
                        : "bg-slate-100 text-slate-300 border-2 border-dashed border-slate-200"
                    }`}>
                      {assignedBill || "?"}
                    </div>

                    {/* Item info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{getItemLabel(item)}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {item.quantity}× · {fmt(getItemEffectiveTotal(item))}
                      </p>
                    </div>

                    {/* Checkmark if on active bill */}
                    {isOnActiveBill && (
                      <CheckCircle2 size={16} className="text-blue-500 flex-shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Bill totals + confirm */}
          <div className="px-4 pb-4 pt-2 border-t border-slate-100 mt-auto">
            {/* Per-bill totals (compact row) */}
            <div className="flex gap-2 mb-3">
              {splitBills.map((bill, idx) => {
                const colors = BILL_COLORS[idx % BILL_COLORS.length];
                const total = getBillTotal(bill);
                const isActive = bill === activeBill;
                return (
                  <div
                    key={bill}
                    className={`flex-1 flex flex-col items-center py-1.5 rounded-lg border transition-all ${
                      isActive
                        ? `${colors.total} border-current font-black`
                        : "bg-slate-50 border-slate-100 text-slate-500"
                    }`}
                  >
                    <span className={`text-[10px] font-bold ${isActive ? colors.total.replace("bg-", "text-").split(" ")[1] : "text-slate-400"}`}>
                      Bill {bill}
                    </span>
                    <span className={`text-xs font-black tabular-nums ${isActive ? colors.total.split(" ")[1] : "text-slate-500"}`}>
                      {fmt(total)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Unassigned note (info only, not a blocker) */}
            {unassignedCount > 0 && (
              <div className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-2.5 py-1.5 mb-2">
                <AlertCircle size={11} className="text-slate-400 flex-shrink-0" />
                <p className="text-[10px] text-slate-400">
                  {unassignedCount} item belum di-assign — akan tersisa untuk bill lain
                </p>
              </div>
            )}

            {/* Pay active bill button */}
            <button
              onClick={handleProcess}
              disabled={loading || !canPayActiveBill}
              className="w-full py-3 font-bold rounded-xl shadow-lg shadow-indigo-200 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white transition-all active:scale-[0.98]"
              data-testid="button-confirm-payment"
            >
              {loading
                ? "Memproses…"
                : !canPayActiveBill
                ? `Pilih item untuk Bill ${activeBill} dulu`
                : `Bayar Bill ${activeBill} · ${fmt(activeBillTotal)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogTitle className="sr-only">Pembayaran</DialogTitle>
      <DialogContent
        className="p-0 gap-0 w-full rounded-2xl overflow-hidden"
        hideCloseButton
        style={{
          maxWidth: isLandscape ? 640 : 400,
          maxHeight: isLandscape ? "95vh" : "92vh",
        }}
        data-testid="dialog-payment-method"
      >
        <button
          onClick={close}
          disabled={loading}
          className="absolute right-3 top-3 z-10 w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
        >
          <X size={14} className="text-slate-500" />
        </button>

        <div
          className={`flex overflow-hidden ${isLandscape ? "flex-row" : "flex-col overflow-y-auto"}`}
          style={{ maxHeight: isLandscape ? "95vh" : "92vh" }}
        >
          <LeftPanel />
          <ContentArea />
        </div>
      </DialogContent>
    </Dialog>
  );
}
