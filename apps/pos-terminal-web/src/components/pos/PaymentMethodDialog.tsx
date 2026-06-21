import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Banknote, Landmark, QrCode, Delete, X, Plus, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import type { PaymentMethod, CartItem } from "@/hooks/useCart";
import { getItemEffectiveTotal } from "@/hooks/useCart";
import type { POSPaymentFlow, POSPaymentKind } from "@pos/domain/payments";

type PaymentDetails = {
  flow: POSPaymentFlow;
  paymentKind?: POSPaymentKind;
  targetBillId?: string;
  lines: Array<{
    method: PaymentMethod;
    amount: number;
    receivedAmount?: number;
    splitId?: string;
    clientBillId?: string;
  }>;
  splits?: Array<{ id: string; label: string; splitNo: number; amountDue: number; amountPaid: number; status?: "UNPAID" | "PARTIAL" | "PAID" }>;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (method: PaymentMethod, cashReceived?: number, partialAmount?: number, paymentDetails?: PaymentDetails) => void;
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

const fmt = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
const fmtNum = (n: number) => new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0 }).format(n);

const NUMPAD = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "000", "0", "⌫"] as const;

type PaymentFlow = "FULL" | "DOWN_PAYMENT" | "MULTI_PAYMENT" | "SPLIT_BILL";

const METHODS: Array<{ id: PaymentMethod; label: string; Icon: typeof Banknote }> = [
  { id: "CASH", label: "Tunai", Icon: Banknote },
  { id: "MANUAL_TRANSFER", label: "Transfer Manual", Icon: Landmark },
  { id: "MANUAL_QRIS", label: "QRIS Manual", Icon: QrCode },
];

const BILL_COLORS = [
  { active: "bg-blue-600 text-white border-blue-600", inactive: "bg-white text-blue-600 border-blue-300", item: "bg-blue-600 text-white", total: "bg-blue-50 text-blue-700", shadow: "shadow-blue-200" },
  { active: "bg-violet-600 text-white border-violet-600", inactive: "bg-white text-violet-600 border-violet-300", item: "bg-violet-600 text-white", total: "bg-violet-50 text-violet-700", shadow: "shadow-violet-200" },
  { active: "bg-amber-500 text-white border-amber-500", inactive: "bg-white text-amber-600 border-amber-300", item: "bg-amber-500 text-white", total: "bg-amber-50 text-amber-700", shadow: "shadow-amber-200" },
  { active: "bg-rose-500 text-white border-rose-500", inactive: "bg-white text-rose-600 border-rose-300", item: "bg-rose-500 text-white", total: "bg-rose-50 text-rose-700", shadow: "shadow-rose-200" },
];

function useIsLandscape() {
  const [isLandscape, setIsLandscape] = useState(() => typeof window !== "undefined" && window.innerWidth > window.innerHeight && window.innerWidth < 1024);
  useEffect(() => {
    const check = () => setIsLandscape(window.innerWidth > window.innerHeight && window.innerWidth < 1024);
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
  defaultPaymentMethod = "CASH",
  allowPartial = false,
  allowMultiPayment = false,
  allowSplitBill = false,
  initialPartialMode = false,
}: Props) {
  const [method, setMethod] = useState<PaymentMethod>(defaultPaymentMethod);
  const [cashRaw, setCashRaw] = useState("");
  const [partialRaw, setPartialRaw] = useState("");
  const [flow, setFlow] = useState<PaymentFlow>(initialPartialMode ? "DOWN_PAYMENT" : "FULL");
  const [isProcessing, setIsProcessing] = useState(false);
  const [multiEntries, setMultiEntries] = useState<Array<{ id: number; method: PaymentMethod; amount: number }>>([]);
  const [multiRaw, setMultiRaw] = useState("");
  const [multiMethod, setMultiMethod] = useState<PaymentMethod>("CASH");
  const [splitBills, setSplitBills] = useState<string[]>(["A", "B"]);
  const [activeBill, setActiveBill] = useState("A");
  const [itemBillMap, setItemBillMap] = useState<Record<string, string | undefined>>({});
  const isLandscape = useIsLandscape();

  useEffect(() => {
    if (!open) return;
    setMethod(defaultPaymentMethod);
    setCashRaw("");
    setPartialRaw("");
    setFlow(initialPartialMode ? "DOWN_PAYMENT" : "FULL");
    setIsProcessing(false);
    setMultiEntries([]);
    setMultiRaw("");
    setMultiMethod("CASH");
    setSplitBills(["A", "B"]);
    setActiveBill("A");
    setItemBillMap({});
  }, [open, defaultPaymentMethod, initialPartialMode]);

  const loading = isProcessing || isSubmitting;
  const cashAmount = parseInt(cashRaw, 10) || 0;
  const change = cashAmount - cartTotal;
  const isEnough = method !== "CASH" || change >= 0;
  const partialAmount = parseInt(partialRaw, 10) || 0;
  const isValidPartial = partialAmount > 0 && partialAmount < cartTotal;
  const multiInputAmount = parseInt(multiRaw, 10) || 0;
  const multiPaid = multiEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const multiRemaining = Math.max(0, cartTotal - multiPaid);
  const multiCanAdd = multiEntries.length < 2 && multiInputAmount > 0 && multiInputAmount <= multiRemaining;
  const multiComplete = multiRemaining === 0;
  const getBillForItem = (itemId: string) => itemBillMap[itemId];
  const unassignedCount = cartItems.filter((item) => !getBillForItem(item.id)).length;
  const getBillTotal = (bill: string) => cartItems.reduce((sum, item) => getBillForItem(item.id) === bill ? sum + getItemEffectiveTotal(item) : sum, 0);
  const activeBillTotal = getBillTotal(activeBill);
  const canPayActiveBill = activeBillTotal > 0;
  const hasExtraFlows = allowPartial || allowMultiPayment || allowSplitBill;

  const selectMethod = (nextMethod: PaymentMethod) => {
    setMethod(nextMethod);
    onMethodChange?.(nextMethod);
  };

  const handleDigit = (key: string, raw: string, setRaw: (value: string) => void) => {
    if (key === "⌫") return setRaw(raw.slice(0, -1));
    const next = key === "000" ? (raw === "" ? "" : raw + "000") : raw + key;
    if (parseInt(next || "0", 10) <= 99_999_999) setRaw(next);
  };

  const handleItemTap = (itemId: string) => {
    setItemBillMap((prev) => {
      const next = { ...prev };
      if (next[itemId] === activeBill) delete next[itemId];
      else next[itemId] = activeBill;
      return next;
    });
  };

  const addBill = () => {
    if (splitBills.length >= 4) return;
    const next = String.fromCharCode(65 + splitBills.length);
    setSplitBills((prev) => [...prev, next]);
    setActiveBill(next);
  };

  const getItemLabel = (item: CartItem) => {
    const parts: string[] = [];
    if (item.variant?.name) parts.push(item.variant.name);
    if (item.selectedOptions?.length) parts.push(...item.selectedOptions.map((option) => option.option_name).filter(Boolean));
    return parts.length ? `${item.product.name} · ${parts.join(", ")}` : item.product.name;
  };

  const process = () => {
    if (loading) return;
    setIsProcessing(true);
    window.setTimeout(() => {
      setIsProcessing(false);
      if (flow === "DOWN_PAYMENT") {
        if (!isValidPartial) return;
        onConfirm(method, undefined, partialAmount, {
          flow: "DOWN_PAYMENT",
          paymentKind: "DOWN_PAYMENT",
          lines: [{ method, amount: partialAmount, receivedAmount: method === "CASH" ? partialAmount : undefined }],
        });
        return;
      }
      if (flow === "MULTI_PAYMENT") {
        if (!multiComplete) return;
        onConfirm(multiEntries[0]?.method ?? method, undefined, undefined, {
          flow: "MULTI_PAYMENT",
          paymentKind: "MULTI_PAYMENT_LINE",
          lines: multiEntries.map((entry) => ({ method: entry.method, amount: entry.amount })),
        });
        return;
      }
      if (flow === "SPLIT_BILL") {
        if (!canPayActiveBill) return;
        onConfirm(method, undefined, activeBillTotal, {
          flow: "SPLIT_BILL",
          paymentKind: "SPLIT_BILL_LINE",
          targetBillId: activeBill,
          lines: [{ method, amount: activeBillTotal, splitId: activeBill, clientBillId: activeBill }],
          splits: splitBills.map((bill, index) => ({ id: bill, label: `Bill ${bill}`, splitNo: index + 1, amountDue: getBillTotal(bill), amountPaid: 0, status: "UNPAID" })),
        });
        return;
      }
      if (method === "CASH" && !isEnough) return;
      onConfirm(method, method === "CASH" ? cashAmount || cartTotal : undefined, undefined, {
        flow: "FULL",
        paymentKind: "FULL_PAYMENT",
        lines: [{ method, amount: cartTotal, receivedAmount: method === "CASH" ? cashAmount || cartTotal : undefined }],
      });
    }, 250);
  };

  const close = () => {
    if (loading) return;
    setCashRaw("");
    setPartialRaw("");
    onClose();
  };

  const MethodButtons = ({ selected = method, onSelect = selectMethod, testIdPrefix = "payment" }: { selected?: PaymentMethod; onSelect?: (value: PaymentMethod) => void; testIdPrefix?: string }) => (
    <div className={`grid gap-2 ${isLandscape ? "grid-cols-1" : "grid-cols-3"}`} data-testid={`${testIdPrefix}-method-selector`}>
      {METHODS.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => onSelect(id)}
          className={`flex items-center gap-2 py-2.5 px-3 rounded-xl border-2 transition-all font-bold text-xs ${isLandscape ? "justify-start" : "flex-col justify-center"} ${selected === id ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200" : "bg-white border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-600"}`}
          data-testid={`${testIdPrefix}-payment-${id}`}
        >
          <Icon size={18} />
          {label}
        </button>
      ))}
    </div>
  );

  const Numpad = ({ raw, setRaw }: { raw: string; setRaw: (value: string) => void }) => (
    <div className="grid grid-cols-3 gap-1.5">
      {NUMPAD.map((key) => (
        <button key={key} onClick={() => handleDigit(key, raw, setRaw)} className="h-11 rounded-xl font-bold text-lg flex items-center justify-center transition-all active:scale-95 select-none border bg-white border-slate-200 text-slate-700 hover:bg-blue-50 hover:border-blue-300 shadow-sm">
          {key === "⌫" ? <Delete size={16} /> : key}
        </button>
      ))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogTitle className="sr-only">Pembayaran</DialogTitle>
      <DialogContent className="p-0 gap-0 w-full rounded-2xl overflow-hidden" hideCloseButton style={{ width: "min(94vw, 520px)", maxWidth: isLandscape ? 760 : 520, maxHeight: "92dvh" }} data-testid="dialog-payment-method">
        <button onClick={close} disabled={loading} className="absolute right-3 top-3 z-10 w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
          <X size={14} className="text-slate-500" />
        </button>

        <div className={`flex overflow-hidden ${isLandscape ? "flex-row" : "flex-col overflow-y-auto"}`} style={{ maxHeight: "92dvh" }}>
          <div className={`flex flex-col ${isLandscape ? "w-[190px] border-r border-slate-100 flex-shrink-0" : "w-full"}`}>
            <div className="px-4 pt-4 pb-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Pembayaran</p>
              <p className="text-xl font-black text-slate-900 tabular-nums leading-tight" data-testid="text-payment-total">{fmt(cartTotal)}</p>
            </div>
            {hasExtraFlows && (
              <div className="px-4 mb-3 flex gap-1.5 flex-wrap">
                {([
                  ["FULL", "Bayar Penuh"],
                  ...(allowPartial ? [["DOWN_PAYMENT", "DP"]] : []),
                  ...(allowMultiPayment ? [["MULTI_PAYMENT", "Multi"]] : []),
                  ...(allowSplitBill ? [["SPLIT_BILL", "Split"]] : []),
                ] as [PaymentFlow, string][]).map(([id, label]) => (
                  <button key={id} onClick={() => { setFlow(id); setCashRaw(""); setPartialRaw(""); }} className={`flex-1 text-xs font-bold py-1.5 px-2 rounded-lg transition-all ${flow === id ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`} data-testid={`button-payment-flow-${id}`}>{label}</button>
                ))}
              </div>
            )}
            {(flow === "FULL" || flow === "DOWN_PAYMENT") && <div className="px-4 mb-3"><MethodButtons testIdPrefix="global" /></div>}
          </div>

          <div className={`flex flex-col flex-1 min-h-0 ${isLandscape ? "overflow-y-auto" : ""}`}>
            {flow === "FULL" && (
              <div className="p-4 space-y-3">
                {method === "CASH" ? (
                  <>
                    <div className="bg-slate-50 border-2 border-blue-500 rounded-2xl px-4 py-2.5 flex items-center gap-2 min-h-[50px]"><span className="text-sm font-bold text-slate-400">Rp</span><span className="flex-1 text-xl font-black text-slate-800 tabular-nums">{cashRaw === "" ? <span className="text-slate-300">0</span> : fmtNum(cashAmount)}</span></div>
                    <div className="grid grid-cols-4 gap-1.5">{[{ l: "Pas", v: cartTotal }, { l: "50K", v: 50000 }, { l: "100K", v: 100000 }, { l: "200K", v: 200000 }].map((p) => <button key={p.l} onClick={() => setCashRaw(String(p.v))} className="py-1.5 text-xs font-bold bg-slate-100 hover:bg-blue-50 hover:text-blue-600 border border-transparent text-slate-500 rounded-lg">{p.l}</button>)}</div>
                    <Numpad raw={cashRaw} setRaw={setCashRaw} />
                    <div className={`rounded-xl px-3 py-2 text-center border ${isEnough ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}><p className="text-[9px] font-bold uppercase tracking-wider">{isEnough ? "Kembalian" : "Kurang"}</p><p className="text-sm font-black tabular-nums">{fmt(Math.abs(change))}</p></div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3 px-6 py-6">
                    {method === "MANUAL_QRIS" ? <QrCode size={96} className="text-slate-800" /> : <Landmark size={48} className="text-blue-600" />}
                    <p className="font-bold text-slate-800">{method === "MANUAL_QRIS" ? "QRIS Manual" : "Transfer Manual"}</p>
                    <p className="text-sm text-slate-400 text-center">Konfirmasi setelah pembayaran manual diterima.</p>
                  </div>
                )}
                <button onClick={process} disabled={loading || !isEnough} className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl font-bold shadow-lg shadow-blue-200" data-testid="button-confirm-payment">{loading ? "Memproses…" : "Bayar"}</button>
              </div>
            )}

            {flow === "DOWN_PAYMENT" && (
              <div className="p-4 space-y-3">
                <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl px-4 py-2.5 flex items-center gap-2 min-h-[50px]"><span className="text-sm font-bold text-amber-400">Rp</span><span className="flex-1 text-xl font-black text-slate-800 tabular-nums">{partialRaw === "" ? <span className="text-slate-300">0</span> : fmtNum(partialAmount)}</span></div>
                <div className="grid grid-cols-4 gap-1.5">{[{ l: "25%", v: Math.round(cartTotal * 0.25) }, { l: "50%", v: Math.round(cartTotal * 0.5) }, { l: "75%", v: Math.round(cartTotal * 0.75) }, { l: "Reset", v: 0 }].map((p) => <button key={p.l} onClick={() => setPartialRaw(p.v > 0 ? String(p.v) : "")} className="py-1.5 text-xs font-bold rounded-lg bg-slate-100 text-slate-500">{p.l}</button>)}</div>
                <Numpad raw={partialRaw} setRaw={setPartialRaw} />
                <div className="rounded-xl px-3 py-2 text-center border bg-amber-50 border-amber-200"><p className="text-[9px] font-bold uppercase tracking-wider text-amber-500">Sisa Tagihan</p><p className="text-sm font-black tabular-nums text-amber-700">{fmt(isValidPartial ? cartTotal - partialAmount : cartTotal)}</p></div>
                <button onClick={process} disabled={loading || !isValidPartial} className="w-full py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl font-bold">{loading ? "Memproses…" : partialAmount > 0 ? `DP ${fmt(partialAmount)}` : "Masukkan Jumlah"}</button>
              </div>
            )}

            {flow === "MULTI_PAYMENT" && (
              <div className="p-4 space-y-3">
                <div className="bg-teal-50 border border-teal-200 rounded-xl px-3 py-2 text-sm font-bold text-teal-700">Terbayar {fmt(multiPaid)} · Sisa {fmt(multiRemaining)}</div>
                {multiEntries.map((entry) => <div key={entry.id} className="flex items-center gap-2 rounded-xl px-3 py-2 bg-slate-50 border border-slate-200"><span className="text-xs font-bold flex-1">{METHODS.find((item) => item.id === entry.method)?.label}</span><span className="text-sm font-black">{fmt(entry.amount)}</span><button onClick={() => setMultiEntries((prev) => prev.filter((item) => item.id !== entry.id))} className="text-red-400"><Trash2 size={14} /></button></div>)}
                {!multiComplete && <><MethodButtons selected={multiMethod} onSelect={setMultiMethod} testIdPrefix="multi" /><div className="bg-slate-50 border-2 border-teal-400 rounded-2xl px-4 py-2 flex items-center gap-2"><span className="text-xs font-bold text-slate-400">Rp</span><span className="flex-1 text-lg font-black text-slate-800 tabular-nums">{multiRaw === "" ? <span className="text-slate-300">0</span> : fmtNum(multiInputAmount)}</span><button onClick={() => setMultiRaw(String(multiRemaining))} className="text-[10px] font-bold text-teal-600 bg-teal-50 border border-teal-200 px-2 py-1 rounded-lg">Sisa</button></div><Numpad raw={multiRaw} setRaw={setMultiRaw} /><button onClick={() => { if (!multiCanAdd) return; setMultiEntries((prev) => [...prev, { id: Date.now(), method: multiMethod, amount: multiInputAmount }]); setMultiRaw(""); }} disabled={!multiCanAdd} className="w-full py-2.5 rounded-xl bg-teal-500 hover:bg-teal-600 disabled:bg-slate-100 disabled:text-slate-400 text-white font-bold flex items-center justify-center gap-1.5"><Plus size={14} />Tambah {METHODS.find((item) => item.id === multiMethod)?.label}</button></>}
                {multiComplete && <><div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2"><CheckCircle2 size={14} className="text-green-500" /><p className="text-xs font-bold text-green-700">Semua pembayaran terpenuhi</p></div><button onClick={process} disabled={loading} className="w-full py-3 bg-green-500 hover:bg-green-600 disabled:bg-slate-200 text-white font-bold rounded-xl">{loading ? "Memproses…" : "Selesaikan Pembayaran"}</button></>}
              </div>
            )}

            {flow === "SPLIT_BILL" && (
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="px-4 pt-3 pb-2 border-b border-slate-100"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">1 · Pilih Bill Aktif</p><div className="flex gap-2 items-center">{splitBills.map((bill, idx) => { const colors = BILL_COLORS[idx % BILL_COLORS.length]; const isActive = activeBill === bill; const billTotal = getBillTotal(bill); return <button key={bill} onClick={() => setActiveBill(bill)} className={`flex-1 flex flex-col items-center py-2 px-1 rounded-xl border-2 transition-all font-black text-sm ${isActive ? `${colors.active} shadow-lg ${colors.shadow}` : colors.inactive}`}><span>Bill {bill}</span><span className="text-[10px] font-semibold mt-0.5 tabular-nums">{fmt(billTotal)}</span></button>; })}{splitBills.length < 4 && <button onClick={addBill} className="w-10 h-14 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 flex items-center justify-center"><Plus size={18} /></button>}</div></div>
                <div className="px-4 pt-2 pb-1"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">2 · Ketuk Item → Masuk ke Bill {activeBill}</p></div>
                <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-2 space-y-1.5" data-testid="split-item-assignment-list">{cartItems.map((item) => { const assignedBill = getBillForItem(item.id); const assignedIdx = assignedBill ? splitBills.indexOf(assignedBill) : -1; const assignedColors = assignedIdx >= 0 ? BILL_COLORS[assignedIdx % BILL_COLORS.length] : null; const isOnActiveBill = assignedBill === activeBill; return <button key={item.id} onClick={() => handleItemTap(item.id)} className={`w-full flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-all ${isOnActiveBill ? "border-blue-300 bg-blue-50" : assignedBill ? "border-slate-200 bg-white opacity-60" : "border-slate-200 bg-white hover:border-slate-300"}`}><div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black ${assignedColors ? assignedColors.item : "bg-slate-100 text-slate-300 border-2 border-dashed border-slate-200"}`}>{assignedBill || "?"}</div><div className="flex-1 min-w-0"><p className="text-xs font-bold text-slate-800 truncate">{getItemLabel(item)}</p><p className="text-[10px] text-slate-400 mt-0.5">{item.quantity}× · {fmt(getItemEffectiveTotal(item))}</p></div>{isOnActiveBill && <CheckCircle2 size={16} className="text-blue-500" />}</button>; })}</div>
                <div className="px-4 pb-4 pt-2 border-t border-slate-100 mt-auto"><div className="flex gap-2 mb-3">{splitBills.map((bill, idx) => { const colors = BILL_COLORS[idx % BILL_COLORS.length]; const total = getBillTotal(bill); const isActive = bill === activeBill; return <div key={bill} className={`flex-1 flex flex-col items-center py-1.5 rounded-lg border ${isActive ? `${colors.total} border-current font-black` : "bg-slate-50 border-slate-100 text-slate-500"}`}><span className="text-[10px] font-bold">Bill {bill}</span><span className="text-xs font-black tabular-nums">{fmt(total)}</span></div>; })}</div>{unassignedCount > 0 && <div className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-2.5 py-1.5 mb-2"><AlertCircle size={11} className="text-slate-400" /><p className="text-[10px] text-slate-400">{unassignedCount} item belum di-assign — akan tersisa untuk bill lain</p></div>}<MethodButtons testIdPrefix="split" /><button onClick={process} disabled={loading || !canPayActiveBill} className="w-full mt-3 py-3 font-bold rounded-xl shadow-lg shadow-indigo-200 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-200 disabled:text-slate-400 text-white" data-testid="button-confirm-payment">{loading ? "Memproses…" : !canPayActiveBill ? `Pilih item untuk Bill ${activeBill} dulu` : `Bayar Bill ${activeBill} · ${fmt(activeBillTotal)}`}</button></div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
