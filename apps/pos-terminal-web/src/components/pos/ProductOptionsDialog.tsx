import { useState, useEffect } from "react";
import type { Product, ProductVariant, ProductOptionGroup } from "@pos/domain/catalog/types";
import type { SelectedOption } from "@pos/domain/orders/types";
import { X, Minus, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";

interface ProductOptionsDialogProps {
  product: Product | null;
  open: boolean;
  onClose: () => void;
  onAdd: (product: Product, variant: ProductVariant | undefined, selectedOptions: SelectedOption[], qty: number) => void;
}

export function ProductOptionsDialog({
  product,
  open,
  onClose,
  onAdd,
}: ProductOptionsDialogProps) {
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | undefined>();
  const [selectedOptionsByGroup, setSelectedOptionsByGroup] = useState<Map<string, SelectedOption[]>>(new Map());
  const [qty, setQty] = useState(1);

  const isMobile = useIsMobile();
  const isDesktop = !isMobile;

  useEffect(() => {
    if (open && product) {
      setSelectedVariant(product.variants?.[0]);

      const initialSelections = new Map<string, SelectedOption[]>();
      const optionGroups = product.option_groups || [];

      optionGroups.forEach((group) => {
        if (group.is_required) {
          const availableOptions = group.options?.filter(opt => opt.is_available !== false) || [];
          if (availableOptions.length === 1) {
            const option = availableOptions[0];
            initialSelections.set(group.id, [{
              group_id: group.id,
              group_name: group.name,
              option_id: option.id,
              option_name: option.name,
              price_delta: option.price_delta,
            }]);
          }
        }
      });

      setSelectedOptionsByGroup(initialSelections);
      setQty(1);
    }
  }, [open, product]);

  if (!product || !open) return null;

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(price);

  const handleOptionToggle = (
    group: ProductOptionGroup,
    optionId: string,
    optionName: string,
    priceDelta: number,
    isAvailable: boolean
  ) => {
    if (!isAvailable) return;

    const currentSelections = selectedOptionsByGroup.get(group.id) || [];
    const isSelected = currentSelections.some(opt => opt.option_id === optionId);

    let newSelections: SelectedOption[];

    if (group.selection_type === "single") {
      newSelections = [{
        group_id: group.id,
        group_name: group.name,
        option_id: optionId,
        option_name: optionName,
        price_delta: priceDelta,
      }];
    } else {
      if (isSelected) {
        newSelections = currentSelections.filter(opt => opt.option_id !== optionId);
      } else {
        if (group.max_selections > 0 && currentSelections.length >= group.max_selections) return;
        newSelections = [
          ...currentSelections,
          { group_id: group.id, group_name: group.name, option_id: optionId, option_name: optionName, price_delta: priceDelta },
        ];
      }
    }

    const newMap = new Map(selectedOptionsByGroup);
    if (newSelections.length === 0) newMap.delete(group.id);
    else newMap.set(group.id, newSelections);
    setSelectedOptionsByGroup(newMap);
  };

  const calculateTotal = () => {
    const variantDelta = selectedVariant?.price_delta || 0;
    let optionsDelta = 0;
    selectedOptionsByGroup.forEach((selections) => {
      selections.forEach((opt) => { optionsDelta += opt.price_delta; });
    });
    return (product.base_price + variantDelta + optionsDelta) * qty;
  };

  const getAllSelectedOptions = (): SelectedOption[] => {
    const all: SelectedOption[] = [];
    selectedOptionsByGroup.forEach((s) => all.push(...s));
    return all;
  };

  const areAllRequiredOptionsFilled = () => {
    for (const group of (product?.option_groups || [])) {
      if (group.is_required) {
        const sel = selectedOptionsByGroup.get(group.id);
        if (!sel || sel.length === 0) return false;
      }
    }
    return true;
  };

  const handleAdd = () => {
    onAdd(product, selectedVariant, getAllSelectedOptions(), qty);
    onClose();
    setSelectedVariant(product.variants?.[0]);
    setSelectedOptionsByGroup(new Map());
    setQty(1);
  };

  const sortedOptionGroups = product.option_groups
    ? [...product.option_groups].sort((a, b) => a.display_order - b.display_order)
    : [];

  const total = calculateTotal();
  const canAdd = areAllRequiredOptionsFilled();

  // ── Shared body JSX — inlined in each branch to avoid remount on re-render ──
  const bodyContent = (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      {product.has_variants && product.variants && product.variants.length > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between">
            <h4 className="font-bold text-slate-700 text-sm">Variant</h4>
            <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Wajib</span>
          </div>
          {product.variants.map((variant) => {
            const isSelected = selectedVariant?.id === variant.id;
            return (
              <label
                key={variant.id}
                className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                  isSelected ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-200 hover:bg-slate-50'
                }`}
                data-testid={`option-variant-${variant.id}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`}>
                    {isSelected && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                  </div>
                  <span className={`text-sm ${isSelected ? 'font-semibold text-blue-900' : 'text-slate-600'}`}>
                    {variant.name}
                  </span>
                </div>
                {variant.price_delta !== 0 && variant.price_delta !== undefined && (
                  <span className="text-xs font-medium text-slate-500">
                    {variant.price_delta > 0 ? '+' : ''}{formatPrice(variant.price_delta)}
                  </span>
                )}
                <input type="radio" className="hidden" checked={isSelected} onChange={() => setSelectedVariant(variant)} />
              </label>
            );
          })}
        </div>
      )}

      {sortedOptionGroups.map((group) => {
        const selections = selectedOptionsByGroup.get(group.id) || [];
        return (
          <div key={group.id} className="space-y-2">
            <div className="flex justify-between">
              <h4 className="font-bold text-slate-700 text-sm">{group.name}</h4>
              {group.is_required && (
                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Wajib</span>
              )}
            </div>
            {(group.options || []).map((option) => {
              const isAvailable = option.is_available !== false;
              const isSelected = group.selection_type === "single"
                ? selections[0]?.option_id === option.id
                : selections.some(sel => sel.option_id === option.id);

              return (
                <label
                  key={option.id}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                    !isAvailable
                      ? 'border-slate-100 bg-slate-50 cursor-not-allowed opacity-50'
                      : isSelected
                      ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200 cursor-pointer'
                      : 'border-slate-200 hover:bg-slate-50 cursor-pointer'
                  }`}
                  data-testid={`option-${group.id}-${option.id}`}
                >
                  <div className="flex items-center gap-3">
                    {group.selection_type === "single" ? (
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${!isAvailable ? 'border-slate-200' : isSelected ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`}>
                        {isSelected && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                      </div>
                    ) : (
                      <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${!isAvailable ? 'border-slate-200' : isSelected ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`}>
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="13 2 6 13 3 10" />
                          </svg>
                        )}
                      </div>
                    )}
                    <div className="flex flex-col gap-0.5">
                      <span className={`text-sm ${!isAvailable ? 'text-slate-400' : isSelected ? 'font-semibold text-blue-900' : 'text-slate-600'}`}>
                        {option.name}
                      </span>
                      {!isAvailable && <span className="text-[10px] text-slate-400">Tidak tersedia</span>}
                    </div>
                  </div>
                  {option.price_delta > 0 && (
                    <span className={`text-xs font-medium ${!isAvailable ? 'text-slate-300' : 'text-slate-500'}`}>
                      +{formatPrice(option.price_delta)}
                    </span>
                  )}
                  <input
                    type={group.selection_type === 'single' ? 'radio' : 'checkbox'}
                    className="hidden"
                    checked={isSelected}
                    disabled={!isAvailable}
                    onChange={() => handleOptionToggle(group, option.id, option.name, option.price_delta, isAvailable)}
                  />
                </label>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  const footerContent = (
    <div className="p-4 bg-white border-t border-slate-200 flex items-center gap-3">
      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2">
        <button
          onClick={() => setQty(Math.max(1, qty - 1))}
          className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-100 flex items-center justify-center transition-colors"
          data-testid="button-qty-minus"
        >
          <Minus size={16} />
        </button>
        <span className="w-8 text-center font-bold text-slate-700" data-testid="text-qty">{qty}</span>
        <button
          onClick={() => setQty(qty + 1)}
          className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-100 flex items-center justify-center transition-colors"
          data-testid="button-qty-plus"
        >
          <Plus size={16} />
        </button>
      </div>
      <button
        onClick={handleAdd}
        disabled={!canAdd}
        className={`flex-1 py-3 rounded-xl font-bold flex justify-between px-4 transition-all ${
          canAdd ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
        }`}
        data-testid="button-add-to-cart"
      >
        <span>Tambah</span>
        <span>{formatPrice(total)}</span>
      </button>
    </div>
  );

  // Mobile: Drawer
  if (!isDesktop) {
    return (
      <Drawer open={open} onOpenChange={onClose}>
        <DrawerContent className="bg-white rounded-t-2xl max-h-[85vh] flex flex-col" data-testid="drawer-product-options">
          <DrawerHeader className="border-b border-slate-100 pb-4">
            <h3 className="text-lg font-bold text-slate-800">{product.name}</h3>
          </DrawerHeader>
          {bodyContent}
          {footerContent}
        </DrawerContent>
      </Drawer>
    );
  }

  // Desktop: Dialog
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="w-full max-w-md bg-white flex flex-col max-h-[85vh] p-0 gap-0"
        data-testid="dialog-product-options"
      >
        <div className="flex items-center px-4 py-4 border-b border-slate-100 flex-shrink-0 pr-12">
          <DialogTitle className="text-lg font-bold text-slate-800">{product.name}</DialogTitle>
        </div>
        {bodyContent}
        {footerContent}
      </DialogContent>
    </Dialog>
  );
}
