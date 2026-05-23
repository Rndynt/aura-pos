import type { CartItem as CartItemType } from "@/hooks/useCart";
import { Minus, Plus, MessageSquare } from "lucide-react";

type CartItemProps = {
  item: CartItemType;
  onUpdateQty: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
  onUpdateNote: (id: string, note: string) => void;
  getItemPrice: (item: CartItemType) => number;
};

export function CartItem({ item, onUpdateQty, onUpdateNote, getItemPrice }: CartItemProps) {
  const fmt = (n: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

  const unitPrice = getItemPrice(item);
  const totalPrice = unitPrice * item.quantity;
  const optionLabel = [item.variant?.name, ...(item.selectedOptions?.map(o => o.option_name) ?? [])]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="flex gap-2.5 bg-white px-3 py-2.5 rounded-xl border border-slate-100"
      data-testid={`cart-item-${item.id}`}
    >
      {/* Thumbnail */}
      <div className="w-9 h-9 rounded-lg bg-slate-100 overflow-hidden flex-shrink-0 mt-0.5">
        {item.product.image_url && (
          <img src={item.product.image_url} className="w-full h-full object-cover" alt={item.product.name} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        {/* Nama */}
        <p className="font-semibold text-slate-800 text-sm leading-tight truncate" data-testid={`text-cart-product-${item.id}`}>
          {item.product.name}
        </p>

        {/* Opsi/varian */}
        {optionLabel && (
          <p className="text-[10px] text-slate-400 leading-tight truncate">{optionLabel}</p>
        )}

        {/* Note */}
        <div className="flex items-center gap-1">
          <MessageSquare size={9} className="text-slate-300 flex-shrink-0" />
          <input
            type="text"
            value={item.note || ""}
            onChange={e => onUpdateNote(item.id, e.target.value)}
            placeholder="Catatan..."
            className="bg-transparent w-full text-[10px] text-slate-500 focus:outline-none placeholder:text-slate-300"
            data-testid={`input-item-note-${item.id}`}
          />
        </div>

        {/* Harga + qty */}
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-sm font-bold text-slate-800 tabular-nums" data-testid={`text-item-total-${item.id}`}>
            {fmt(totalPrice)}
          </span>

          <div className="flex items-center gap-1 bg-slate-50 rounded-lg p-0.5 border border-slate-100">
            <button
              onClick={() => onUpdateQty(item.id, item.quantity - 1)}
              className="w-5 h-5 bg-white rounded shadow-sm flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors"
              data-testid={`button-qty-minus-${item.id}`}
            >
              <Minus size={10} />
            </button>
            <span className="text-xs font-black w-5 text-center tabular-nums text-slate-700" data-testid={`text-qty-${item.id}`}>
              {item.quantity}
            </span>
            <button
              onClick={() => onUpdateQty(item.id, item.quantity + 1)}
              className="w-5 h-5 bg-white rounded shadow-sm flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors"
              data-testid={`button-qty-plus-${item.id}`}
            >
              <Plus size={10} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
