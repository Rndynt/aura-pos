import { useState, useMemo } from "react";
import type { Product } from "@pos/domain/catalog/types";
import type { Order } from "@pos/domain/orders/types";
import { ProductCard } from "./ProductCardV2";
import { ModernPOSHeader } from "./shared/ModernPOSHeader";
import { CategoryChip } from "./shared/CategoryChip";
import { getCategoryIcon } from "@/lib/design-tokens";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { OrderQueue } from "@/components/kitchen-display/OrderQueue";
import { useTenant } from "@/context/TenantContext";
import { useOpenOrders } from "@/lib/api/tableHooks";
import { useCategories } from "@/hooks/api/useCategories";
import { useQuery } from "@tanstack/react-query";
import { listLocalDraftOrders } from "@pos/offline";

const DEFAULT_CATEGORY = "All";

type ProductAreaProps = {
  products: Product[];
  isLoading?: boolean;
  error?: Error | null;
  onAddToCart: (product: Product) => void;
  orders?: Order[];
  onUpdateOrderStatus?: (orderId: string, status: string) => Promise<void>;
  onOpenDraftSheet?: () => void;
};

// Extract unique categories from products
const getCategories = (products: Product[], orderedCategoryNames: string[]): string[] => {
  if (!products || products.length === 0) {
    return [DEFAULT_CATEGORY];
  }

  const categorySet = new Set(products.map((p) => p.category).filter(Boolean));
  const ordered = orderedCategoryNames.filter((name) => categorySet.has(name));
  const leftovers = Array.from(categorySet).filter((name) => !ordered.includes(name)).sort();

  return [DEFAULT_CATEGORY, ...ordered, ...leftovers];
};

// Filter products by category
const filterByCategory = (products: Product[], category: string): Product[] => {
  if (!products || products.length === 0 || category === DEFAULT_CATEGORY) {
    return products;
  }
  return products.filter(p => p.category === category);
};

// Group products by category, preserving order
const groupByCategory = (products: Product[], orderedCategoryNames: string[]): { category: string; items: Product[] }[] => {
  const map = new Map<string, Product[]>();
  for (const p of products) {
    const cat = p.category || "Lainnya";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(p);
  }
  const unordered = Array.from(map.entries()).map(([category, items]) => ({ category, items }));
  const orderIndex = new Map(orderedCategoryNames.map((name, index) => [name, index]));
  return unordered.sort((a, b) => (orderIndex.get(a.category) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b.category) ?? Number.MAX_SAFE_INTEGER));
};

export function ProductArea({ 
  products, 
  isLoading, 
  error, 
  onAddToCart,
  orders = [],
  onUpdateOrderStatus,
  onOpenDraftSheet,
}: ProductAreaProps) {
  const [selectedCategory, setSelectedCategory] = useState(DEFAULT_CATEGORY);
  const [searchQuery, setSearchQuery] = useState("");
  const [isOrderQueueExpanded, setIsOrderQueueExpanded] = useState(false);
  const { can } = useTenant();
  const isOrderQueueEnabled = can("orders_queue");
  const { data: openOrdersData } = useOpenOrders();
  const { data: categories = [] } = useCategories();
  const orderedCategoryNames = useMemo(() => categories.map((c) => c.name), [categories]);
  const serverDraftCount = (openOrdersData?.orders ?? []).filter((o) => o.paymentStatus !== "paid").length;
  const { tenantId } = useTenant();
  const { data: localDrafts = [] } = useQuery({
    queryKey: ["local-drafts", tenantId],
    queryFn: () => listLocalDraftOrders(tenantId),
    refetchInterval: 30_000,
  });
  const draftCount = serverDraftCount + localDrafts.length;

  const categoryNames = useMemo(() => getCategories(products, orderedCategoryNames), [products, orderedCategoryNames]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (normalizedQuery) {
      return products.filter((product) =>
        product.name.toLowerCase().includes(normalizedQuery)
      );
    }
    return filterByCategory(products, selectedCategory);
  }, [products, selectedCategory, searchQuery]);

  const isGroupedView = !searchQuery.trim() && selectedCategory === DEFAULT_CATEGORY;
  const groupedProducts = useMemo(
    () => (isGroupedView ? groupByCategory(filteredProducts, orderedCategoryNames) : []),
    [isGroupedView, filteredProducts, orderedCategoryNames]
  );

  return (
    <div className="flex flex-col bg-slate-50/50 h-full min-h-0 overflow-x-hidden w-full max-w-full">
      {/* Order Queue - shown when order_queue feature is enabled */}
      {isOrderQueueEnabled && orders.length > 0 && onUpdateOrderStatus && (
        <div className="border-b border-slate-200 bg-white flex-shrink-0">
          <OrderQueue
            orders={orders}
            onUpdateStatus={onUpdateOrderStatus}
            onExpandChange={setIsOrderQueueExpanded}
          />
        </div>
      )}

      {/* Search bar + Draft button — on top, full width */}
      <div className="px-4 pt-3 pb-2 bg-white border-b border-slate-100 flex-shrink-0">
        <ModernPOSHeader
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchDisabled={isLoading}
          isLoading={isLoading}
          onDraftClick={onOpenDraftSheet}
          draftCount={draftCount}
        />
      </div>

      {/* Category Chips — edge-to-edge horizontal scroll */}
      <div className="py-2 bg-white border-b border-slate-100 flex-shrink-0">
        <div className="flex gap-2 overflow-x-auto no-scrollbar px-4">
          {isLoading ? (
            <>
              <Skeleton className="h-8 w-20 rounded-full flex-shrink-0" />
              <Skeleton className="h-8 w-16 rounded-full flex-shrink-0" />
              <Skeleton className="h-8 w-16 rounded-full flex-shrink-0" />
            </>
          ) : (
            categoryNames.map((category) => (
              <CategoryChip
                key={category}
                id={category}
                name={category}
                isActive={selectedCategory === category}
                onClick={() => setSelectedCategory(category)}
              />
            ))
          )}
        </div>
      </div>

      {/* Product Grid */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 md:px-8 pt-3 pb-32 md:pb-8">
        {error ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center" data-testid="text-error">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <p className="font-semibold text-slate-700 mb-1">Gagal memuat produk</p>
            <p className="text-sm text-slate-400 max-w-xs">
              {error.message?.includes("Tenant")
                ? "Sesi login Anda tidak valid. Silakan keluar lalu masuk kembali."
                : "Terjadi kesalahan saat memuat menu. Periksa koneksi internet Anda."}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-5 px-5 py-2 bg-slate-800 text-white text-sm font-medium rounded-xl hover:bg-slate-700 transition-colors"
            >
              Coba Lagi
            </button>
          </div>
        ) : isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center" data-testid="text-no-products">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <p className="font-semibold text-slate-600 mb-1">Produk tidak ditemukan</p>
            <p className="text-sm text-slate-400">
              {searchQuery ? `Tidak ada produk yang cocok dengan "${searchQuery}"` : "Belum ada produk di kategori ini"}
            </p>
          </div>
        ) : isGroupedView ? (
          <div className="space-y-6">
            {groupedProducts.map(({ category, items }) => (
              <div key={category}>
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-sm font-bold text-slate-700 tracking-wide">{category}</h3>
                  <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{items.length}</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                  {items.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onAddToCart={onAddToCart}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCart={onAddToCart}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProductCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <Skeleton className="aspect-[4/3] w-full" />
        <div className="p-3 space-y-2">
          <Skeleton className="h-4 md:h-5 w-3/4" />
          <Skeleton className="h-5 md:h-6 w-1/2" />
          <div className="flex gap-2">
            <Skeleton className="h-4 md:h-5 w-16" />
          </div>
        </div>
      </CardContent>
      <CardFooter className="p-3 pt-0">
        <Skeleton className="h-9 w-full" />
      </CardFooter>
    </Card>
  );
}
