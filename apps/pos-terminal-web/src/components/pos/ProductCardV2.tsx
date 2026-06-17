import { useState } from "react";
import type { Product } from "@pos/domain/catalog/types";
import { SlidersHorizontal } from "lucide-react";
import { formatIDR } from "@/lib/design-tokens";
import { ProductAvatar } from "@/components/ui/ProductAvatar";

type ProductCardProps = {
  product: Product;
  onAddToCart: (product: Product) => void;
};

export function ProductCard({ product, onAddToCart }: ProductCardProps) {
  const [imageFailed, setImageFailed] = useState(false);

  const hasVariants = product.has_variants || (product.option_groups && product.option_groups.length > 0);
  const isUnavailable = !product.is_active;

  return (
    <div
      onClick={() => onAddToCart(product)}
      className={`group bg-white rounded-xl p-2.5 shadow-sm border border-slate-100 active:scale-98 hover:shadow-md relative h-full flex flex-col transition-transform duration-150 ${
        isUnavailable ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      }`}
      data-testid={`card-product-${product.id}`}
    >
      {/* Product Image */}
      <div className="relative w-full aspect-[4/3] overflow-hidden rounded-lg mb-2 bg-slate-100">
        {product.image_url && !imageFailed ? (
          <img
            src={product.image_url}
            alt={product.name}
            className={`w-full h-full object-cover transition-transform duration-500 ${
              isUnavailable ? "" : "group-hover:scale-105"
            }`}
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <ProductAvatar name={product.name} textClassName="text-2xl font-bold" />
        )}


        {/* Unavailable Overlay */}
        {isUnavailable && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="text-white font-semibold text-sm">Tidak Tersedia</span>
          </div>
        )}

        {/* Variants Indicator - Bottom Right */}
        {hasVariants && (
          <div className="absolute bottom-1.5 right-1.5 bg-white/90 text-slate-800 p-1 rounded shadow-sm">
            <SlidersHorizontal size={14} />
          </div>
        )}
      </div>

      {/* Product Info */}
      <div className="flex-1 flex flex-col">
        <h3
          className="font-bold text-slate-700 text-sm leading-tight mb-1 line-clamp-2"
          data-testid={`text-product-name-${product.id}`}
        >
          {product.name}
        </h3>
        <div className="mt-auto">
          <span
            className="text-blue-600 font-bold text-base"
            data-testid={`text-price-${product.id}`}
          >
            {formatIDR(product.base_price).replace(',00', '')}
          </span>
        </div>
      </div>
    </div>
  );
}
