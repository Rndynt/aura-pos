import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useOrder, useOrders, useOrderTypes, useRecordPayment } from "@/lib/api/hooks";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { UnifiedBottomNav } from "@/components/navigation/UnifiedBottomNav";
import {
  X,
  ChefHat,
  Search,
  ArrowLeft,
  ShoppingBag,
  Printer,
  CreditCard,
  Banknote,
  Wallet,
  Receipt,
  Clock,
  CheckCircle2,
  Package,
} from "lucide-react";
import type { Order, OrderItem, OrderType, SelectedOption } from "@pos/domain/orders/types";
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

/* ─────────────────── Status configs ─────────────────── */
const STATUS_CFG: Record<string, { label: string; badge: string; dot: string }> = {
  draft:     { label: "Ditunda",       badge: "bg-slate-100 text-slate-600",    dot: "bg-slate-300" },
  confirmed: { label: "Dikonfirmasi",  badge: "bg-blue-100 text-blue-700",      dot: "bg-blue-400" },
  preparing: { label: "Diproses",      badge: "bg-orange-100 text-orange-700",  dot: "bg-orange-400" },
  ready:     { label: "Siap Saji",     badge: "bg-emerald-100 text-emerald-700",dot: "bg-emerald-400" },
  served:    { label: "Disajikan",     badge: "bg-teal-100 text-teal-700",      dot: "bg-teal-400" },
  completed: { label: "Selesai",       badge: "bg-green-100 text-green-700",    dot: "bg-green-400" },
  cancelled: { label: "Dibatalkan",    badge: "bg-red-100 text-red-700",        dot: "bg-red-400" },
};

const PAYMENT_CFG: Record<string, { label: string; badge: string }> = {
  paid:    { label: "Lunas",       badge: "bg-emerald-100 text-emerald-700" },
  partial: { label: "Sebagian",    badge: "bg-amber-100 text-amber-700" },
  unpaid:  { label: "Belum Bayar", badge: "bg-slate-100 text-slate-500" },
};

/* ─────────────────── Types ─────────────────── */
type OrderStatusFilter = "all" | "draft" | "confirmed" | "preparing" | "ready" | "served" | "completed";

type NormalizedMoneyFields = {
  subtotal: number;
  tax_amount: number;
  service_charge_amount: number;
  discount_amount: number;
  total_amount: number;
  paid_amount: number;
};

type NormalizedOrderItem = Omit<OrderItem, "selected_options"> & {
  selected_options?: SelectedOption[];
};

type NormalizedOrder = Omit<Order, keyof NormalizedMoneyFields | "created_at"> &
  NormalizedMoneyFields & {
    created_at?: Date;
    items: NormalizedOrderItem[];
    payment_status: Order["payment_status"];
  };

/* ─────────────────── Normalizers ─────────────────── */
const normNum = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const normalizeSelectedOption = (opt: any): SelectedOption => ({
  group_id: opt.group_id ?? opt.groupId ?? opt.optionGroupId ?? "",
  group_name: opt.group_name ?? opt.groupName ?? opt.optionGroupName ?? "",
  option_id: opt.option_id ?? opt.optionId ?? "",
  option_name: opt.option_name ?? opt.optionName ?? "",
  price_delta: normNum(opt.price_delta ?? opt.priceDelta),
  child_groups: opt.child_groups ?? opt.childGroups,
});

const normalizeItem = (item: Partial<OrderItem>): NormalizedOrderItem => {
  const rawOpts = (item.selected_options ?? (item as any).selectedOptions) as any[] | undefined;
  const rawGroups = (item.selected_option_groups ?? (item as any).selectedOptionGroups) as any[] | undefined;
  return {
    id: item.id || crypto.randomUUID(),
    product_id: item.product_id || "",
    product_name: item.product_name || (item as any).productName || "",
    base_price: normNum(item.base_price ?? (item as any).basePrice),
    variant_id: item.variant_id || (item as any).variantId,
    variant_name: item.variant_name || (item as any).variantName,
    variant_price_delta: normNum(item.variant_price_delta ?? (item as any).variantPriceDelta),
    selected_options: rawOpts ? rawOpts.map(normalizeSelectedOption) : undefined,
    selected_option_groups: rawGroups
      ? rawGroups.map((grp: any) => ({
          group_id: grp.group_id ?? grp.groupId ?? "",
          group_name: grp.group_name ?? grp.groupName ?? "",
          selection_type: grp.selection_type ?? grp.selectionType,
          selected_options: (grp.selected_options ?? grp.selectedOptions ?? []).map(normalizeSelectedOption),
        }))
      : undefined,
    quantity: item.quantity || 0,
    item_subtotal: normNum(item.item_subtotal ?? (item as any).itemSubtotal),
    notes: item.notes,
    status: item.status as NormalizedOrderItem["status"],
  };
};

const normalizeOrder = (order: Partial<Order>): NormalizedOrder => {
  const created_at = order.created_at || (order as any).createdAt || (order as any).orderDate;
  return {
    id: order.id || "",
    tenant_id: order.tenant_id || (order as any).tenantId || "",
    order_type_id: order.order_type_id || (order as any).orderTypeId,
    sales_channel: (order.sales_channel as NormalizedOrder["sales_channel"]) || (order as any).salesChannel,
    items: Array.isArray(order.items) ? order.items.map((item) => normalizeItem(item)) : [],
    subtotal: normNum(order.subtotal ?? (order as any).subtotal),
    tax_amount: normNum(order.tax_amount ?? (order as any).taxAmount),
    service_charge_amount: normNum(order.service_charge_amount ?? (order as any).serviceCharge ?? (order as any).service_charge),
    discount_amount: normNum(order.discount_amount ?? (order as any).discountAmount),
    total_amount: normNum(order.total_amount ?? (order as any).total),
    paid_amount: normNum(order.paid_amount ?? (order as any).paidAmount),
    payment_status: order.payment_status || (order as any).paymentStatus || "unpaid",
    payments: (order as any).payments,
    order_number: order.order_number || (order as any).orderNumber || "-",
    status: order.status || "draft",
    customer_name: order.customer_name || (order as any).customerName,
    table_number: order.table_number || (order as any).tableNumber,
    notes: order.notes,
    created_at: created_at ? new Date(created_at as Date | string) : undefined,
    updated_at: order.updated_at,
    completed_at: order.completed_at,
  };
};

/* ─────────────────── Helpers ─────────────────── */
const formatPrice = (price: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(price);

const formatDateTime = (date: Date | string | undefined | null) => {
  if (!date) return "-";
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
};

const formatTime = (date: Date | string | undefined | null) => {
  if (!date) return "-";
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return "-";
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
};

/* ─────────────────── Sub-components ─────────────────── */
function StatusDot({ status }: { status: string }) {
  const dot = STATUS_CFG[status]?.dot ?? "bg-slate-300";
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />;
}

function OrderCard({
  order,
  selected,
  onClick,
  orderTypeName,
}: {
  order: NormalizedOrder;
  selected: boolean;
  onClick: () => void;
  orderTypeName?: string;
}) {
  const statusCfg = STATUS_CFG[order.status] ?? STATUS_CFG.draft;
  const paymentCfg = PAYMENT_CFG[order.payment_status] ?? PAYMENT_CFG.unpaid;
  const remaining = Math.max(0, order.total_amount - order.paid_amount);

  return (
    <button
      onClick={onClick}
      data-testid={`order-card-${order.id}`}
      className={`w-full text-left bg-white rounded-2xl border shadow-sm p-4 transition-all hover:shadow-md focus:outline-none ${
        selected
          ? "border-blue-500 ring-2 ring-blue-500/20 shadow-md"
          : "border-slate-100 hover:border-slate-200"
      }`}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <StatusDot status={order.status} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {orderTypeName && (
                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md">
                  {orderTypeName}
                </span>
              )}
              {order.table_number && (
                <span className="text-xs text-slate-500">Meja {order.table_number}</span>
              )}
              {order.customer_name && (
                <span className="text-xs text-slate-500 truncate max-w-[120px]">{order.customer_name}</span>
              )}
            </div>
            <span className="text-xs text-slate-400 font-mono">#{order.order_number}</span>
          </div>
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg flex-shrink-0 ${statusCfg.badge}`}>
          {statusCfg.label}
        </span>
      </div>

      {/* Bottom row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <Clock size={11} />
          {formatDateTime(order.created_at)}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${paymentCfg.badge}`}>
            {paymentCfg.label}
          </span>
          <span className="font-black text-slate-800 text-sm">{formatPrice(order.total_amount)}</span>
        </div>
      </div>

      {/* Partial payment bar */}
      {order.payment_status === "partial" && order.paid_amount > 0 && order.total_amount > 0 && (
        <div className="mt-2.5 pt-2.5 border-t border-amber-100">
          <div className="h-1.5 bg-amber-100 rounded-full overflow-hidden mb-1.5">
            <div
              className="h-full bg-amber-400 rounded-full"
              style={{ width: `${Math.min(100, (order.paid_amount / order.total_amount) * 100)}%` }}
            />
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

/* ─────────────────── Detail Panel ─────────────────── */
function DetailPanel({
  order,
  orderTypeName,
  onClose,
  onPrint,
  onSettle,
  isPrinting,
  isSettling,
}: {
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
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-100 shrink-0">

        {/* Drag handle — mobile only */}
        <div className="pt-2.5 flex justify-center md:hidden">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* Top bar: order type (left) + close (right) */}
        <div className="px-4 pt-3 pb-1 flex items-center justify-between gap-2">
          {orderTypeName
            ? <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg">{orderTypeName}</span>
            : <span />}
          <button
            onClick={onClose}
            className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-500 transition-colors"
            data-testid="button-close-details"
          >
            <X size={14} />
          </button>
        </div>

        {/* Order number — large & prominent */}
        <div className="px-4 pb-3">
          <h2 className="font-mono text-lg font-black text-slate-900 leading-tight">
            #{order.order_number}
          </h2>
          {order.created_at && (
            <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
              <Clock size={10} />
              {formatDateTime(order.created_at)}
            </p>
          )}
        </div>

        {/* Info grid: 2-column */}
        <div className="mx-4 mb-4 rounded-2xl bg-slate-50 border border-slate-100 overflow-hidden">
          <div className="grid grid-cols-2 divide-x divide-slate-100">
            {/* Status order */}
            <div className="px-3.5 py-2.5">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Status</p>
              <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-lg ${statusCfg.badge}`}>
                {statusCfg.label}
              </span>
            </div>
            {/* Pembayaran */}
            <div className="px-3.5 py-2.5">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Pembayaran</p>
              <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-lg ${paymentCfg.badge}`}>
                {paymentCfg.label}
              </span>
            </div>
          </div>
          {/* Second row — only if there's table or customer */}
          {(order.table_number || order.customer_name) && (
            <div className="grid grid-cols-2 divide-x divide-slate-100 border-t border-slate-100">
              <div className="px-3.5 py-2.5">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Meja</p>
                <p className="text-sm font-bold text-slate-700">{order.table_number ?? "—"}</p>
              </div>
              <div className="px-3.5 py-2.5">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Pelanggan</p>
                <p className="text-sm font-medium text-slate-700 truncate">{order.customer_name || "—"}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto bg-slate-50/60">

        {/* Items */}
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            <ShoppingBag size={11} />
            Item Pesanan ({order.items?.length || 0})
          </div>

          {!order.items || order.items.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 flex flex-col items-center gap-2 text-slate-400">
              <ChefHat size={28} strokeWidth={1.5} className="opacity-40" />
              <p className="text-sm">Tidak ada item</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {order.items.map((item, idx) => {
                const unitPrice = item.quantity > 0
                  ? Math.round(item.item_subtotal / item.quantity)
                  : item.base_price;
                return (
                  <div
                    key={idx}
                    className={`px-4 py-3 ${idx < order.items.length - 1 ? "border-b border-slate-50" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-7 h-7 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-xs font-black text-blue-600">{item.quantity}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-800 leading-snug">{item.product_name}</p>
                          {item.variant_name && (
                            <p className="text-[11px] text-blue-500 mt-0.5 font-medium">{item.variant_name}</p>
                          )}
                          {/* Selected options/modifiers */}
                          {item.selected_options && item.selected_options.length > 0 && (
                            <div className="mt-0.5 space-y-0.5">
                              {item.selected_options.map((opt, oi) => (
                                <p key={oi} className="text-[11px] text-slate-400">
                                  {opt.group_name
                                    ? <><span className="text-slate-500">{opt.group_name}:</span>{" "}</>
                                    : null}
                                  <span className="text-slate-600 font-medium">{opt.option_name}</span>
                                  {opt.price_delta > 0 && (
                                    <span className="text-emerald-500"> +{formatPrice(opt.price_delta)}</span>
                                  )}
                                </p>
                              ))}
                            </div>
                          )}
                          {/* Nested option groups */}
                          {item.selected_option_groups && item.selected_option_groups.length > 0 && (
                            <div className="mt-0.5 space-y-0.5">
                              {item.selected_option_groups.map((grp, gi) =>
                                grp.selected_options.map((opt, oi) => (
                                  <p key={`${gi}-${oi}`} className="text-[11px] text-slate-400">
                                    {grp.group_name
                                      ? <><span className="text-slate-500">{grp.group_name}:</span>{" "}</>
                                      : null}
                                    <span className="text-slate-600 font-medium">{opt.option_name}</span>
                                    {opt.price_delta > 0 && (
                                      <span className="text-emerald-500"> +{formatPrice(opt.price_delta)}</span>
                                    )}
                                  </p>
                                ))
                              )}
                            </div>
                          )}
                          {item.notes && (
                            <p className="text-[11px] text-amber-600 mt-0.5 italic">"{item.notes}"</p>
                          )}
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {formatPrice(unitPrice)} × {item.quantity}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-slate-800 flex-shrink-0 mt-0.5">
                        {formatPrice(item.item_subtotal)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Price breakdown */}
        <div className="px-5 pt-2 pb-2">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Subtotal</span>
              <span className="text-slate-700 font-medium">{formatPrice(order.subtotal)}</span>
            </div>
            {order.tax_amount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Pajak</span>
                <span className="text-slate-700 font-medium">{formatPrice(order.tax_amount)}</span>
              </div>
            )}
            {order.service_charge_amount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Biaya Layanan</span>
                <span className="text-slate-700 font-medium">{formatPrice(order.service_charge_amount)}</span>
              </div>
            )}
            {order.discount_amount > 0 && (
              <div className="flex justify-between text-sm text-emerald-600">
                <span>Diskon</span>
                <span className="font-medium">−{formatPrice(order.discount_amount)}</span>
              </div>
            )}
            <div className="border-t border-slate-100 pt-2 flex justify-between">
              <span className="font-bold text-slate-800 text-sm">Total</span>
              <span className="font-black text-slate-800 text-base">{formatPrice(order.total_amount)}</span>
            </div>
          </div>
        </div>

        {/* Payment status */}
        <div className="px-5 pt-2 pb-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3 space-y-1.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pembayaran</span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${paymentCfg.badge}`}>
                {paymentCfg.label}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Dibayar</span>
              <span className={`font-bold ${order.paid_amount > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                {formatPrice(order.paid_amount)}
              </span>
            </div>
            {!isFullyPaid && (
              <div className="flex justify-between text-sm border-t border-slate-50 pt-1.5">
                <span className="text-slate-600 font-medium">Sisa Tagihan</span>
                <span className="font-black text-amber-600">{formatPrice(remaining)}</span>
              </div>
            )}

            {/* Payment history */}
            {Array.isArray((order as any).payments) && (order as any).payments.length > 0 && (
              <div className="border-t border-slate-50 pt-2 space-y-1.5 mt-1">
                {(order as any).payments.map((p: any, idx: number) => {
                  const method = p.payment_method ?? p.paymentMethod ?? "other";
                  const methodLabels: Record<string, string> = { cash: "Tunai", card: "Kartu", ewallet: "E-Wallet", other: "Lainnya" };
                  return (
                    <div key={p.id ?? idx} className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span className="capitalize">{methodLabels[method] ?? method}</span>
                        <span className="text-slate-300">·</span>
                        <span className="text-slate-400">{formatTime(p.payment_date ?? p.paymentDate)}</span>
                      </div>
                      <span className="font-bold text-emerald-600">+{formatPrice(Number(p.amount ?? 0))}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-100 bg-white flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onPrint}
          disabled={isPrinting}
          data-testid="button-reprint-receipt"
          className="flex-shrink-0 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          <Printer size={15} />
        </Button>
        {!isFullyPaid && (
          <Button
            onClick={onSettle}
            disabled={isSettling}
            data-testid="button-process-transaction"
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm"
          >
            {isSettling
              ? "Memproses..."
              : order.payment_status === "partial"
              ? `Lunasi Sisa ${formatPrice(remaining)}`
              : "Proses Pembayaran"}
          </Button>
        )}
        {isFullyPaid && (
          <div className="flex-1 flex items-center justify-center gap-1.5 text-emerald-600 text-sm font-bold">
            <CheckCircle2 size={15} />
            Pesanan Lunas
          </div>
        )}
      </div>
    </>
  );
}

/* ─────────────────── Main Page ─────────────────── */
export default function OrdersPage() {
  const [filterStatus, setFilterStatus] = useState<OrderStatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [settleDialogOpen, setSettleDialogOpen] = useState(false);
  const [settlePaymentMethod, setSettlePaymentMethod] = useState<"cash" | "card" | "ewallet">("cash");
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const tenantId = getActiveTenantId();
  const { data: tenantProfile } = useTenantProfile(tenantId);
  const tenantName = (tenantProfile?.tenant as any)?.name ?? "AuraPOS";

  const { data, isLoading } = useOrders({ limit: 100 });
  const { data: selectedOrderResponse } = useOrder(selectedOrderId || undefined);
  const { data: orderTypes = [] } = useOrderTypes();
  const recordPaymentMutation = useRecordPayment();

  /* Build a quick id→name map for order types */
  const orderTypeMap = useMemo(() => {
    const map: Record<string, string> = {};
    (orderTypes as OrderType[]).forEach((ot) => { map[ot.id] = ot.name; });
    return map;
  }, [orderTypes]);

  const normalizedOrders = useMemo(
    () => (data?.orders || []).map((order) => normalizeOrder(order)),
    [data]
  );

  const activeOrders = useMemo(
    () => normalizedOrders.filter((o) => ["draft", "confirmed", "preparing", "ready", "served"].includes(o.status)),
    [normalizedOrders]
  );

  const filterCounts: Record<OrderStatusFilter, number> = useMemo(() => ({
    all:       activeOrders.length,
    draft:     activeOrders.filter((o) => o.status === "draft").length,
    confirmed: activeOrders.filter((o) => o.status === "confirmed").length,
    preparing: activeOrders.filter((o) => o.status === "preparing").length,
    ready:     activeOrders.filter((o) => o.status === "ready").length,
    served:    normalizedOrders.filter((o) => o.status === "served").length,
    completed: normalizedOrders.filter((o) => o.status === "completed").length,
  }), [normalizedOrders, activeOrders]);

  const filteredOrders = useMemo(() => {
    const isActiveStatus = ["draft", "confirmed", "preparing", "ready"].includes(filterStatus);
    const showAll = filterStatus === "all";

    let result = showAll || isActiveStatus
      ? normalizedOrders.filter((o) => ["draft", "confirmed", "preparing", "ready"].includes(o.status))
      : normalizedOrders.filter((o) => o.status === filterStatus);

    if (!showAll && isActiveStatus) result = result.filter((o) => o.status === filterStatus);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (o) =>
          o.customer_name?.toLowerCase().includes(q) ||
          o.order_number?.toLowerCase().includes(q) ||
          o.table_number?.toString().includes(q)
      );
    }
    return result;
  }, [normalizedOrders, filterStatus, searchQuery]);

  const selectedOrder = useMemo(() => {
    if (selectedOrderResponse) return normalizeOrder(selectedOrderResponse);
    if (selectedOrderId) return normalizedOrders.find((o) => o.id === selectedOrderId) || null;
    return null;
  }, [normalizedOrders, selectedOrderId, selectedOrderResponse]);

  /* ── Print ── */
  const handleReprintReceipt = async () => {
    if (!selectedOrder) return;
    setIsPrinting(true);
    const receiptPayload = {
      orderNumber: selectedOrder.order_number,
      tenantName,
      customerName: selectedOrder.customer_name || "",
      tableNumber: selectedOrder.table_number || "",
      paymentMethod: (selectedOrder.payments as any)?.[0]?.payment_method || "cash",
      createdAt: selectedOrder.created_at ? new Date(selectedOrder.created_at) : new Date(),
      subtotal: selectedOrder.subtotal,
      tax: selectedOrder.tax_amount,
      serviceCharge: selectedOrder.service_charge_amount,
      total: selectedOrder.total_amount,
      items: (selectedOrder.items || []).map((item) => ({
        name: item.product_name,
        qty: item.quantity,
        unitPrice: item.quantity > 0 ? Math.round(item.item_subtotal / item.quantity) : 0,
        total: item.item_subtotal,
      })),
    };

    let printJobId: string | null = null;
    try {
      const terminal = await getOrCreateTerminalIdentity(tenantId);
      const job = await enqueuePrintJob({
        tenantId,
        terminalId: terminal.terminalId,
        serverOrderId: selectedOrder.id,
        orderNumber: selectedOrder.order_number,
        type: "receipt",
        payload: receiptPayload,
      });
      printJobId = job.id;
    } catch { /* non-critical */ }

    try {
      if (printJobId) await markPrinting(printJobId).catch(() => undefined);
      await bluetoothReceiptPrinter.reconnectIfPossible().catch(() => false);
      await bluetoothReceiptPrinter.print(receiptPayload);
      if (printJobId) await markPrinted(printJobId).catch(() => undefined);
      toast({ title: "Struk dicetak", description: `Order #${selectedOrder.order_number} berhasil dicetak.` });
    } catch (err) {
      if (printJobId) await markPrintFailed(printJobId, err instanceof Error ? err.message : "Print gagal").catch(() => undefined);
      toast({
        title: printJobId ? "Struk disimpan ke antrian cetak" : "Cetak struk gagal",
        description: printJobId
          ? "Buka Printer Hub untuk cetak ulang kapan saja."
          : "Hubungkan printer Bluetooth terlebih dahulu.",
        variant: printJobId ? "default" : "destructive",
      });
    } finally {
      setIsPrinting(false);
    }
  };

  /* ── Settle ── */
  const handleOpenSettleDialog = () => {
    if (!selectedOrder) return;
    if (selectedOrder.total_amount - selectedOrder.paid_amount <= 0) {
      toast({ title: "Sudah Terbayar", description: "Pesanan ini sudah lunas.", variant: "destructive" });
      return;
    }
    setSettlePaymentMethod("cash");
    setSettleDialogOpen(true);
  };

  const handleConfirmSettle = async () => {
    if (!selectedOrder) return;
    const remaining = selectedOrder.total_amount - selectedOrder.paid_amount;
    if (remaining <= 0) return;
    setSettleDialogOpen(false);
    try {
      await recordPaymentMutation.mutateAsync({
        orderId: selectedOrder.id,
        amount: remaining,
        payment_method: settlePaymentMethod,
      });
      toast({ title: "Pembayaran berhasil", description: `${formatPrice(remaining)} telah dicatat.` });
    } catch (error) {
      toast({
        title: "Gagal",
        description: error instanceof Error ? error.message : "Gagal mencatat pembayaran",
        variant: "destructive",
      });
    }
  };

  const FILTER_TABS: { id: OrderStatusFilter; label: string }[] = [
    { id: "all",       label: "Semua" },
    { id: "draft",     label: "Ditunda" },
    { id: "confirmed", label: "Dikonfirmasi" },
    { id: "preparing", label: "Diproses" },
    { id: "ready",     label: "Siap Saji" },
    { id: "served",    label: "Disajikan" },
    { id: "completed", label: "Selesai" },
  ];

  return (
    <div className="flex h-full overflow-hidden bg-slate-50 relative">
      <div className="flex-1 flex flex-col min-w-0 h-full relative pb-[60px] md:pb-0">
        {/* ── Header ── */}
        <header className="bg-white border-b border-slate-100 sticky top-0 z-10">
          {/* Title row */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setLocation("/hub")}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors -ml-1"
                data-testid="button-back"
              >
                <ArrowLeft size={18} className="text-slate-600" />
              </button>
              <div>
                <h1 className="text-base font-bold text-slate-800 leading-tight">Pesanan</h1>
                <p className="text-[11px] text-slate-400 leading-none">Kelola dan pantau semua pesanan</p>
              </div>
            </div>
            <button
              onClick={() => { setSearchOpen((v) => !v); }}
              className={`p-2 rounded-full transition-colors ${
                searchOpen ? "bg-blue-100 text-blue-600" : "hover:bg-slate-100 text-slate-500"
              }`}
              data-testid="button-toggle-search"
              title="Cari pesanan"
            >
              <Search size={18} />
            </button>
          </div>

          {/* Collapsible search */}
          {searchOpen && (
            <div className="px-4 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Cari nama, nomor order, atau meja..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search-orders"
                  autoFocus
                />
              </div>
            </div>
          )}

          {/* Filter tabs */}
          <div className="px-4 pb-2">
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto no-scrollbar">
              {FILTER_TABS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setFilterStatus(id)}
                  data-testid={`filter-${id}`}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                    filterStatus === id
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {label}
                  {filterCounts[id] > 0 && (
                    <span className={`ml-1 ${filterStatus === id ? "text-blue-600" : "text-slate-400"}`}>
                      ({filterCounts[id]})
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Orders list */}
          <div className="flex-1 flex flex-col overflow-hidden md:border-r border-slate-200">
            <ScrollArea className="flex-1 overflow-auto">
              <div className="p-4 pb-24 md:pb-8 space-y-3">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
                    <Package size={28} className="animate-pulse opacity-50" />
                    <p className="text-sm">Memuat pesanan...</p>
                  </div>
                ) : filteredOrders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
                    <ShoppingBag size={28} strokeWidth={1.5} className="opacity-40" />
                    <p className="text-sm font-medium">Tidak ada pesanan</p>
                    {searchQuery && <p className="text-xs text-slate-300">Coba hapus kata kunci pencarian</p>}
                  </div>
                ) : (
                  filteredOrders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      selected={selectedOrder?.id === order.id}
                      onClick={() => setSelectedOrderId(order.id)}
                      orderTypeName={order.order_type_id ? orderTypeMap[order.order_type_id] : undefined}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Detail panel — bottom sheet on mobile, side panel on desktop */}
          <div
            className={`fixed md:relative inset-x-0 bottom-0 md:inset-auto md:w-[400px] md:h-full z-[60] bg-white md:border-l border-slate-200 md:shadow-none flex flex-col transition-transform duration-300 ease-out rounded-t-3xl md:rounded-none ${
              selectedOrder
                ? "translate-y-0 shadow-[0_-8px_40px_rgba(0,0,0,0.18)]"
                : "translate-y-full md:translate-y-0 md:hidden"
            } h-[90vh] md:h-auto`}
          >
            <DetailPanel
              order={selectedOrder}
              orderTypeName={selectedOrder?.order_type_id ? orderTypeMap[selectedOrder.order_type_id] : undefined}
              onClose={() => setSelectedOrderId(null)}
              onPrint={handleReprintReceipt}
              onSettle={handleOpenSettleDialog}
              isPrinting={isPrinting}
              isSettling={recordPaymentMutation.isPending}
            />
          </div>
        </div>
      </div>

      {/* Mobile backdrop */}
      {selectedOrder && (
        <div
          className="fixed inset-0 bg-black/25 backdrop-blur-[1px] z-[55] md:hidden"
          onClick={() => setSelectedOrderId(null)}
        />
      )}

      <UnifiedBottomNav cartCount={0} />

      {/* Settle dialog */}
      <AlertDialog open={settleDialogOpen} onOpenChange={setSettleDialogOpen}>
        <AlertDialogContent className="max-w-sm mx-4 rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold text-slate-800">
              Konfirmasi Pembayaran
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-1">
                {selectedOrder && (
                  <div className="bg-slate-50 rounded-xl p-3.5 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Pesanan</span>
                      <span className="font-bold text-slate-800">#{selectedOrder.order_number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Sisa tagihan</span>
                      <span className="font-black text-amber-600">
                        {formatPrice(Math.max(0, selectedOrder.total_amount - selectedOrder.paid_amount))}
                      </span>
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Metode Pembayaran</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { value: "cash",    label: "Tunai",    Icon: Banknote },
                        { value: "card",    label: "Kartu",    Icon: CreditCard },
                        { value: "ewallet", label: "E-Wallet", Icon: Wallet },
                      ] as const
                    ).map(({ value, label, Icon }) => (
                      <button
                        key={value}
                        onClick={() => setSettlePaymentMethod(value)}
                        data-testid={`settle-method-${value}`}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-xs font-bold transition-all ${
                          settlePaymentMethod === value
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        <Icon size={18} />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-1">
            <AlertDialogCancel className="flex-1 rounded-xl font-semibold" data-testid="button-settle-cancel">
              Batal
            </AlertDialogCancel>
            <AlertDialogAction
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold"
              onClick={handleConfirmSettle}
              data-testid="button-settle-confirm"
            >
              Lunasi Sekarang
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
