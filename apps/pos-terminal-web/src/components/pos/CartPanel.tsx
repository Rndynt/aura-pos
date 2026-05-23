// @ts-nocheck
import type { CartItem as CartItemType, PaymentMethod, OrderType } from "@/hooks/useCart";
import type { OrderType as DomainOrderType } from "@pos/domain/orders/types";
import { CartItem } from "./CartItem";
import { ShoppingBag, Banknote, ChevronUp, User, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTenant } from "@/context/TenantContext";
import { useState, useCallback } from "react";
import { useTables } from "@/lib/api/tableHooks";

type CartPanelProps = {
  items: CartItemType[];
  onUpdateQty: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  getItemPrice: (item: CartItemType) => number;
  subtotal: number;
  taxRate: number;
  tax: number;
  serviceChargeRate: number;
  serviceCharge: number;
  total: number;
  onCharge: () => void;
  onPartialPayment?: () => void;
  onSaveDraft?: () => void;
  onUpdateNote?: (id: string, note: string) => void;
  hasPartialPayment?: boolean;
  isProcessing?: boolean;
  customerName: string;
  setCustomerName: (name: string) => void;
  orderNumber: string;
  tableNumber?: string;
  setTableNumber?: (table: string) => void;
  paymentMethod: PaymentMethod;
  setPaymentMethod: (method: PaymentMethod) => void;
  orderType: OrderType;
  setOrderType: (type: OrderType) => void;
  continueOrderId?: string | null;
  activeOrderTypes?: DomainOrderType[];
  setSelectedOrderTypeId?: (id: string | null) => void;
};

export function CartPanel({
  items, onUpdateQty, onRemove, onClear, getItemPrice,
  subtotal, taxRate, tax, serviceChargeRate, serviceCharge, total,
  onCharge, onSaveDraft, onUpdateNote, isProcessing = false,
  customerName, setCustomerName, orderNumber,
  tableNumber, setTableNumber,
  orderType, setOrderType,
  activeOrderTypes = [], setSelectedOrderTypeId,
}: CartPanelProps) {
  const { hasModule, isLoading } = useTenant();
  const [expanded, setExpanded] = useState(false);
  const { data: tablesData } = useTables();

  const showTable = !isLoading && hasModule("enable_table_management");

  const displayOrderTypes = activeOrderTypes.length > 0
    ? activeOrderTypes.map(ot => ({ code: ot.code.toLowerCase().replace(/_/g, "-") as OrderType, id: ot.id, name: ot.name }))
    : [
        { code: "dine-in" as OrderType, id: null, name: "Dine In" },
        { code: "take-away" as OrderType, id: null, name: "Take Away" },
        { code: "delivery" as OrderType, id: null, name: "Delivery" },
      ];

  const handleOrderTypeSelect = useCallback((type: OrderType, id: string | null) => {
    setOrderType(type);
    if (setSelectedOrderTypeId && id) setSelectedOrderTypeId(id);
  }, [setOrderType, setSelectedOrderTypeId]);

  const fmt = (n: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

  const fmtRate = (r: number) => {
    const pct = r * 100;
    return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
  };

  return (
    <div className="w-full h-full bg-white border-l border-slate-200 flex flex-col overflow-hidden">

      {/* ── HEADER (compact) ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-slate-100">
        <h2 className="text-sm font-black text-slate-800">Order</h2>
        <div className="flex items-center gap-1.5">
          <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs font-bold rounded-md" data-testid="order-number">
            {orderNumber}
          </span>
          <button
            onClick={onClear}
            className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
            data-testid="button-clear-cart"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* ── ORDER TYPE + CUSTOMER/TABLE (compact) ── */}
      <div className="flex-shrink-0 border-b border-slate-100 px-3 py-2 space-y-2 bg-white">
        {/* Order type tabs */}
        <div
          className="bg-slate-100 p-0.5 rounded-lg grid gap-0.5"
          style={{ gridTemplateColumns: `repeat(${Math.min(displayOrderTypes.length, 3)}, 1fr)` }}
        >
          {displayOrderTypes.map(ot => (
            <button
              key={ot.code}
              onClick={() => handleOrderTypeSelect(ot.code, ot.id)}
              className={`text-[10px] font-bold py-1.5 rounded-md transition-all ${
                orderType === ot.code
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-400"
              }`}
              data-testid={`button-order-type-${ot.code}`}
            >
              {ot.name || ot.code.replace("-", " ")}
            </button>
          ))}
        </div>

        {/* Customer + table — single compact row */}
        <div className="flex items-center gap-1.5">
          {/* Customer name */}
          <div className="flex-1 flex items-center gap-1.5 h-7 bg-white border border-slate-200 rounded-md px-2 min-w-0 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-100 transition-all">
            <User size={11} className="text-slate-400 flex-shrink-0" />
            <input
              type="text"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="Nama pelanggan"
              className="bg-transparent w-full text-xs text-slate-700 focus:outline-none placeholder:text-slate-300 min-w-0"
              data-testid="input-customer-name"
            />
          </div>

          {/* Table number */}
          {orderType === "dine-in" && showTable && setTableNumber && (
            <Select value={tableNumber} onValueChange={setTableNumber}>
              <SelectTrigger
                className="h-7 min-w-[64px] max-w-[80px] flex-shrink-0 border border-slate-200 bg-white rounded-md px-2 text-xs font-semibold text-slate-700 focus:ring-1 focus:ring-blue-100 focus:border-blue-400 gap-1 transition-all"
                data-testid="select-table"
              >
                <span className="truncate">{tableNumber || "–"}</span>
              </SelectTrigger>
              <SelectContent>
                {tablesData?.tables?.filter(t => t.status !== "maintenance").map(t => (
                  <SelectItem key={t.id} value={t.tableNumber}>Meja {t.tableNumber}</SelectItem>
                )) ?? <div className="p-2 text-xs text-slate-400">Tidak ada meja</div>}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* ── CART ITEMS (scrollable, maximized) ── */}
      <div className="flex-1 overflow-y-auto min-h-0 p-2.5 space-y-2">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2">
            <ShoppingBag size={36} className="opacity-50" />
            <p className="text-xs font-medium" data-testid="text-empty-cart">Belum ada pesanan</p>
          </div>
        ) : (
          items.map(item => (
            <CartItem
              key={item.id}
              item={item}
              onUpdateQty={onUpdateQty}
              onRemove={onRemove}
              onUpdateNote={onUpdateNote ?? (() => {})}
              getItemPrice={getItemPrice}
            />
          ))
        )}
      </div>

      {/* ── FOOTER (compact) ── */}
      {items.length > 0 && (
        <div className="flex-shrink-0 bg-white border-t border-slate-200 shadow-[0_-4px_16px_rgba(0,0,0,0.07)]">

          {/* Expanded detail — muncul di atas, tidak tutupi cart */}
          {expanded && (
            <div className="px-3 py-2 border-b border-slate-100 space-y-1.5 bg-slate-50/80">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Subtotal</span>
                <span className="tabular-nums" data-testid="text-subtotal">{fmt(subtotal)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>Pajak ({fmtRate(taxRate)})</span>
                <span className="tabular-nums" data-testid="text-tax">{fmt(tax)}</span>
              </div>
              {serviceCharge > 0 && (
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Service ({fmtRate(serviceChargeRate)})</span>
                  <span className="tabular-nums" data-testid="text-service">{fmt(serviceCharge)}</span>
                </div>
              )}
            </div>
          )}

          {/* Total row — satu baris */}
          <div className="px-3 py-2 flex items-center justify-between">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1.5 group"
              data-testid="button-toggle-pricing-details"
            >
              <span className="text-xs font-bold text-slate-500 group-hover:text-blue-600 transition-colors">Total</span>
              <ChevronUp
                size={12}
                className={`text-slate-400 group-hover:text-blue-600 transition-all ${expanded ? "" : "rotate-180"}`}
              />
            </button>
            <span className="text-base font-black text-slate-800 tabular-nums" data-testid="text-total">
              {fmt(total)}
            </span>
          </div>

          {/* Action buttons — compact */}
          <div className="px-3 pb-3 flex gap-2">
            {/* Draft: icon only */}
            <button
              onClick={onSaveDraft}
              disabled={isProcessing || items.length === 0}
              className="w-10 h-10 flex-shrink-0 bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-500 hover:text-slate-700 rounded-xl flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
              data-testid="button-save-draft"
              title="Simpan Draft"
            >
              <ShoppingBag size={16} />
            </button>

            {/* Bayar: text only, full width */}
            <button
              onClick={onCharge}
              disabled={isProcessing || items.length === 0}
              className="flex-1 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-200 flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
              data-testid="button-complete-payment"
            >
              <Banknote size={16} />
              Bayar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
