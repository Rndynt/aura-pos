import type { CartItem as CartItemType, PaymentMethod, OrderType, ItemDiscount } from "@/hooks/useCart";
import type { OrderType as DomainOrderType } from "@pos/domain/orders/types";
import { CartItem } from "./CartItem";
import { ShoppingBag, Banknote, ChevronUp, User, Trash2, Tag, X, Loader2, ChefHat } from "lucide-react";
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
  onSaveDraft?: () => void;
  isDraftSaving?: boolean;
  onConfirmAndKitchen?: () => void;
  hasKitchen?: boolean;
  isKitchenSending?: boolean;
  onUpdateNote?: (id: string, note: string) => void;
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
  // Discount props
  onSetItemDiscount: (id: string, discount: ItemDiscount | null) => void;
  orderDiscount: ItemDiscount | null;
  setOrderDiscount: (discount: ItemDiscount | null) => void;
  itemsDiscountTotal: number;
  orderDiscountAmount: number;
};

export function CartPanel({
  items, onUpdateQty, onRemove, onClear, getItemPrice,
  subtotal, taxRate, tax, serviceChargeRate, serviceCharge, total,
  onCharge, onSaveDraft, isDraftSaving = false, onConfirmAndKitchen, hasKitchen = false, isKitchenSending = false, onUpdateNote, isProcessing = false,
  customerName, setCustomerName, orderNumber,
  tableNumber, setTableNumber,
  orderType, setOrderType,
  activeOrderTypes = [], setSelectedOrderTypeId,
  onSetItemDiscount,
  orderDiscount, setOrderDiscount,
  itemsDiscountTotal, orderDiscountAmount,
}: CartPanelProps) {
  const { can, isLoading } = useTenant();
  const [expanded, setExpanded] = useState(false);
  const { data: tablesData } = useTables();

  const [orderDiscountOpen, setOrderDiscountOpen] = useState(false);
  const [orderDiscountType, setOrderDiscountType] = useState<"percent" | "nominal">(orderDiscount?.type ?? "percent");
  const [orderDiscountValue, setOrderDiscountValue] = useState<string>(
    orderDiscount && orderDiscount.value > 0 ? String(orderDiscount.value) : ""
  );

  const showTable = !isLoading && can("restaurant_table_service");

  const displayOrderTypes = activeOrderTypes.length > 0
    ? activeOrderTypes.map(ot => ({
        code: ot.code.toLowerCase().replace(/_/g, "-") as OrderType,
        id: ot.id,
        name: ot.name,
        needTableNumber: ot.needTableNumber ?? false,
      }))
    : [
        { code: "dine-in" as OrderType, id: null, name: "Dine In", needTableNumber: true },
        { code: "take-away" as OrderType, id: null, name: "Take Away", needTableNumber: false },
        { code: "delivery" as OrderType, id: null, name: "Delivery", needTableNumber: false },
      ];

  const currentOrderType = displayOrderTypes.find(ot => ot.code === orderType);
  const orderTypeNeedsTable = currentOrderType?.needTableNumber ?? orderType === "dine-in";

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

  const handleOpenOrderDiscount = () => {
    setOrderDiscountType(orderDiscount?.type ?? "percent");
    setOrderDiscountValue(orderDiscount && orderDiscount.value > 0 ? String(orderDiscount.value) : "");
    setOrderDiscountOpen(true);
  };

  const handleApplyOrderDiscount = () => {
    const val = parseFloat(orderDiscountValue);
    if (!orderDiscountValue || isNaN(val) || val <= 0) {
      setOrderDiscount(null);
    } else {
      setOrderDiscount({ type: orderDiscountType, value: val });
    }
    setOrderDiscountOpen(false);
  };

  const hasOrderDiscount = orderDiscount && orderDiscount.value > 0;
  const totalDiscountAmount = itemsDiscountTotal + orderDiscountAmount;

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
          style={{ gridTemplateColumns: `repeat(${displayOrderTypes.length <= 3 ? displayOrderTypes.length : 2}, 1fr)` }}
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
          {orderTypeNeedsTable && showTable && setTableNumber && (
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
      <div className="flex-1 overflow-y-auto min-h-0">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2 p-4">
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
              onSetDiscount={onSetItemDiscount}
            />
          ))
        )}
      </div>

      {/* ── FOOTER (compact) ── */}
      {items.length > 0 && (
        <div className="flex-shrink-0 bg-white border-t border-slate-200 shadow-[0_-4px_16px_rgba(0,0,0,0.07)]">

          {/* Expanded detail */}
          {expanded && (
            <div className="px-3 py-2 border-b border-slate-100 space-y-1.5 bg-slate-50/80">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Subtotal</span>
                <span className="tabular-nums" data-testid="text-subtotal">{fmt(subtotal + itemsDiscountTotal)}</span>
              </div>

              {/* Per-item discounts total */}
              {itemsDiscountTotal > 0 && (
                <div className="flex justify-between text-xs text-green-600">
                  <span>Diskon item</span>
                  <span className="tabular-nums" data-testid="text-items-discount">-{fmt(itemsDiscountTotal)}</span>
                </div>
              )}

              {/* Order-level discount row */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1">
                  <span className={hasOrderDiscount ? "text-green-600 font-medium" : "text-slate-500"}>
                    Diskon pesanan
                  </span>
                  {hasOrderDiscount && (
                    <button
                      onClick={() => { setOrderDiscount(null); setOrderDiscountValue(""); }}
                      className="text-red-400 hover:text-red-500 transition-colors"
                      data-testid="button-clear-order-discount"
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {hasOrderDiscount && !orderDiscountOpen && (
                    <span className="tabular-nums text-green-600" data-testid="text-order-discount">
                      -{fmt(orderDiscountAmount)}
                    </span>
                  )}
                  {!orderDiscountOpen && (
                    <button
                      onClick={handleOpenOrderDiscount}
                      className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors ${
                        hasOrderDiscount
                          ? "bg-green-50 text-green-600 hover:bg-green-100"
                          : "bg-slate-100 text-slate-400 hover:bg-amber-50 hover:text-amber-600"
                      }`}
                      data-testid="button-add-order-discount"
                    >
                      <Tag size={9} />
                      {hasOrderDiscount
                        ? `${orderDiscount.type === "percent" ? `${orderDiscount.value}%` : fmt(orderDiscount.value)}`
                        : "+ Tambah"}
                    </button>
                  )}
                </div>
              </div>

              {/* Inline order discount editor */}
              {orderDiscountOpen && (
                <div className="flex items-center gap-1 p-1.5 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex rounded-md overflow-hidden border border-amber-300 flex-shrink-0">
                    <button
                      onClick={() => setOrderDiscountType("percent")}
                      className={`text-[10px] font-bold px-1.5 py-0.5 transition-colors ${
                        orderDiscountType === "percent" ? "bg-amber-400 text-white" : "text-amber-600 bg-white"
                      }`}
                      data-testid="button-order-discount-type-percent"
                    >
                      %
                    </button>
                    <button
                      onClick={() => setOrderDiscountType("nominal")}
                      className={`text-[10px] font-bold px-1.5 py-0.5 transition-colors ${
                        orderDiscountType === "nominal" ? "bg-amber-400 text-white" : "text-amber-600 bg-white"
                      }`}
                      data-testid="button-order-discount-type-nominal"
                    >
                      Rp
                    </button>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max={orderDiscountType === "percent" ? "100" : undefined}
                    value={orderDiscountValue}
                    onChange={e => setOrderDiscountValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") handleApplyOrderDiscount();
                      if (e.key === "Escape") setOrderDiscountOpen(false);
                    }}
                    placeholder={orderDiscountType === "percent" ? "0-100" : "Nominal"}
                    className="flex-1 min-w-0 text-[11px] bg-white border border-amber-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-amber-400 text-slate-700"
                    autoFocus
                    data-testid="input-order-discount"
                  />
                  <button
                    onClick={handleApplyOrderDiscount}
                    className="px-2 py-0.5 bg-amber-400 hover:bg-amber-500 text-white rounded text-[10px] font-bold transition-colors flex-shrink-0"
                    data-testid="button-apply-order-discount"
                  >
                    OK
                  </button>
                  <button
                    onClick={() => setOrderDiscountOpen(false)}
                    className="w-5 h-5 flex-shrink-0 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded flex items-center justify-center transition-colors"
                    data-testid="button-cancel-order-discount"
                  >
                    <X size={10} />
                  </button>
                </div>
              )}

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

              {totalDiscountAmount > 0 && (
                <div className="flex justify-between text-xs font-semibold text-green-600 border-t border-slate-100 pt-1.5">
                  <span>Total hemat</span>
                  <span className="tabular-nums" data-testid="text-total-discount">-{fmt(totalDiscountAmount)}</span>
                </div>
              )}
            </div>
          )}

          {/* Total row */}
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
              {totalDiscountAmount > 0 && (
                <span className="text-[9px] font-bold text-green-600 bg-green-50 px-1 py-0.5 rounded">
                  Hemat {fmt(totalDiscountAmount)}
                </span>
              )}
            </button>
            <span className="text-base font-black text-slate-800 tabular-nums" data-testid="text-total">
              {fmt(total)}
            </span>
          </div>

          {/* Action buttons */}
          <div className="px-3 pb-3 flex gap-2">
            <button
              onClick={onSaveDraft}
              disabled={isProcessing || isDraftSaving || items.length === 0}
              className="w-10 h-10 flex-shrink-0 bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-500 hover:text-slate-700 rounded-xl flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
              data-testid="button-save-draft"
              title={isDraftSaving ? "Menyimpan..." : "Tunda — simpan draft, lanjut nanti"}
            >
              {isDraftSaving
                ? <Loader2 size={16} className="animate-spin text-blue-500" />
                : <ShoppingBag size={16} />
              }
            </button>

            {hasKitchen && (
              <button
                onClick={onConfirmAndKitchen}
                disabled={isProcessing || isKitchenSending || items.length === 0}
                className="flex-1 h-10 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
                data-testid="button-confirm-and-kitchen"
                title="Konfirmasi pesanan & kirim ke dapur — bayar belakangan"
              >
                {isKitchenSending
                  ? <Loader2 size={16} className="animate-spin" />
                  : <ChefHat size={16} />
                }
                Dapur
              </button>
            )}

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
