import { useState } from "react";
import type { CartItem as CartItemType, ItemDiscount } from "@/hooks/useCart";
import { getItemDiscountAmount, getItemLineSubtotal, getItemEffectiveTotal } from "@/hooks/useCart";
import { Minus, Plus, MessageSquare, Tag, X, Check } from "lucide-react";
import { ProductAvatar } from "@/components/ui/ProductAvatar";

type CartItemProps = {
  item: CartItemType;
  onUpdateQty: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
  onUpdateNote: (id: string, note: string) => void;
  getItemPrice: (item: CartItemType) => number;
  onSetDiscount: (id: string, discount: ItemDiscount | null) => void;
};

export function CartItem({ item, onUpdateQty, onUpdateNote, onSetDiscount }: CartItemProps) {
  const fmt = (n: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountType, setDiscountType] = useState<"percent" | "nominal">(item.discount?.type ?? "percent");
  const [discountValue, setDiscountValue] = useState<string>(
    item.discount && item.discount.value > 0 ? String(item.discount.value) : ""
  );

  const totalPrice = getItemLineSubtotal(item);
  const discountAmount = getItemDiscountAmount(item);
  const hasDiscount = discountAmount > 0;
  const effectiveTotal = getItemEffectiveTotal(item);

  const optionLabel = [item.variant?.name, ...(item.selectedOptions?.map(o => o.option_name) ?? [])]
    .filter(Boolean)
    .join(" · ");

  const handleOpenDiscount = () => {
    setDiscountType(item.discount?.type ?? "percent");
    setDiscountValue(item.discount && item.discount.value > 0 ? String(item.discount.value) : "");
    setDiscountOpen(true);
  };

  const handleApplyDiscount = () => {
    const val = parseFloat(discountValue);
    if (!discountValue || isNaN(val) || val <= 0) {
      onSetDiscount(item.id, null);
    } else {
      onSetDiscount(item.id, { type: discountType, value: val });
    }
    setDiscountOpen(false);
  };

  const handleClearDiscount = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSetDiscount(item.id, null);
    setDiscountValue("");
    setDiscountOpen(false);
  };

  return (
    <div
      className="flex items-start gap-2.5 px-3 py-2.5 border-b border-slate-100 last:border-0"
      data-testid={`cart-item-${item.id}`}
    >
      {/* Thumbnail */}
      <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100">
        {item.product.image_url ? (
          <img
            src={item.product.image_url}
            className="w-full h-full object-cover"
            alt={item.product.name}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
              (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty('display', 'flex');
            }}
          />
        ) : null}
        <div style={{ display: item.product.image_url ? 'none' : 'flex' }} className="w-full h-full">
          <ProductAvatar name={item.product.name} textClassName="text-xs font-bold" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Top row: name + qty controls */}
        <div className="flex items-start gap-2 justify-between">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-800 text-xs leading-tight truncate" data-testid={`text-cart-product-${item.id}`}>
              {item.product.name}
            </p>
            {optionLabel && (
              <p className="text-[9px] text-slate-400 leading-tight truncate mt-0.5">{optionLabel}</p>
            )}
          </div>

          {/* Qty controls */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 flex-shrink-0">
            <button
              onClick={() => onUpdateQty(item.id, item.quantity - 1)}
              className="w-5 h-5 bg-white rounded-md shadow-sm flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors"
              data-testid={`button-qty-minus-${item.id}`}
            >
              <Minus size={9} />
            </button>
            <span className="text-xs font-black w-5 text-center tabular-nums text-slate-800" data-testid={`text-qty-${item.id}`}>
              {item.quantity}
            </span>
            <button
              onClick={() => onUpdateQty(item.id, item.quantity + 1)}
              className="w-5 h-5 bg-white rounded-md shadow-sm flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors"
              data-testid={`button-qty-plus-${item.id}`}
            >
              <Plus size={9} />
            </button>
          </div>
        </div>

        {/* Bottom row: note + price + discount */}
        <div className="flex items-center justify-between mt-1.5 gap-2">
          {/* Note input */}
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <MessageSquare size={8} className="text-slate-300 flex-shrink-0" />
            <input
              type="text"
              value={item.note || ""}
              onChange={e => onUpdateNote(item.id, e.target.value)}
              placeholder="Catatan..."
              className="bg-transparent w-full text-[10px] text-slate-400 focus:outline-none placeholder:text-slate-300 focus:text-slate-600 min-w-0"
              data-testid={`input-item-note-${item.id}`}
            />
          </div>

          {/* Price + discount */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Diskon item button */}
            <button
              onClick={discountOpen ? () => setDiscountOpen(false) : handleOpenDiscount}
              className={`flex items-center justify-center w-4 h-4 rounded transition-colors ${
                hasDiscount
                  ? "text-amber-500 bg-amber-50 hover:bg-amber-100"
                  : "text-slate-300 hover:text-amber-500 hover:bg-amber-50"
              }`}
              title="Diskon item"
              data-testid={`button-item-discount-${item.id}`}
            >
              <Tag size={9} />
            </button>

            {/* Price display */}
            <div className="text-right">
              {hasDiscount ? (
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-slate-400 line-through tabular-nums leading-none">
                    {fmt(totalPrice)}
                  </span>
                  <span className="text-xs font-bold text-emerald-600 tabular-nums" data-testid={`text-item-total-${item.id}`}>
                    {fmt(effectiveTotal)}
                  </span>
                  <button
                    onClick={handleClearDiscount}
                    className="text-[8px] font-bold bg-red-50 text-red-400 hover:text-red-600 hover:bg-red-100 px-1 py-0.5 rounded transition-colors leading-none"
                    title="Hapus diskon"
                    data-testid={`button-clear-discount-${item.id}`}
                  >
                    -{item.discount?.type === "percent" ? `${item.discount.value}%` : fmt(discountAmount)}
                  </button>
                </div>
              ) : (
                <span className="text-xs font-bold text-slate-800 tabular-nums" data-testid={`text-item-total-${item.id}`}>
                  {fmt(totalPrice)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Inline discount editor */}
        {discountOpen && (
          <div className="flex items-center gap-1 mt-1.5 p-1.5 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex rounded-md overflow-hidden border border-amber-300 flex-shrink-0">
              <button
                onClick={() => setDiscountType("percent")}
                className={`text-[9px] font-bold px-1.5 py-0.5 transition-colors ${
                  discountType === "percent" ? "bg-amber-400 text-white" : "text-amber-600 bg-white"
                }`}
                data-testid={`button-discount-type-percent-${item.id}`}
              >
                %
              </button>
              <button
                onClick={() => setDiscountType("nominal")}
                className={`text-[9px] font-bold px-1.5 py-0.5 transition-colors ${
                  discountType === "nominal" ? "bg-amber-400 text-white" : "text-amber-600 bg-white"
                }`}
                data-testid={`button-discount-type-nominal-${item.id}`}
              >
                Rp
              </button>
            </div>

            <input
              type="number"
              min="0"
              max={discountType === "percent" ? "100" : undefined}
              value={discountValue}
              onChange={e => setDiscountValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") handleApplyDiscount();
                if (e.key === "Escape") setDiscountOpen(false);
              }}
              placeholder={discountType === "percent" ? "0-100" : "Nominal"}
              className="flex-1 min-w-0 text-[10px] bg-white border border-amber-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-amber-400 text-slate-700"
              autoFocus
              data-testid={`input-item-discount-${item.id}`}
            />

            <button
              onClick={handleApplyDiscount}
              className="w-5 h-5 flex-shrink-0 bg-amber-400 hover:bg-amber-500 text-white rounded flex items-center justify-center transition-colors"
              data-testid={`button-apply-discount-${item.id}`}
            >
              <Check size={9} />
            </button>

            <button
              onClick={() => setDiscountOpen(false)}
              className="w-5 h-5 flex-shrink-0 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded flex items-center justify-center transition-colors"
              data-testid={`button-cancel-discount-${item.id}`}
            >
              <X size={9} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
