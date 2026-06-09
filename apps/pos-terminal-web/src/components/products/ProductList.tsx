import { useState } from "react";
import { ChevronDown, ChevronRight, Layers, Trash2 } from "lucide-react";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { ProductAvatar } from "@/components/ui/ProductAvatar";

interface ProductListProps {
  products: any[];
  onProductClick: (product: any) => void;
  onToggleProduct?: (productId: string, newStatus: boolean) => void;
}

const formatIDR = (price: number | string) => {
  const numPrice = typeof price === "string" ? parseFloat(price) : price;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(numPrice);
};

export default function ProductList({ 
  products, 
  onProductClick,
  onToggleProduct 
}: ProductListProps) {
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const groupedProducts = products.reduce((acc: Record<string, any[]>, product: any) => {
    const cat = product.category || "Uncategorized";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(product);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {Object.entries(groupedProducts).map(([category, items]: [string, any[]]) => {
        const isCollapsed = collapsedCategories[category];
        return (
          <div
            key={category}
            className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
            data-testid={`category-${category}`}
          >
            <div
              onClick={() => toggleCategory(category)}
              className="p-4 bg-slate-50 flex justify-between items-center cursor-pointer hover:bg-slate-100 transition-colors"
              data-testid={`category-header-${category}`}
            >
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-700 capitalize">{category}</h3>
                <span className="bg-slate-200 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {items.length}
                </span>
              </div>
              <div
                className={`text-slate-400 transition-transform duration-300 ${
                  isCollapsed ? "-rotate-90" : "rotate-0"
                }`}
              >
                <ChevronDown size={20} />
              </div>
            </div>

            {!isCollapsed && (
              <div className="divide-y divide-slate-100 animate-in slide-in-from-top-2">
                {items.map((product: any) => {
                  const price = product.base_price || product.basePrice || 0;
                  const stock = product.stock_qty ?? product.stockQty ?? 0;
                  const variantsCount = product.option_groups?.length || 0;
                  const imageUrl = product.image_url || product.imageUrl || "";
                  const isAvailable = product.is_active !== false;

                  return (
                    <div
                      key={product.id}
                      className={`p-3 flex items-center gap-4 transition-colors group ${
                        isAvailable ? "hover:bg-blue-50" : "bg-slate-50 opacity-70"
                      }`}
                      data-testid={`product-card-${product.id}`}
                    >
                      <div 
                        onClick={() => onProductClick(product)}
                        className="flex-1 min-w-0 flex items-center gap-4 cursor-pointer"
                      >
                        <div className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0 relative">
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              className={`w-full h-full object-cover ${!isAvailable ? "grayscale" : ""}`}
                              alt={product.name}
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty('display', 'flex'); }}
                            />
                          ) : null}
                          <div style={{ display: imageUrl ? 'none' : 'flex' }} className="w-full h-full">
                            <ProductAvatar name={product.name} textClassName="text-base font-bold" />
                          </div>
                          {!isAvailable && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                              <span className="bg-slate-800 text-white text-[8px] font-bold px-1 rounded">
                                OFF
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start">
                            <h4 className="font-bold text-slate-800 truncate">
                              {product.name}
                            </h4>
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="font-bold text-blue-600 text-xs">
                              {formatIDR(price)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                stock < 10
                                  ? "bg-red-100 text-red-600"
                                  : "bg-green-100 text-green-600"
                              }`}
                            >
                              Stok: {stock}
                            </span>
                            {variantsCount > 0 && (
                              <span className="flex items-center gap-1 text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                <Layers size={10} /> {variantsCount} Varian
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="pl-4 border-l border-slate-100 flex flex-col items-center gap-1">
                        <ToggleSwitch
                          size="sm"
                          checked={isAvailable}
                          onChange={(val) => {
                            if (onToggleProduct) {
                              onToggleProduct(product.id, val);
                            }
                          }}
                          data-testid={`toggle-product-${product.id}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
