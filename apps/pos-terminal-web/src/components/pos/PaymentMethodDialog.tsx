import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Banknote, Landmark, QrCode, Delete, X, Plus, Trash2, CheckCircle2, AlertCircle, Minus } from "lucide-react";
import type { PaymentMethod, CartItem } from "@/hooks/useCart";
import { getItemLineSubtotal } from "@/hooks/useCart";
import type { POSPaymentFlow, POSPaymentKind } from "@pos/domain/payments";

export type ExistingSplitBillItem = { orderItemId: string; clientBillId: string; quantity: number; amount: number };
export type ExistingSplitBill = { id?: string; clientBillId: string; label: string; amountDue: number; amountPaid: number; status: "UNPAID" | "PARTIAL" | "PAID"; items?: ExistingSplitBillItem[] };

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
    orderBillSplitId?: string;
  }>;
  splits?: Array<{ id: string; label: string; splitNo: number; amountDue: number; amountPaid: number; status?: "UNPAID" | "PARTIAL" | "PAID"; orderBillSplitId?: string; items?: Array<{ orderItemId?: string; clientItemId?: string; quantity: number; amount: number }> }>;
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
  existingSplitBills?: ExistingSplitBill[];
};

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
const fmtNum = (n: number) =>
  new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0 }).format(n);

const NUMPAD = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "000", "0", "⌫"] as const;

type PaymentFlow = "FULL" | "DOWN_PAYMENT" | "MULTI_PAYMENT" | "SPLIT_BILL";

const METHODS: Array<{ id: PaymentMethod; label: string; Icon: typeof Banknote }> = [
  { id: "CASH", label: "Tunai", Icon: Banknote },
  { id: "MANUAL_TRANSFER", label: "Transfer", Icon: Landmark },
  { id: "MANUAL_QRIS", label: "QRIS", Icon: QrCode },
];

const BILL_COLORS = [
  { active: "bg-blue-600 text-white border-blue-600", inactive: "bg-white text-blue-600 border-blue-300", item: "bg-blue-600 text-white", total: "bg-blue-50 text-blue-700", shadow: "shadow-blue-200" },
  { active: "bg-violet-600 text-white border-violet-600", inactive: "bg-white text-violet-600 border-violet-300", item: "bg-violet-600 text-white", total: "bg-violet-50 text-violet-700", shadow: "shadow-violet-200" },
  { active: "bg-amber-500 text-white border-amber-500", inactive: "bg-white text-amber-600 border-amber-300", item: "bg-amber-500 text-white", total: "bg-amber-50 text-amber-700", shadow: "shadow-amber-200" },
  { active: "bg-rose-500 text-white border-rose-500", inactive: "bg-white text-rose-600 border-rose-300", item: "bg-rose-500 text-white", total: "bg-rose-50 text-rose-700", shadow: "shadow-rose-200" },
];

/**
 * useIsWide — true when viewport is wide enough for two-column layout.
 * Activates at ≥580px to cover tablets and landscape mobile.
 * Does NOT exclude tablets (old code used < 1024 which excluded tablets).
 */
function useIsWide() {
  const [isWide, setIsWide] = useState(() => typeof window !== "undefined" && window.innerWidth >= 580);
  useEffect(() => {
    const check = () => setIsWide(window.innerWidth >= 580);
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);
  return isWide;
}

/**
 * MethodSelector — compact left-rail payment method selector.
 * One column, 44-52px buttons, left-aligned icon+label.
 */
function MethodSelector({
  selected,
  onChange,
  title,
  testIdPrefix,
}: {
  selected: PaymentMethod;
  onChange: (m: PaymentMethod) => void;
  title?: string;
  testIdPrefix: string;
}) {
  return (
    <div>
      {title && (
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 px-1">{title}</p>
      )}
      <div className="flex flex-wrap gap-2" data-testid={`${testIdPrefix}-method-selector`}>
        {METHODS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`flex items-center gap-1.5 py-2 px-3 rounded-xl border-2 transition-all font-bold text-xs ${
              selected === id
                ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-200"
                : "bg-white border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-600"
            }`}
            data-testid={`${testIdPrefix}-payment-${id}`}
          >
            <Icon size={14} className="shrink-0" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Numpad({ raw, setRaw }: { raw: string; setRaw: (value: string) => void }) {
  const handleDigit = (key: string) => {
    if (key === "⌫") return setRaw(raw.slice(0, -1));
    const next = key === "000" ? (raw === "" ? "" : raw + "000") : raw + key;
    if (parseInt(next || "0", 10) <= 99_999_999) setRaw(next);
  };
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {NUMPAD.map((key) => (
        <button
          key={key}
          onClick={() => handleDigit(key)}
          className="h-10 rounded-xl font-bold text-base flex items-center justify-center transition-all active:scale-95 select-none border bg-white border-slate-200 text-slate-700 hover:bg-blue-50 hover:border-blue-300 shadow-sm"
        >
          {key === "⌫" ? <Delete size={15} /> : key}
        </button>
      ))}
    </div>
  );
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
  existingSplitBills = [],
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
  const [splitItemQuantityMap, setSplitItemQuantityMap] = useState<Record<string, Record<string, number>>>({});
  const [persistedSplitBills, setPersistedSplitBills] = useState<Record<string, ExistingSplitBill>>({});
  const isWide = useIsWide();

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
    const normalizedExisting = existingSplitBills
      .filter((bill) => bill.clientBillId)
      .map((bill) => ({ ...bill, status: bill.status ?? (bill.amountPaid >= bill.amountDue ? "PAID" : bill.amountPaid > 0 ? "PARTIAL" : "UNPAID") }))
      .sort((a: any, b: any) => Number(a.splitNo ?? 99) - Number(b.splitNo ?? 99));
    if (normalizedExisting.length > 0) {
      const persisted = Object.fromEntries(normalizedExisting.map((bill) => [bill.clientBillId, bill]));
      const baseIds = Array.from(new Set([...normalizedExisting.map((bill) => bill.clientBillId), "A", "B"]));
      const activePersisted = normalizedExisting.find((bill) => bill.status !== "PAID")?.clientBillId;
      const firstEditableId = baseIds.find((id) => persisted[id]?.status !== "PAID" || !persisted[id]);
      const allPersistedPaid = normalizedExisting.every((bill) => bill.status === "PAID");
      const nextUnpaidId = allPersistedPaid && cartTotal > 0
        ? String.fromCharCode(65 + Math.min(baseIds.length, 3))
        : undefined;
      const ids = Array.from(new Set([...baseIds, ...(nextUnpaidId ? [nextUnpaidId] : [])])).slice(0, 4);
      const persistedQuantityMap: Record<string, Record<string, number>> = {};
      normalizedExisting.forEach((bill) => bill.items?.forEach((item) => {
        if (!persistedQuantityMap[item.orderItemId]) persistedQuantityMap[item.orderItemId] = {};
        persistedQuantityMap[item.orderItemId][bill.clientBillId] = Number(item.quantity || 0);
      }));
      setSplitBills(ids);
      setPersistedSplitBills(persisted);
      setSplitItemQuantityMap(persistedQuantityMap);
      setActiveBill(activePersisted ?? nextUnpaidId ?? firstEditableId ?? "B");
    } else {
      setSplitBills(["A", "B"]);
      setActiveBill("A");
      setPersistedSplitBills({});
      setSplitItemQuantityMap({});
    }
  }, [open, defaultPaymentMethod, initialPartialMode, existingSplitBills, cartTotal]);

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
  const getDialogItemTotal = (item: CartItem) => Number((item as any).itemSubtotal ?? (item as any).item_subtotal ?? getItemLineSubtotal(item));
  const getPersistedBill = (bill: string) => persistedSplitBills[bill];
  const isBillLocked = (bill: string) => getPersistedBill(bill)?.status === "PAID";
  const getOrderItemId = (item: CartItem) => String((item as any).id ?? (item as any).orderItemId ?? (item as any).order_item_id);
  const getItemQuantity = (item: CartItem) => Math.max(1, Number((item as any).quantity ?? 1));
  const getAssignedQty = (itemId: string, bill: string) => Number(splitItemQuantityMap[itemId]?.[bill] ?? 0);
  const getAssignedQtyForItem = (itemId: string) => Object.values(splitItemQuantityMap[itemId] ?? {}).reduce((sum, qty) => sum + Number(qty || 0), 0);
  const getLockedQtyForItem = (itemId: string) => Object.entries(splitItemQuantityMap[itemId] ?? {}).reduce((sum, [bill, qty]) => sum + (isBillLocked(bill) ? Number(qty || 0) : 0), 0);
  const getDisplayBillForItem = (itemId: string) => Object.entries(splitItemQuantityMap[itemId] ?? {}).find(([, qty]) => Number(qty || 0) > 0)?.[0];
  const unassignedCount = cartItems.filter((item) => getAssignedQtyForItem(getOrderItemId(item)) < getItemQuantity(item)).length;
  const getItemUnitAmount = (item: CartItem) => getDialogItemTotal(item) / getItemQuantity(item);
  const getBillTotal = (bill: string) => {
    const total = cartItems.reduce((sum, item) => sum + getItemUnitAmount(item) * getAssignedQty(getOrderItemId(item), bill), 0);
    return total > 0 ? Math.round(total * 100) / 100 : (getPersistedBill(bill)?.amountDue ?? 0);
  };
  const activeBillTotal = getBillTotal(activeBill);
  const canPayActiveBill = activeBillTotal > 0 && !isBillLocked(activeBill);
  const hasExtraFlows = allowPartial || allowMultiPayment || allowSplitBill;

  const selectMethod = (nextMethod: PaymentMethod) => {
    setMethod(nextMethod);
    onMethodChange?.(nextMethod);
  };

  const getItemLabel = (item: CartItem) => {
    const raw = item as any;
    const productName = item.product?.name ?? raw.productName ?? raw.product_name ?? raw.name ?? "Produk";
    const parts: string[] = [];
    if (item.variant?.name ?? raw.variantName ?? raw.variant_name) parts.push(item.variant?.name ?? raw.variantName ?? raw.variant_name);
    if (item.selectedOptions?.length)
      parts.push(...item.selectedOptions.map((option) => option.option_name).filter(Boolean));
    return parts.length ? `${productName} · ${parts.join(", ")}` : productName;
  };

  const setItemBillQuantity = (item: CartItem, bill: string, nextQty: number) => {
    if (isBillLocked(bill)) return;
    const itemId = getOrderItemId(item);
    const itemQty = getItemQuantity(item);
    const lockedQty = getLockedQtyForItem(itemId);
    const otherEditableQty = Object.entries(splitItemQuantityMap[itemId] ?? {}).reduce(
      (sum, [currentBill, qty]) => sum + (currentBill !== bill && !isBillLocked(currentBill) ? Number(qty || 0) : 0),
      0,
    );
    const maxQty = Math.max(0, itemQty - lockedQty - otherEditableQty);
    const normalizedQty = Math.max(0, Math.min(maxQty, Math.floor(nextQty)));
    setSplitItemQuantityMap((prev) => {
      const byBill = { ...(prev[itemId] ?? {}) };
      if (normalizedQty <= 0) delete byBill[bill];
      else byBill[bill] = normalizedQty;
      const next = { ...prev };
      if (Object.keys(byBill).length === 0) delete next[itemId];
      else next[itemId] = byBill;
      return next;
    });
  };

  const handleItemTap = (item: CartItem) => {
    if (isBillLocked(activeBill)) return;
    const itemId = getOrderItemId(item);
    const currentQty = getAssignedQty(itemId, activeBill);
    if (currentQty > 0) {
      setItemBillQuantity(item, activeBill, 0);
      return;
    }
    const remainingQty = Math.max(0, getItemQuantity(item) - getAssignedQtyForItem(itemId));
    if (remainingQty > 0) setItemBillQuantity(item, activeBill, remainingQty);
  };

  const addBill = () => {
    if (splitBills.length >= 4) return;
    const next = String.fromCharCode(65 + splitBills.length);
    setSplitBills((prev) => [...prev, next]);
    setActiveBill(next);
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
        // Only send splits with amountDue > 0.
        // Placeholder bills with zero items must not be sent — backend splitSchema
        // enforces the selected-bill amount invariant, and zero-amount non-selected
        // bills provide no information that the backend needs.
        const nonZeroSplits = splitBills
          .map((bill, index) => {
            const persisted = getPersistedBill(bill);
            return {
              id: bill,
              label: persisted?.label ?? `Bill ${bill}`,
              splitNo: index + 1,
              orderBillSplitId: persisted?.id,
              amountDue: getBillTotal(bill),
              amountPaid: persisted?.amountPaid ?? 0,
              status: persisted?.status ?? "UNPAID" as const,
              items: cartItems
                .filter((item) => getAssignedQty(getOrderItemId(item), bill) > 0)
                .map((item) => {
                  const quantity = getAssignedQty(getOrderItemId(item), bill);
                  return { orderItemId: getOrderItemId(item), clientItemId: getOrderItemId(item), quantity, amount: Math.round(getItemUnitAmount(item) * quantity * 100) / 100 };
                }),
            };
          })
          .filter((split) => split.amountDue > 0);
        onConfirm(method, undefined, activeBillTotal, {
          flow: "SPLIT_BILL",
          paymentKind: "SPLIT_BILL_LINE",
          targetBillId: activeBill,
          lines: [{ method, amount: activeBillTotal, clientBillId: activeBill, orderBillSplitId: getPersistedBill(activeBill)?.id }],
          splits: nonZeroSplits,
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

  /* ── Left panel method selector — one selector for all flows ── */
  const leftMethodSelector = (() => {
    if (flow === "MULTI_PAYMENT") {
      return (
        <MethodSelector
          selected={multiMethod}
          onChange={setMultiMethod}
          title="Metode Baris Berikutnya"
          testIdPrefix="multi"
        />
      );
    }
    if (flow === "SPLIT_BILL") {
      return (
        <MethodSelector
          selected={method}
          onChange={selectMethod}
          title="Metode Bayar Bill Aktif"
          testIdPrefix="split"
        />
      );
    }
    /* FULL and DOWN_PAYMENT */
    return (
      <MethodSelector
        selected={method}
        onChange={selectMethod}
        testIdPrefix="global"
      />
    );
  })();

  /* ── Right panel content per flow ── */
  const rightPanel = (() => {
    /* FULL */
    if (flow === "FULL") {
      return (
        <div className="p-4 flex flex-col gap-3">
          {method === "CASH" ? (
            <>
              <div className="bg-slate-50 border-2 border-blue-500 rounded-2xl px-4 py-2.5 flex items-center gap-2 min-h-[50px]">
                <span className="text-sm font-bold text-slate-400">Rp</span>
                <span className="flex-1 text-xl font-black text-slate-800 tabular-nums">
                  {cashRaw === "" ? <span className="text-slate-300">0</span> : fmtNum(cashAmount)}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[{ l: "Pas", v: cartTotal }, { l: "50K", v: 50000 }, { l: "100K", v: 100000 }, { l: "200K", v: 200000 }].map((p) => (
                  <button
                    key={p.l}
                    onClick={() => setCashRaw(String(p.v))}
                    className="py-1.5 text-xs font-bold bg-slate-100 hover:bg-blue-50 hover:text-blue-600 border border-transparent text-slate-500 rounded-lg"
                  >
                    {p.l}
                  </button>
                ))}
              </div>
              <Numpad raw={cashRaw} setRaw={setCashRaw} />
              <div className={`rounded-xl px-3 py-2 text-center border ${isEnough ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                <p className="text-[9px] font-bold uppercase tracking-wider">{isEnough ? "Kembalian" : "Kurang"}</p>
                <p className="text-sm font-black tabular-nums">{fmt(Math.abs(change))}</p>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-8">
              {method === "MANUAL_QRIS" ? (
                <QrCode size={80} className="text-slate-800" />
              ) : (
                <Landmark size={48} className="text-blue-600" />
              )}
              <p className="font-bold text-slate-800">
                {method === "MANUAL_QRIS" ? "QRIS Manual" : "Transfer Manual"}
              </p>
              <p className="text-sm text-slate-400 text-center">
                Konfirmasi setelah pembayaran manual diterima.
              </p>
            </div>
          )}
          <button
            onClick={process}
            disabled={loading || !isEnough}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl font-bold shadow-lg shadow-blue-200"
            data-testid="button-confirm-payment"
          >
            {loading ? "Memproses…" : "Bayar"}
          </button>
        </div>
      );
    }

    /* DOWN_PAYMENT */
    if (flow === "DOWN_PAYMENT") {
      return (
        <div className="p-4 flex flex-col gap-3">
          <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl px-4 py-2.5 flex items-center gap-2 min-h-[50px]">
            <span className="text-sm font-bold text-amber-400">Rp</span>
            <span className="flex-1 text-xl font-black text-slate-800 tabular-nums">
              {partialRaw === "" ? <span className="text-slate-300">0</span> : fmtNum(partialAmount)}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { l: "25%", v: Math.round(cartTotal * 0.25) },
              { l: "50%", v: Math.round(cartTotal * 0.5) },
              { l: "75%", v: Math.round(cartTotal * 0.75) },
              { l: "Reset", v: 0 },
            ].map((p) => (
              <button
                key={p.l}
                onClick={() => setPartialRaw(p.v > 0 ? String(p.v) : "")}
                className="py-1.5 text-xs font-bold rounded-lg bg-slate-100 text-slate-500 hover:bg-amber-50 hover:text-amber-600"
              >
                {p.l}
              </button>
            ))}
          </div>
          <Numpad raw={partialRaw} setRaw={setPartialRaw} />
          <div className="rounded-xl px-3 py-2 text-center border bg-amber-50 border-amber-200">
            <p className="text-[9px] font-bold uppercase tracking-wider text-amber-500">Sisa Tagihan</p>
            <p className="text-sm font-black tabular-nums text-amber-700">
              {fmt(isValidPartial ? cartTotal - partialAmount : cartTotal)}
            </p>
          </div>
          <button
            onClick={process}
            disabled={loading || !isValidPartial}
            className="w-full py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl font-bold"
            data-testid="button-confirm-payment"
          >
            {loading ? "Memproses…" : partialAmount > 0 ? `DP ${fmt(partialAmount)}` : "Masukkan Jumlah"}
          </button>
        </div>
      );
    }

    /* MULTI_PAYMENT — no method selector here; method is in the left panel */
    if (flow === "MULTI_PAYMENT") {
      return (
        <div className="p-4 flex flex-col gap-3 flex-1 min-h-0">
          {/* Status bar */}
          <div className="bg-teal-50 border border-teal-200 rounded-xl px-3 py-2 text-sm font-bold text-teal-700">
            Dimasukkan {fmt(multiPaid)} · Kurang {fmt(multiRemaining)}
          </div>

          {/* Added lines */}
          {multiEntries.map((entry) => (
            <div key={entry.id} className="flex items-center gap-2 rounded-xl px-3 py-2 bg-slate-50 border border-slate-200">
              <span className="text-xs font-bold flex-1">{METHODS.find((m) => m.id === entry.method)?.label}</span>
              <span className="text-sm font-black tabular-nums">{fmt(entry.amount)}</span>
              <button
                onClick={() => setMultiEntries((prev) => prev.filter((m) => m.id !== entry.id))}
                className="text-red-400 hover:text-red-600 p-0.5"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          {/* Amount input + numpad + add button — only when not complete */}
          {!multiComplete && (
            <>
              <div className="bg-slate-50 border-2 border-teal-400 rounded-2xl px-4 py-2 flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400">Rp</span>
                <span className="flex-1 text-lg font-black text-slate-800 tabular-nums">
                  {multiRaw === "" ? <span className="text-slate-300">0</span> : fmtNum(multiInputAmount)}
                </span>
                <button
                  onClick={() => setMultiRaw(String(multiRemaining))}
                  className="text-[10px] font-bold text-teal-600 bg-teal-50 border border-teal-200 px-2 py-1 rounded-lg hover:bg-teal-100"
                >
                  Sisa
                </button>
              </div>
              <Numpad raw={multiRaw} setRaw={setMultiRaw} />
              <button
                onClick={() => {
                  if (!multiCanAdd) return;
                  setMultiEntries((prev) => [...prev, { id: Date.now(), method: multiMethod, amount: multiInputAmount }]);
                  setMultiRaw("");
                }}
                disabled={!multiCanAdd}
                className="w-full py-2.5 rounded-xl bg-teal-500 hover:bg-teal-600 disabled:bg-slate-100 disabled:text-slate-400 text-white font-bold flex items-center justify-center gap-1.5"
                data-testid="button-multi-add-line"
              >
                <Plus size={14} />
                Tambah {METHODS.find((m) => m.id === multiMethod)?.label}
              </button>
            </>
          )}

          {/* Final confirm — only when remaining is zero */}
          {multiComplete && (
            <>
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                <p className="text-xs font-bold text-green-700">Siap dikonfirmasi — klik untuk menyimpan pembayaran</p>
              </div>
              <button
                onClick={process}
                disabled={loading}
                className="w-full py-3 bg-green-500 hover:bg-green-600 disabled:bg-slate-200 text-white font-bold rounded-xl"
                data-testid="button-confirm-payment"
              >
                {loading ? "Memproses…" : "Selesaikan Pembayaran"}
              </button>
            </>
          )}
        </div>
      );
    }

    /* SPLIT_BILL — bill tabs once, item list, compact footer; no method selector here */
    if (flow === "SPLIT_BILL") {
      return (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Bill tabs — single source of truth for bill identity + totals */}
          <div className="px-4 pt-3 pb-2 border-b border-slate-100">
            <div className="flex gap-2 items-center">
              {splitBills.map((bill, idx) => {
                const colors = BILL_COLORS[idx % BILL_COLORS.length];
                const isActive = activeBill === bill;
                const billTotal = getBillTotal(bill);
                const locked = isBillLocked(bill);
                const persisted = getPersistedBill(bill);
                return (
                  <button
                    key={bill}
                    onClick={() => { if (!locked) setActiveBill(bill); }}
                    disabled={locked}
                    className={`flex-1 flex flex-col items-center py-2 px-1 rounded-xl border-2 transition-all font-black text-sm ${locked ? "bg-green-50 text-green-700 border-green-300 cursor-not-allowed" : isActive ? `${colors.active} shadow-md ${colors.shadow}` : colors.inactive}`}
                    data-testid={`button-split-bill-${bill}`}
                  >
                    <span>{persisted?.label ?? `Bill ${bill}`}</span>
                    <span className="text-[10px] font-semibold mt-0.5 tabular-nums">{fmt(billTotal)}</span>
                    {locked && <span className="text-[9px] font-black uppercase mt-0.5">Lunas</span>}
                  </button>
                );
              })}
              {splitBills.length < 4 && (
                <button
                  onClick={addBill}
                  className="w-10 h-14 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 flex items-center justify-center hover:border-slate-400 hover:text-slate-500 shrink-0"
                >
                  <Plus size={18} />
                </button>
              )}
            </div>
          </div>

          {/* Item instruction label */}
          <div className="px-4 pt-2 pb-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {isBillLocked(activeBill) ? `Bill ${activeBill} sudah lunas` : `Ketuk item → Bill ${activeBill}`}
            </p>
          </div>

          {/* Item assignment list — must always have visible height, scrollable */}
          <div
            className="flex-1 min-h-0 overflow-y-auto px-4 pb-2 space-y-1.5"
            data-testid="split-item-assignment-list"
          >
            {cartItems.map((item) => {
              const itemId = getOrderItemId(item);
              const assignedBill = getDisplayBillForItem(itemId);
              const activeQty = getAssignedQty(itemId, activeBill);
              const totalAssignedQty = getAssignedQtyForItem(itemId);
              const lockedQty = getLockedQtyForItem(itemId);
              const remainingQty = Math.max(0, getItemQuantity(item) - totalAssignedQty);
              const assignedIdx = assignedBill ? splitBills.indexOf(assignedBill) : -1;
              const assignedColors = assignedIdx >= 0 ? BILL_COLORS[assignedIdx % BILL_COLORS.length] : null;
              const isOnActiveBill = activeQty > 0;
              const itemLocked = lockedQty >= getItemQuantity(item);
              return (
                <button
                  key={item.id}
                  onClick={() => handleItemTap(item)}
                  className={`w-full flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-all ${
                    itemLocked
                      ? "border-green-200 bg-green-50 opacity-75 cursor-not-allowed"
                      : isOnActiveBill
                      ? "border-blue-300 bg-blue-50"
                      : assignedBill
                        ? "border-slate-200 bg-white opacity-60"
                        : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                  disabled={itemLocked}
                  data-testid={`button-split-item-${item.id}`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                      assignedColors
                        ? assignedColors.item
                        : "bg-slate-100 text-slate-300 border-2 border-dashed border-slate-200"
                    }`}
                  >
                    {activeQty > 0 ? activeQty : assignedBill || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{getItemLabel(item)}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {getItemQuantity(item)}× · {fmt(getDialogItemTotal(item))}
                    </p>
                  </div>
                  {itemLocked ? <span className="text-[10px] font-black text-green-700">Lunas</span> : (
                    <div className="flex items-center gap-1 shrink-0" onClick={(event) => event.stopPropagation()}>
                      {activeQty > 0 && <button type="button" onClick={() => setItemBillQuantity(item, activeBill, activeQty - 1)} className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center"><Minus size={12} /></button>}
                      <span className="min-w-10 text-center text-[10px] font-black text-slate-600">{activeQty > 0 ? `${activeQty}/${getItemQuantity(item)}` : remainingQty > 0 ? `Sisa ${remainingQty}` : "Penuh"}</span>
                      {remainingQty > 0 && <button type="button" onClick={() => setItemBillQuantity(item, activeBill, activeQty + 1)} className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><Plus size={12} /></button>}
                      {isOnActiveBill && <CheckCircle2 size={16} className="text-blue-500" />}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer: compact action only — NO duplicate bill total cards */}
          <div className="px-4 pb-4 pt-2 border-t border-slate-100">
            {unassignedCount > 0 && (
              <div className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-2.5 py-1.5 mb-2">
                <AlertCircle size={11} className="text-slate-400 shrink-0" />
                <p className="text-[10px] text-slate-400">
                  {unassignedCount} item masih punya qty belum di-assign
                </p>
              </div>
            )}
            <button
              onClick={process}
              disabled={loading || !canPayActiveBill}
              className="w-full py-3 font-bold rounded-xl shadow-lg shadow-indigo-200 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-200 disabled:text-slate-400 text-white"
              data-testid="button-confirm-payment"
            >
              {loading
                ? "Memproses…"
                : !canPayActiveBill
                  ? isBillLocked(activeBill)
                    ? "Bill sudah lunas"
                    : unassignedCount === 0 ? "Semua item sudah dibayar" : `Pilih item untuk Bill ${activeBill} dulu`
                  : `Bayar Bill ${activeBill} · ${fmt(activeBillTotal)}`}
            </button>
          </div>
        </div>
      );
    }

    return null;
  })();

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogTitle className="sr-only">Pembayaran</DialogTitle>
      <DialogContent
        className="p-0 gap-0 w-full rounded-2xl overflow-hidden"
        hideCloseButton
        style={{ width: "min(94vw, 900px)", maxHeight: "92dvh" }}
        data-testid="dialog-payment-method"
      >
        {/* Close button — always reachable */}
        <button
          onClick={close}
          disabled={loading}
          className="absolute right-3 top-3 z-20 w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
          data-testid="button-close-payment-dialog"
        >
          <X size={14} className="text-slate-500" />
        </button>

        {/*
          Two-zone layout:
          - Wide (≥580px): flex-row with fixed left panel + flex-1 right panel
          - Narrow (<580px): flex-col with scroll
        */}
        <div
          className={`flex overflow-hidden ${isWide ? "flex-row" : "flex-col overflow-y-auto"}`}
          style={{ maxHeight: "92dvh" }}
        >
          {/* ── LEFT CONTROL PANEL ── */}
          <div
            className={`flex flex-col flex-shrink-0 ${
              isWide
                ? "w-[240px] border-r border-slate-100 overflow-y-auto"
                : "w-full border-b border-slate-100"
            }`}
          >
            {/* Title + total */}
            <div className="px-4 pt-4 pb-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Pembayaran</p>
              <p className="text-2xl font-black text-slate-900 tabular-nums leading-tight" data-testid="text-payment-total">
                {fmt(cartTotal)}
              </p>
            </div>

            {/* Flow tabs */}
            {hasExtraFlows && (
              <div className="px-4 mb-3 flex gap-1.5 flex-wrap">
                {(
                  [
                    ["FULL", "Bayar Penuh"],
                    ...(allowPartial ? [["DOWN_PAYMENT", "DP"]] : []),
                    ...(allowMultiPayment ? [["MULTI_PAYMENT", "Multi"]] : []),
                    ...(allowSplitBill ? [["SPLIT_BILL", "Split"]] : []),
                  ] as [PaymentFlow, string][]
                ).map(([id, label]) => (
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

            {/* Method selector — always in left panel for every flow */}
            <div className="px-4 pb-4">{leftMethodSelector}</div>
          </div>

          {/* ── RIGHT WORK PANEL ── */}
          <div
            className={`flex flex-col flex-1 min-h-0 min-w-0 ${
              isWide ? "overflow-y-auto" : ""
            }`}
          >
            {rightPanel}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
