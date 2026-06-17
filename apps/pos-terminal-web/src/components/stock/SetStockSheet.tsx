import { useEffect, useState } from "react";
import { Minus, Plus, Package, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { useSetStock, type StockProduct } from "@/hooks/api/useInventory";

export type SetStockSheetProps = {
  product: StockProduct;
  outletName?: string | null;
  onClose: () => void;
};

/**
 * Set Stok / Ubah Stok — direct outlet stock entry.
 *
 * Uses Drawer-style bottom sheet on mobile and centered Dialog on tablet/desktop.
 * Writes via PUT /api/inventory/products/:id/adjust with mode "set" which targets
 * the active outlet's inventory_balances. First stock input and later correction
 * are the same action; if Stok Lanjutan is active, the backend records an
 * ADJUSTMENT_IN/ADJUSTMENT_OUT movement based on the delta.
 */
export function SetStockSheet({ product, outletName, onClose }: SetStockSheetProps) {
  const isMobile = useIsMobile();
  const setStock = useSetStock();
  const { addToast } = useToast();

  const [quantity, setQuantity] = useState<string>(String(product.stockQty ?? 0));
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setQuantity(String(product.stockQty ?? 0));
  }, [product.id, product.stockQty]);

  const parsed = parseInt(quantity, 10);
  const nextQty = Number.isFinite(parsed) ? parsed : 0;
  const before = product.stockQty ?? 0;
  const delta = nextQty - before;
  const isFirstEntry = before === 0 && nextQty > 0 && !product.isLowStock && !product.isOutOfStock;
  const isInvalid = !Number.isFinite(parsed) || parsed < 0;
  const isUnchanged = parsed === before;

  const handleSubmit = async () => {
    if (isInvalid) {
      addToast("Jumlah stok tidak valid", "error");
      return;
    }
    try {
      await setStock.mutateAsync({
        productId: product.id,
        quantity: nextQty,
        notes: notes.trim() || undefined,
      });
      addToast(
        isUnchanged
          ? "Stok tetap, tidak ada perubahan"
          : delta > 0
            ? `Stok ditambah ${delta} unit`
            : `Stok dikurangi ${Math.abs(delta)} unit`,
        "success",
      );
      onClose();
    } catch (err: any) {
      const msg = err?.message?.includes("negatif")
        ? "Stok tidak boleh negatif"
        : err?.message?.includes("Outlet")
          ? "Outlet aktif diperlukan untuk mengatur stok"
          : "Gagal menyimpan stok";
      addToast(msg, "error");
    }
  };

  const adjustBy = (step: number) => {
    setQuantity((v) => {
      const n = parseInt(v || "0", 10);
      const next = Math.max(0, (Number.isFinite(n) ? n : 0) + step);
      return String(next);
    });
  };

  const title = before === 0 ? "Set Stok" : "Ubah Stok";

  const body = (
    <>
      <div className="flex items-start gap-3 pb-3 border-b border-slate-100">
        <div className="w-11 h-11 bg-slate-100 rounded-xl overflow-hidden flex-shrink-0">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-300">
              <Package size={18} />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-800 text-sm truncate">{product.name}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
            <span className="text-[11px] text-slate-400">{product.category}</span>
            {product.sku && <span className="text-[11px] text-slate-400">SKU: {product.sku}</span>}
            {outletName && (
              <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                {outletName}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2 pt-3">
        <label className="text-xs font-bold text-slate-500">Jumlah Stok</label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => adjustBy(-1)}
            data-testid="set-stock-decrement"
            className="w-10 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600"
          >
            <Minus size={16} />
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
              if (e.key === "Escape") onClose();
            }}
            data-testid="set-stock-input"
            className="flex-1 h-11 text-center border border-slate-200 rounded-xl px-3 text-base font-black focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            autoFocus
          />
          <button
            type="button"
            onClick={() => adjustBy(1)}
            data-testid="set-stock-increment"
            className="w-10 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div className="bg-slate-50 rounded-xl p-3 mt-3 flex items-center justify-between text-sm">
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase">Sekarang</p>
          <p className="font-bold text-slate-700">{before}</p>
        </div>
        <span className="text-slate-300 font-bold">→</span>
        <div className="text-right">
          <p className="text-[10px] font-bold text-slate-400 uppercase">Menjadi</p>
          <p
            className={`font-black text-base ${
              isInvalid
                ? "text-red-600"
                : nextQty === 0
                  ? "text-red-500"
                  : nextQty < (product.lowStockThreshold ?? 10)
                    ? "text-orange-600"
                    : "text-emerald-600"
            }`}
          >
            {Number.isFinite(parsed) ? nextQty : "-"}
          </p>
        </div>
        <div className="text-right min-w-[64px]">
          <p className="text-[10px] font-bold text-slate-400 uppercase">Δ</p>
          <p
            className={`font-black ${
              delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-500" : "text-slate-400"
            }`}
          >
            {delta > 0 ? `+${delta}` : delta}
          </p>
        </div>
      </div>

      {isFirstEntry && (
        <p className="mt-2 text-[11px] text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
          Ini akan menjadi stok awal untuk outlet ini. Aksi yang sama dipakai untuk koreksi nanti.
        </p>
      )}

      <div className="space-y-1.5 pt-3">
        <label className="text-xs font-bold text-slate-500">Catatan (opsional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Contoh: stok awal pembukaan outlet"
          data-testid="set-stock-notes"
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none h-16"
        />
      </div>

      <div className="flex gap-2 pt-3">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50"
        >
          Batal
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={setStock.isPending || isInvalid}
          data-testid="set-stock-submit"
          className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
        >
          {setStock.isPending ? "Menyimpan..." : "Simpan"}
        </button>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center"
        onClick={onClose}
        data-testid="set-stock-sheet-mobile"
      >
        <div
          className="bg-white rounded-t-2xl w-full max-h-[92vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 pt-3 pb-2 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-800 text-base">{title}</h3>
              <p className="text-[11px] text-slate-400">Stok & Inventaris</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 hover:bg-slate-100 rounded-lg"
              aria-label="Tutup"
            >
              <X size={18} />
            </button>
          </div>
          <div className="overflow-y-auto px-4 pb-5">{body}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="set-stock-sheet-desktop"
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md p-5 space-y-1"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-bold text-slate-800 text-base">{title}</h3>
            <p className="text-[11px] text-slate-400">Stok & Inventaris</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg"
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}
