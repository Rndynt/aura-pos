// @ts-nocheck - React 19 compatibility with shadcn/ui components
import type { CartItem as CartItemType, PaymentMethod, OrderType } from "@/hooks/useCart";
import type { OrderType as DomainOrderType } from "@pos/domain/orders/types";
import { CartItem } from "./CartItem";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Drawer } from "vaul";
import { ShoppingBag, CreditCard, Printer, X, User, Banknote, Scan, ChevronDown, ChevronUp, ChefHat, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { useTenant } from "@/context/TenantContext";
import { useState, useCallback, useEffect } from "react";
import { useTables } from "@/lib/api/tableHooks";

/** Tracks visual viewport height so the drawer shrinks when the keyboard opens. */
function useVisualViewportHeight() {
  const [height, setHeight] = useState<number>(() =>
    typeof window !== 'undefined'
      ? (window.visualViewport?.height ?? window.innerHeight)
      : 812,
  );
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setHeight(vv.height);
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return height;
}

type MobileCartDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  hasPartialPayment?: boolean;
  isProcessing?: boolean;
  // New metadata props
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

export function MobileCartDrawer({
  open,
  onOpenChange,
  items,
  onUpdateQty,
  onRemove,
  onClear,
  getItemPrice,
  subtotal,
  taxRate,
  tax,
  serviceChargeRate,
  serviceCharge,
  total,
  onCharge,
  onPartialPayment,
  onSaveDraft,
  hasPartialPayment = false,
  isProcessing = false,
  customerName,
  setCustomerName,
  orderNumber,
  tableNumber,
  setTableNumber,
  paymentMethod,
  setPaymentMethod,
  continueOrderId,
  orderType: externalOrderType,
  setOrderType: externalSetOrderType,
  activeOrderTypes = [],
  setSelectedOrderTypeId,
}: MobileCartDrawerProps) {
  const { business_type, hasModule, isLoading } = useTenant();
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const { data: tablesData, isLoading: tablesLoading } = useTables();
  const vpHeight = useVisualViewportHeight();
  
  const [internalOrderType, setInternalOrderType] = useState<OrderType>('dine-in');
  const orderType = externalOrderType ?? internalOrderType;
  const setOrderType = externalSetOrderType ?? setInternalOrderType;

  const showTableNumber = !isLoading && hasModule('enable_table_management');

  const displayOrderTypes = activeOrderTypes.length > 0 
    ? activeOrderTypes.map(ot => ({
        code: ot.code.toLowerCase().replace(/_/g, '-') as OrderType,
        id: ot.id,
        name: ot.name
      }))
    : [
        { code: 'dine-in' as OrderType, id: null, name: 'Dine In' },
        { code: 'take-away' as OrderType, id: null, name: 'Take Away' },
        { code: 'delivery' as OrderType, id: null, name: 'Delivery' }
      ];

  const handleOrderTypeSelect = useCallback((type: OrderType, orderTypeId: string | null) => {
    setOrderType(type);
    
    if (setSelectedOrderTypeId && orderTypeId) {
      setSelectedOrderTypeId(orderTypeId);
    }
  }, [setOrderType, setSelectedOrderTypeId]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(price);
  };

  const formatRateLabel = (rate: number) => {
    const percentage = rate * 100;
    const decimals = Number.isInteger(percentage) ? 0 : 1;
    return `${percentage.toFixed(decimals)}%`;
  };

  return (
    <div className="md:hidden">
      <Drawer.Root open={open} onOpenChange={onOpenChange}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-[55]" />
          <Drawer.Content
            className={`fixed right-0 z-[60] bg-white border-l border-slate-200 flex flex-col shadow-2xl w-full rounded-t-[2rem]`}
            style={{
              height: `${vpHeight * 0.95}px`,
              top: `${vpHeight * 0.05}px`,
              bottom: 0,
            }}
            data-testid="drawer-mobile-cart"
          >
          {/* Drag Handle */}
          <div className="flex items-center justify-center pt-3 pb-1 rounded-t-[2rem] bg-white flex-shrink-0">
            <Drawer.Handle className="w-10 h-1 rounded-full bg-slate-300" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-4 pb-4 pt-2 border-b border-slate-100 bg-white relative z-40">
            <div className="flex items-center gap-3">
              <button
                onClick={() => onOpenChange(false)}
                className="p-1 bg-slate-100 rounded-full"
                data-testid="button-close-drawer"
              >
                <ChevronDown size={20} />
              </button>
              <h2 className="text-lg font-bold text-slate-800">Order</h2>
            </div>
            <div className="flex items-center gap-2">
              <div className="px-2 py-1 bg-blue-50 text-blue-600 text-xs font-bold rounded-md">
                {orderNumber}
              </div>
              <button
                onClick={onClear}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full"
                data-testid="button-clear-cart"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>

          {/* Content area with customer info and cart items */}
          <div className="flex-1 overflow-y-auto bg-slate-50/50 flex flex-col relative z-0 min-h-0">
            {/* Order Type & Customer Info Section */}
            <div className="p-4 bg-white border-b border-slate-100 shadow-sm z-10">
              {/* Order Type Selector */}
              <div className="bg-slate-100 p-1 rounded-xl grid gap-1 mb-4" style={{ gridTemplateColumns: `repeat(${Math.min(displayOrderTypes.length, 3)}, 1fr)` }}>
                {displayOrderTypes.map((ot) => (
                  <button
                    key={ot.code}
                    onClick={() => handleOrderTypeSelect(ot.code, ot.id)}
                    className={`text-[11px] font-bold py-2 rounded-lg capitalize flex items-center justify-center gap-1 ${
                      orderType === ot.code
                        ? 'bg-white text-slate-800 shadow-sm'
                        : 'text-slate-400'
                    }`}
                    data-testid={`button-order-type-${ot.code}`}
                  >
                    {ot.name || ot.code.replace('-', ' ')}
                  </button>
                ))}
              </div>
              
              {/* Customer Name & Table Number — compact row */}
              <div className="flex items-center gap-2">
                {/* Customer Name */}
                <div className="flex-1 flex items-center gap-2 h-10 bg-white border border-slate-200 rounded-xl px-3 min-w-0 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-50 transition-all">
                  <User size={14} className="text-slate-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="bg-transparent flex-1 text-sm text-slate-700 focus:outline-none placeholder:text-slate-300 min-w-0"
                    placeholder="Nama pelanggan"
                    data-testid="input-customer-name"
                  />
                </div>

                {/* Table Number — compact select (dine-in only) */}
                {orderType === 'dine-in' && showTableNumber && setTableNumber && (
                  <Select value={tableNumber} onValueChange={setTableNumber}>
                    <SelectTrigger
                      className="h-10 min-w-[76px] max-w-[96px] flex-shrink-0 border border-slate-200 bg-white rounded-xl px-3 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-blue-50 focus:border-blue-400 gap-1.5 transition-all"
                      data-testid="select-table-mobile"
                    >
                      <span className="truncate">{tableNumber || "–"}</span>
                    </SelectTrigger>
                    <SelectContent className="z-[100]">
                      {tablesLoading ? (
                        <div className="p-2 text-xs text-slate-400">Loading...</div>
                      ) : tablesData?.tables && tablesData.tables.length > 0 ? (
                        tablesData.tables
                          .filter(t => t.status !== 'maintenance')
                          .map((table) => (
                            <SelectItem key={table.id} value={table.tableNumber}>
                              Meja {table.tableNumber}
                            </SelectItem>
                          ))
                      ) : (
                        <div className="p-2 text-xs text-slate-400">Tidak ada meja</div>
                      )}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* Cart Items */}
            <div className="flex-1 min-h-0 p-4 space-y-3 pb-6 overflow-y-auto">
              {items.length === 0 ? (
                <div className="h-40 flex flex-col items-center justify-center text-slate-300">
                  <ShoppingBag size={48} className="mb-3 opacity-50" />
                  <p className="text-sm font-medium" data-testid="text-empty-cart">
                    Belum ada pesanan
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item) => (
                    <CartItem
                      key={item.id}
                      item={item}
                      onUpdateQty={onUpdateQty}
                      onRemove={onRemove}
                      getItemPrice={getItemPrice}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer with totals and actions */}
          {items.length > 0 && (
            <div className="flex-shrink-0 relative z-30 w-full">
              {/* Expandable Summary Section - Slides in above footer */}
              <div
                className={`overflow-hidden transition-all duration-300 ease-out bg-white/95 backdrop-blur-md border-t border-slate-200 ${
                  isSummaryExpanded ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <div className="space-y-3 px-5 py-4">
                  <div className="flex justify-between text-sm text-slate-500">
                    <span>Subtotal</span>
                    <span data-testid="text-subtotal">{formatPrice(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-500">
                    <span>Pajak ({formatRateLabel(taxRate)})</span>
                    <span data-testid="text-tax">{formatPrice(tax)}</span>
                  </div>
                  {serviceCharge > 0 && (
                    <div className="flex justify-between text-sm text-slate-500">
                      <span>Service ({formatRateLabel(serviceChargeRate)})</span>
                      <span data-testid="text-service">{formatPrice(serviceCharge)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Main Footer - ALWAYS VISIBLE */}
              <div
                className="bg-white border-t border-slate-200 p-5 shadow-[0_-5px_25px_rgba(0,0,0,0.1)] relative"
                style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 1.25rem))' }}
              >
                {/* Toggle Button */}
                <div
                  onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                  className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white border border-slate-200 text-slate-400 w-12 h-6 flex items-center justify-center rounded-full shadow-sm cursor-pointer hover:bg-slate-50 active:scale-95 transition-transform"
                  data-testid="button-toggle-pricing-details"
                >
                  <ChevronUp
                    size={16}
                    className={`transition-transform duration-300 ${
                      isSummaryExpanded ? 'rotate-180' : ''
                    }`}
                  />
                </div>

                {/* Total Section */}
                <div className="flex items-center justify-between mb-4">
                  <div
                    onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                    className="cursor-pointer group"
                  >
                    <p className="text-xs text-slate-400 font-medium group-hover:text-blue-600 transition-colors">
                      Total Tagihan
                    </p>
                    <div className="flex items-center gap-1">
                      <span className="text-2xl font-black text-slate-800" data-testid="text-total">
                        {formatPrice(total)}
                      </span>
                      <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">
                        Detail
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons - Always 2 columns: Simpan + Bayar */}
                <div className='grid grid-cols-2 gap-3'>
                  {/* Save Draft Button */}
                  <button
                    onClick={onSaveDraft}
                    disabled={isProcessing || items.length === 0}
                    className="bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-800 py-3.5 rounded-xl font-bold flex flex-col items-center justify-center leading-none gap-1 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
                    data-testid="button-save-draft"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <ShoppingBag size={18} />
                      <span>Simpan</span>
                    </div>
                    <span className="text-[9px] font-normal opacity-70">
                      Simpan Draft
                    </span>
                  </button>
                  {/* Pay Button */}
                  <button
                    onClick={onCharge}
                    disabled={isProcessing || items.length === 0}
                    className="bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-blue-200 flex flex-col items-center justify-center leading-none gap-1 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
                    data-testid="button-complete-payment"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <Banknote size={18} />
                      <span>Bayar</span>
                    </div>
                    <span className="text-[9px] opacity-80 font-normal">
                      Proses Pembayaran
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
    </div>
  );
}
