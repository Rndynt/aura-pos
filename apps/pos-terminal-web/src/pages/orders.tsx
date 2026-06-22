import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useOrder, useOrders, useOrderTypes, useRecordPayment } from "@/lib/api/hooks";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PaymentMethodDialog } from "@/components/pos/PaymentMethodDialog";
import { useToast } from "@/hooks/use-toast";
import { UnifiedBottomNav } from "@/components/navigation/UnifiedBottomNav";
import {
  X,
  Search,
  ArrowLeft,
  ShoppingBag,
  Printer,
  Receipt,
  Clock,
  CheckCircle2,
  Package,
} from "lucide-react";
import type { POSPaymentMethod } from "@pos/domain/payments";
import type { PaymentMethod } from "@/hooks/useCart";
import {
  enqueuePrintJob,
  markPrinting,
  markPrinted,
  markPrintFailed,
  getOrCreateTerminalIdentity,
} from "@pos/offline";
import { bluetoothReceiptPrinter } from "@/lib/receiptPrinter";
import { getActiveTenantId } from "@/lib/tenant";
import { useTenantProfile } from "@/hooks/api/useTenantProfile";

type OrderStatusFilter = "all" | "draft" | "confirmed" | "preparing" | "ready" | "served" | "completed";

type NormalizedOrderItem = {
  id: string;
  product_name: string;
  quantity: number;
  item_subtotal: number;
  base_price?: number;
  variant_name?: string | null;
  notes?: string | null;
  selected_options?: Array<{ option_name?: string; group_name?: string; price_delta?: number; [key: string]: any }>;
};

type NormalizedOrder = {
  id: string;
  tenant_id: string;
  order_type_id?: string | null;
  order_number: string;
  status: string;
  payment_status: "unpaid" | "partial" | "paid" | string;
  customer_name?: string | null;
  table_number?: string | null;
  created_at?: Date;
  updated_at?: Date;
  completed_at?: Date;
  subtotal: number;
  tax_amount: number;
  service_charge_amount: number;
  discount_amount: number;
  total_amount: number;
  paid_amount: number;
  items: NormalizedOrderItem[];
  payments?: any[];
};

type OrderTypeSummary = { id: string; name: string };

const STATUS_CFG: Record<string, { label: string; badge: string; dot: string }> = {
  draft: { label: "Ditunda", badge: "bg-slate-100 text-slate-600", dot: "bg-slate-300" },
  confirmed: { label: "Dikonfirmasi", badge: "bg-blue-100 text-blue-700", dot: "bg-blue-400" },
  preparing: { label: "Diproses", badge: "bg-orange-100 text-orange-700", dot: "bg-orange-400" },
  ready: { label: "Siap Saji", badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-400" },
  served: { label: "Disajikan", badge: "bg-teal-100 text-teal-700", dot: "bg-teal-400" },
  completed: { label: "Selesai", badge: "bg-green-100 text-green-700", dot: "bg-green-400" },
  cancelled: { label: "Dibatalkan", badge: "bg-red-100 text-red-700", dot: "bg-red-400" },
};

const PAYMENT_CFG: Record<string, { label: string; badge: string }> = {
  paid: { label: "Lunas", badge: "bg-emerald-100 text-emerald-700" },
  partial: { label: "Sebagian", badge: "bg-amber-100 text-amber-700" },
  unpaid: { label: "Belum Bayar", badge: "bg-slate-100 text-slate-500" },
};

const FILTER_TABS: { id: OrderStatusFilter; label: string }[] = [
  { id: "all", label: "Semua" },
  { id: "draft", label: "Ditunda" },
  { id: "confirmed", label: "Dikonfirmasi" },
  { id: "preparing", label: "Diproses" },
  { id: "ready", label: "Siap Saji" },
  { id: "served", label: "Disajikan" },
  { id: "completed", label: "Selesai" },
];

const money = (value: unknown) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const formatPrice = (price: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(price);

const formatDateTime = (date: Date | string | undefined | null) => {
  if (!date) return "-";
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
};

const formatTime = (date: Date | string | undefined | null) => {
  if (!date) return "-";
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return "-";
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
};

function paymentKindLabel(kind: unknown): string | null {
  const k = String(kind ?? "").toUpperCase();
  if (k === "FULL_PAYMENT") return "Bayar Penuh";
  if (k === "DOWN_PAYMENT") return "DP";
  if (k === "REMAINING_PAYMENT") return "Pelunasan";
  if (k === "MULTI_PAYMENT_LINE") return "Multi";
  if (k === "SPLIT_BILL_LINE") return "Split Bill";
  return null;
}

function toPOSPaymentMethod(value: unknown): POSPaymentMethod {
  if (value === "CASH") return "CASH";
  if (value === "MANUAL_TRANSFER") return "MANUAL_TRANSFER";
  if (value === "MANUAL_QRIS") return "MANUAL_QRIS";
  return "CASH";
}

function paymentMethodLabel(method: unknown): string {
  const normalized = toPOSPaymentMethod(method);
  if (normalized === "CASH") return "Tunai";
  if (normalized === "MANUAL_TRANSFER") return "Transfer Manual";
  return "QRIS Manual";
}

function normalizeOrderItem(item: any): NormalizedOrderItem {
  return {
    id: item?.id || crypto.randomUUID(),
    product_name: item?.product_name || item?.productName || "Item",
    quantity: money(item?.quantity),
    item_subtotal: money(item?.item_subtotal ?? item?.itemSubtotal),
    base_price: money(item?.base_price ?? item?.basePrice),
    variant_name: item?.variant_name ?? item?.variantName ?? null,
    notes: item?.notes ?? null,
    selected_options: Array.isArray(item?.selected_options)
      ? item.selected_options
      : Array.isArray(item?.selectedOptions)
        ? item.selectedOptions
        : [],
  };
}

function normalizeOrder(order: any): NormalizedOrder {
  const createdAt = order?.created_at || order?.createdAt || order?.orderDate;
  return {
    id: order?.id || "",
    tenant_id: order?.tenant_id || order?.tenantId || "",
    order_type_id: order?.order_type_id || order?.orderTypeId,
    order_number: order?.order_number || order?.orderNumber || "-",
    status: order?.status || "draft",
    payment_status: order?.payment_status || order?.paymentStatus || "unpaid",
    customer_name: order?.customer_name || order?.customerName,
    table_number: order?.table_number || order?.tableNumber,
    created_at: createdAt ? new Date(createdAt) : undefined,
    updated_at: order?.updated_at,
    completed_at: order?.completed_at,
    subtotal: money(order?.subtotal),
    tax_amount: money(order?.tax_amount ?? order?.taxAmount),
    service_charge_amount: money(order?.service_charge_amount ?? order?.serviceCharge ?? order?.service_charge),
    discount_amount: money(order?.discount_amount ?? order?.discountAmount),
    total_amount: money(order?.total_amount ?? order?.total),
    paid_amount: money(order?.paid_amount ?? order?.paidAmount),
    items: Array.isArray(order?.items) ? order.items.map(normalizeOrderItem) : [],
    payments: Array.isArray(order?.payments) ? order.payments : [],
  };
}

function OrderCard({ order, selected, onClick, orderTypeName }: { order: NormalizedOrder; selected: boolean; onClick: () => void; orderTypeName?: string }) {
  const statusCfg = STATUS_CFG[order.status] ?? STATUS_CFG.draft;
  const paymentCfg = PAYMENT_CFG[order.payment_status] ?? PAYMENT_CFG.unpaid;
  const remaining = Math.max(0, order.total_amount - order.paid_amount);

  return (
    <button
      onClick={onClick}
      data-testid={`order-card-${order.id}`}
      className={`w-full text-left bg-white rounded-2xl border shadow-sm p-4 transition-all hover:shadow-md focus:outline-none ${selected ? "border-blue-500 ring-2 ring-blue-500/20 shadow-md" : "border-slate-100 hover:border-slate-200"}`}
    >
      {/* Row 1: order type label + status badge */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {orderTypeName && <span className="text-xs font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md">{orderTypeName}</span>}
          {order.table_number && <span className="text-xs text-slate-500">Meja {order.table_number}</span>}
          {order.customer_name && <span className="text-xs text-slate-500 truncate max-w-[120px]">{order.customer_name}</span>}
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg flex-shrink-0 ${statusCfg.badge}`}>{statusCfg.label}</span>
      </div>

      {/* Row 2: order number — dark & readable */}
      <div className="font-mono text-sm font-bold text-slate-800 mb-2">{order.order_number}</div>

      {/* Row 3: timestamp left, price right */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <Clock size={11} />
          {formatDateTime(order.created_at)}
        </div>
        <span className="font-black text-slate-800 text-sm">{formatPrice(order.total_amount)}</span>
      </div>

      {/* Row 4: payment badge on its own line */}
      <div className="mt-1.5">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${paymentCfg.badge}`}>{paymentCfg.label}</span>
      </div>

      {order.payment_status === "partial" && order.paid_amount > 0 && order.total_amount > 0 && (
        <div className="mt-2 pt-2 border-t border-amber-100">
          <div className="h-1.5 bg-amber-100 rounded-full overflow-hidden mb-1.5">
            <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.min(100, (order.paid_amount / order.total_amount) * 100)}%` }} />
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-emerald-600 font-semibold">Dibayar {formatPrice(order.paid_amount)}</span>
            <span className="text-amber-600 font-bold">Sisa {formatPrice(remaining)}</span>
          </div>
        </div>
      )}
    </button>
  );
}

function DetailPanel({ order, orderTypeName, onClose, onPrint, onSettle, isPrinting, isSettling }: {
  order: NormalizedOrder | null;
  orderTypeName?: string;
  onClose: () => void;
  onPrint: () => void;
  onSettle: () => void;
  isPrinting: boolean;
  isSettling: boolean;
}) {
  if (!order) {
    return (
      <div className="hidden md:flex h-full items-center justify-center text-slate-300 flex-col gap-3">
        <Receipt size={40} strokeWidth={1.5} />
        <p className="text-sm">Pilih pesanan untuk melihat detail</p>
      </div>
    );
  }

  const statusCfg = STATUS_CFG[order.status] ?? STATUS_CFG.draft;
  const paymentCfg = PAYMENT_CFG[order.payment_status] ?? PAYMENT_CFG.unpaid;
  const remaining = Math.max(0, order.total_amount - order.paid_amount);
  const isFullyPaid = order.payment_status === "paid";

  return (
    <>
      <div className="bg-white border-b border-slate-100 shrink-0">
        <div className="pt-2.5 flex justify-center md:hidden">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>
        <div className="px-4 pt-2.5 pb-3 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="font-mono text-base font-black text-slate-900 leading-tight">#{order.order_number}</h2>
            <div className="flex items-center gap-1 flex-wrap mt-1.5">
              {orderTypeName && (
                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">{orderTypeName}</span>
              )}
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${statusCfg.badge}`}>{statusCfg.label}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${paymentCfg.badge}`}>{paymentCfg.label}</span>
              {order.table_number && (
                <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">Meja {order.table_number}</span>
              )}
              {order.customer_name && (
                <span className="text-[10px] text-slate-500 truncate max-w-[110px]">{order.customer_name}</span>
              )}
              <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                <Clock size={9} />
                {formatDateTime(order.created_at)}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-500 transition-colors flex-shrink-0 mt-0.5" data-testid="button-close-details">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50/60">
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            <ShoppingBag size={11} />
            Item Pesanan ({order.items.length})
          </div>
          {order.items.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 flex flex-col items-center gap-2 text-slate-400">
              <Package size={28} strokeWidth={1.5} className="opacity-40" />
              <p className="text-sm">Tidak ada item</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {order.items.map((item, idx) => {
                const unitPrice = item.quantity > 0 ? Math.round(item.item_subtotal / item.quantity) : money(item.base_price);
                const selectedOpts = item.selected_options ?? [];
                const optionsLabel = selectedOpts.length > 0
                  ? selectedOpts.map((o) => (o as any).optionName ?? (o as any).option_name ?? "").filter(Boolean).join(", ")
                  : null;
                const variantDisplay = item.variant_name
                  ? optionsLabel ? `${item.variant_name} · ${optionsLabel}` : item.variant_name
                  : optionsLabel;
                return (
                  <div key={item.id || idx} className={`px-4 py-3 ${idx < order.items.length - 1 ? "border-b border-slate-50" : ""}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 leading-snug">{item.product_name}</p>
                        {variantDisplay && <p className="text-[11px] text-blue-500 mt-0.5 font-medium">{variantDisplay}</p>}
                        {item.notes && <p className="text-[11px] text-amber-600 mt-0.5 italic">"{item.notes}"</p>}
                        <p className="text-[11px] text-slate-400 mt-0.5">{formatPrice(unitPrice)} × {item.quantity}</p>
                      </div>
                      <span className="text-sm font-bold text-slate-800 flex-shrink-0 mt-0.5">{formatPrice(item.item_subtotal)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 pt-2 pb-2">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Subtotal</span>
              <span className="text-slate-700 font-medium">{formatPrice(order.subtotal)}</span>
            </div>
            {order.tax_amount > 0 && <div className="flex justify-between text-sm"><span className="text-slate-500">Pajak</span><span className="text-slate-700 font-medium">{formatPrice(order.tax_amount)}</span></div>}
            {order.service_charge_amount > 0 && <div className="flex justify-between text-sm"><span className="text-slate-500">Biaya Layanan</span><span className="text-slate-700 font-medium">{formatPrice(order.service_charge_amount)}</span></div>}
            {order.discount_amount > 0 && <div className="flex justify-between text-sm text-emerald-600"><span>Diskon</span><span className="font-medium">−{formatPrice(order.discount_amount)}</span></div>}
            <div className="border-t border-slate-100 pt-2 flex justify-between">
              <span className="font-bold text-slate-800 text-sm">Total</span>
              <span className="font-black text-slate-800 text-base">{formatPrice(order.total_amount)}</span>
            </div>
          </div>
        </div>

        <div className="px-5 pt-2 pb-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-4 pt-3 pb-2 border-b border-slate-50 flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pembayaran</span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${paymentCfg.badge}`}>{paymentCfg.label}</span>
            </div>
            <div className="px-4 py-2.5 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Total</span>
                <span className="font-bold text-slate-800">{formatPrice(order.total_amount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Dibayar</span>
                <span className={`font-bold ${order.paid_amount > 0 ? "text-emerald-600" : "text-slate-400"}`}>{formatPrice(order.paid_amount)}</span>
              </div>
              {!isFullyPaid && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 font-medium">Sisa</span>
                  <span className="font-black text-amber-600">{formatPrice(remaining)}</span>
                </div>
              )}
              {order.payment_status === "partial" && order.total_amount > 0 && (
                <div className="pt-0.5">
                  <div className="h-1.5 bg-amber-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${Math.min(100, (order.paid_amount / order.total_amount) * 100)}%` }} />
                  </div>
                </div>
              )}
            </div>
            {Array.isArray(order.payments) && order.payments.length > 0 && (() => {
              const pmts = order.payments;
              const firstFlow = String(pmts[0]?.payment_flow ?? pmts[0]?.paymentFlow ?? "FULL").toUpperCase();
              const isMulti = firstFlow === "MULTI_PAYMENT" && pmts.length > 1;
              const isSplit = firstFlow === "SPLIT_BILL";
              if (isMulti) {
                const multiTotal = pmts.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
                return (
                  <div className="border-t border-slate-50 px-4 py-2.5 space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Multi Payment</p>
                    {pmts.map((p: any, idx: number) => (
                      <div key={p.id ?? idx} className="flex justify-between text-xs">
                        <span className="text-slate-500">{idx + 1}. {paymentMethodLabel(p.payment_method ?? p.paymentMethod)}</span>
                        <span className="font-semibold text-emerald-600">{formatPrice(Number(p.amount ?? 0))}</span>
                      </div>
                    ))}
                    <div className="border-t border-slate-100 pt-1 flex justify-between text-xs">
                      <span className="text-slate-600 font-semibold">Total dibayar</span>
                      <span className="font-black text-emerald-700">{formatPrice(multiTotal)}</span>
                    </div>
                  </div>
                );
              }
              if (isSplit) {
                const splitLabels = new Map<string, string>();
                const alphabet = "ABCDEFGHIJ";
                let labelIdx = 0;
                pmts.forEach((p: any) => {
                  const sid = p.split_id ?? p.splitId;
                  if (sid && !splitLabels.has(sid)) splitLabels.set(sid, `Bill ${alphabet[labelIdx++] ?? labelIdx}`);
                });
                return (
                  <div className="border-t border-slate-50 px-4 py-2.5 space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Split Bill</p>
                    {pmts.map((p: any, idx: number) => {
                      const sid = p.split_id ?? p.splitId;
                      const billLabel = sid ? (splitLabels.get(sid) ?? "Bill ?") : `Pembayaran ${idx + 1}`;
                      return (
                        <div key={p.id ?? idx} className="flex justify-between items-center text-xs">
                          <span className="text-slate-500">{billLabel} · {paymentMethodLabel(p.payment_method ?? p.paymentMethod)}</span>
                          <span className="font-semibold text-emerald-600">{formatPrice(Number(p.amount ?? 0))}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              }
              return (
                <div className="border-t border-slate-50 px-4 py-2.5 space-y-1.5">
                  {pmts.map((p: any, idx: number) => {
                    const method = p.payment_method ?? p.paymentMethod;
                    const kind = p.payment_kind ?? p.paymentKind;
                    const kindLabel = paymentKindLabel(kind);
                    return (
                      <div key={p.id ?? idx} className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                          {paymentMethodLabel(method)}
                          {kindLabel && <span className="text-slate-400">· {kindLabel}</span>}
                        </span>
                        <span className="font-semibold text-emerald-600">+{formatPrice(Number(p.amount ?? 0))}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            {Array.isArray(order.payments) && order.payments.length === 0 && order.paid_amount === 0 && (
              <div className="px-4 pb-3">
                <p className="text-[11px] text-slate-400 text-center py-1">Belum ada pembayaran tercatat</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 py-3 border-t border-slate-100 bg-white flex gap-2">
        <Button variant="outline" size="sm" onClick={onPrint} disabled={isPrinting} data-testid="button-reprint-receipt" className="flex-shrink-0 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50">
          <Printer size={15} />
        </Button>
        {!isFullyPaid ? (
          <Button onClick={onSettle} disabled={isSettling} data-testid="button-process-transaction" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm">
            {isSettling ? "Memproses..." : order.payment_status === "partial" ? `Lunasi Sisa ${formatPrice(remaining)}` : "Proses Pembayaran"}
          </Button>
        ) : (
          <div className="flex-1 flex items-center justify-center gap-1.5 text-emerald-600 text-sm font-bold">
            <CheckCircle2 size={15} />
            Pesanan Lunas
          </div>
        )}
      </div>
    </>
  );
}

export default function OrdersPage() {
  const [filterStatus, setFilterStatus] = useState<OrderStatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [settleDialogOpen, setSettleDialogOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const tenantId = getActiveTenantId();
  const { data: tenantProfile } = useTenantProfile(tenantId);
  const tenantName = (tenantProfile?.tenant as any)?.name ?? "AuraPOS";

  const { data, isLoading } = useOrders({ limit: 100 });
  const { data: selectedOrderResponse } = useOrder(selectedOrderId || undefined);
  const { data: orderTypes = [] } = useOrderTypes();
  const recordPaymentMutation = useRecordPayment();

  const orderTypeMap = useMemo(() => {
    const map: Record<string, string> = {};
    (orderTypes as OrderTypeSummary[]).forEach((ot) => { map[ot.id] = ot.name; });
    return map;
  }, [orderTypes]);

  const normalizedOrders = useMemo(() => (data?.orders || []).map(normalizeOrder), [data]);
  const activeOrders = useMemo(() => normalizedOrders.filter((o) => ["draft", "confirmed", "preparing", "ready", "served"].includes(o.status)), [normalizedOrders]);

  const filterCounts = useMemo<Record<OrderStatusFilter, number>>(() => ({
    all: activeOrders.length,
    draft: activeOrders.filter((o) => o.status === "draft").length,
    confirmed: activeOrders.filter((o) => o.status === "confirmed").length,
    preparing: activeOrders.filter((o) => o.status === "preparing").length,
    ready: activeOrders.filter((o) => o.status === "ready").length,
    served: activeOrders.filter((o) => o.status === "served").length,
    completed: normalizedOrders.filter((o) => o.status === "completed").length,
  }), [normalizedOrders, activeOrders]);

  const filteredOrders = useMemo(() => {
    const showAll = filterStatus === "all";
    const isActiveStatus = ["draft", "confirmed", "preparing", "ready", "served"].includes(filterStatus);
    let result = showAll
      ? activeOrders
      : isActiveStatus
        ? activeOrders.filter((o) => o.status === filterStatus)
        : normalizedOrders.filter((o) => o.status === filterStatus);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((o) => o.customer_name?.toLowerCase().includes(q) || o.order_number?.toLowerCase().includes(q) || o.table_number?.toString().includes(q));
    }
    return result;
  }, [normalizedOrders, activeOrders, filterStatus, searchQuery]);

  const selectedOrder = useMemo(() => {
    if (selectedOrderResponse) return normalizeOrder(selectedOrderResponse);
    if (selectedOrderId) return normalizedOrders.find((o) => o.id === selectedOrderId) || null;
    return null;
  }, [normalizedOrders, selectedOrderId, selectedOrderResponse]);

  const handleReprintReceipt = async () => {
    if (!selectedOrder) return;
    setIsPrinting(true);
    const receiptPayload = {
      orderNumber: selectedOrder.order_number,
      tenantName,
      customerName: selectedOrder.customer_name || "",
      tableNumber: selectedOrder.table_number || "",
      paymentMethod: toPOSPaymentMethod(selectedOrder.payments?.[0]?.payment_method),
      createdAt: selectedOrder.created_at ? new Date(selectedOrder.created_at) : new Date(),
      subtotal: selectedOrder.subtotal,
      tax: selectedOrder.tax_amount,
      serviceCharge: selectedOrder.service_charge_amount,
      total: selectedOrder.total_amount,
      items: selectedOrder.items.map((item) => ({
        name: item.product_name,
        qty: item.quantity,
        unitPrice: item.quantity > 0 ? Math.round(item.item_subtotal / item.quantity) : 0,
        total: item.item_subtotal,
      })),
    };

    let printJobId: string | null = null;
    try {
      const terminal = await getOrCreateTerminalIdentity(tenantId);
      const job = await enqueuePrintJob({ tenantId, terminalId: terminal.terminalId, serverOrderId: selectedOrder.id, orderNumber: selectedOrder.order_number, type: "receipt", payload: receiptPayload });
      printJobId = job.id;
    } catch {
      // non-critical
    }

    try {
      if (printJobId) await markPrinting(printJobId).catch(() => undefined);
      await bluetoothReceiptPrinter.reconnectIfPossible().catch(() => false);
      await bluetoothReceiptPrinter.print(receiptPayload);
      if (printJobId) await markPrinted(printJobId).catch(() => undefined);
      toast({ title: "Struk dicetak", description: `Order #${selectedOrder.order_number} berhasil dicetak.` });
    } catch (err) {
      if (printJobId) await markPrintFailed(printJobId, err instanceof Error ? err.message : "Print gagal").catch(() => undefined);
      toast({ title: printJobId ? "Struk disimpan ke antrian cetak" : "Cetak struk gagal", description: printJobId ? "Buka Printer Hub untuk cetak ulang kapan saja." : "Hubungkan printer Bluetooth terlebih dahulu.", variant: printJobId ? "default" : "destructive" });
    } finally {
      setIsPrinting(false);
    }
  };

  const handleOpenSettleDialog = () => {
    if (!selectedOrder) return;
    if (selectedOrder.total_amount - selectedOrder.paid_amount <= 0) {
      toast({ title: "Sudah Terbayar", description: "Pesanan ini sudah lunas.", variant: "destructive" });
      return;
    }
    setSettleDialogOpen(true);
  };

  const handleConfirmSettleFromPaymentDialog = async (
    method: PaymentMethod,
    cashReceived?: number,
    _partialAmount?: number,
    paymentDetails?: { lines?: Array<{ amount: number; receivedAmount?: number }> }
  ) => {
    if (!selectedOrder) return;
    const remaining = Math.max(0, selectedOrder.total_amount - selectedOrder.paid_amount);
    if (remaining <= 0) return;

    const line = paymentDetails?.lines?.[0];
    const amount = line?.amount ?? remaining;
    const received_amount = line?.receivedAmount ?? cashReceived;

    try {
      await recordPaymentMutation.mutateAsync({
        orderId: selectedOrder.id,
        amount,
        payment_method: method as "CASH" | "MANUAL_TRANSFER" | "MANUAL_QRIS",
        received_amount,
      });
      setSettleDialogOpen(false);
      toast({ title: "Pembayaran berhasil", description: `${formatPrice(amount)} telah dicatat.` });
    } catch (error) {
      toast({ title: "Gagal", description: error instanceof Error ? error.message : "Gagal mencatat pembayaran", variant: "destructive" });
    }
  };

  return (
    <div className="flex h-full overflow-hidden bg-slate-50 relative">
      <div className="flex-1 flex flex-col min-w-0 h-full relative pb-[60px] md:pb-0">
        <header className="bg-white border-b border-slate-100 sticky top-0 z-10">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <button onClick={() => setLocation("/hub")} className="p-2 hover:bg-slate-100 rounded-full transition-colors -ml-1" data-testid="button-back">
                <ArrowLeft size={18} className="text-slate-600" />
              </button>
              <div>
                <h1 className="text-base font-bold text-slate-800 leading-tight">Pesanan</h1>
                <p className="text-[11px] text-slate-400 leading-none">Kelola dan pantau semua pesanan</p>
              </div>
            </div>
            <button onClick={() => setSearchOpen((v) => !v)} className={`p-2 rounded-full transition-colors ${searchOpen ? "bg-blue-100 text-blue-600" : "hover:bg-slate-100 text-slate-500"}`} data-testid="button-toggle-search" title="Cari pesanan">
              <Search size={18} />
            </button>
          </div>

          {searchOpen && (
            <div className="px-4 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
                <input type="text" placeholder="Cari nama, nomor order, atau meja..." className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} data-testid="input-search-orders" autoFocus />
              </div>
            </div>
          )}

          <div className="px-4 pb-2">
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto no-scrollbar">
              {FILTER_TABS.map(({ id, label }) => (
                <button key={id} onClick={() => setFilterStatus(id)} data-testid={`filter-${id}`} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${filterStatus === id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                  {label}{filterCounts[id] > 0 && <span className={`ml-1 ${filterStatus === id ? "text-blue-600" : "text-slate-400"}`}>({filterCounts[id]})</span>}
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden md:border-r border-slate-200">
            <ScrollArea className="flex-1 overflow-auto">
              <div className="p-4 pb-24 md:pb-8 space-y-3">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400"><Package size={28} className="animate-pulse opacity-50" /><p className="text-sm">Memuat pesanan...</p></div>
                ) : filteredOrders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400"><ShoppingBag size={28} strokeWidth={1.5} className="opacity-40" /><p className="text-sm font-medium">Tidak ada pesanan</p>{searchQuery && <p className="text-xs text-slate-300">Coba hapus kata kunci pencarian</p>}</div>
                ) : (
                  filteredOrders.map((order) => <OrderCard key={order.id} order={order} selected={selectedOrder?.id === order.id} onClick={() => setSelectedOrderId(order.id)} orderTypeName={order.order_type_id ? orderTypeMap[order.order_type_id] : undefined} />)
                )}
              </div>
            </ScrollArea>
          </div>

          <div className={`fixed md:relative inset-x-0 bottom-0 md:inset-auto md:w-[45%] md:min-w-[320px] md:max-w-[520px] md:h-full z-[60] bg-white md:border-l border-slate-200 md:shadow-none flex flex-col transition-transform duration-300 ease-out rounded-t-3xl md:rounded-none overflow-hidden h-[90vh] md:h-full ${selectedOrder ? "translate-y-0 shadow-[0_-8px_40px_rgba(0,0,0,0.18)]" : "translate-y-full md:translate-y-0"}`}>
            <DetailPanel order={selectedOrder} orderTypeName={selectedOrder?.order_type_id ? orderTypeMap[selectedOrder.order_type_id] : undefined} onClose={() => setSelectedOrderId(null)} onPrint={handleReprintReceipt} onSettle={handleOpenSettleDialog} isPrinting={isPrinting} isSettling={recordPaymentMutation.isPending} />
          </div>
        </div>
      </div>

      {selectedOrder && <div className="fixed inset-0 bg-black/25 backdrop-blur-[1px] z-[55] md:hidden" onClick={() => setSelectedOrderId(null)} />}
      <UnifiedBottomNav cartCount={0} />

      {selectedOrder && (
        <PaymentMethodDialog
          open={settleDialogOpen}
          onClose={() => setSettleDialogOpen(false)}
          cartTotal={Math.max(0, selectedOrder.total_amount - selectedOrder.paid_amount)}
          cartItems={[]}
          isSubmitting={recordPaymentMutation.isPending}
          defaultPaymentMethod="CASH"
          allowPartial={false}
          allowMultiPayment={false}
          allowSplitBill={false}
          onConfirm={handleConfirmSettleFromPaymentDialog}
        />
      )}
    </div>
  );
}
