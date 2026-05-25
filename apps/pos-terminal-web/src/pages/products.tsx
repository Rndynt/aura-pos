import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Plus,
  ChevronDown,
  Layers,
  Trash2,
  GripVertical,
  Search,
  X,
  Store,
  Lock,
} from "lucide-react";
import { useFeatures } from "@/hooks/useFeatures";
import { PageHeader } from "@/components/design";
import { useProducts, useCreateProduct, useUpdateProduct } from "@/hooks/api/useProducts";
import { useVariantsLibrary, useCreateOrUpdateVariant, type Variant } from "@/hooks/useVariants";
import { useCategories, useCreateCategory, useRenameCategory, useDeleteCategory, useReorderCategories } from "@/hooks/api/useCategories";
import { useOutlets, useOutletProductConfigs, useToggleOutletProductConfig } from "@/hooks/api/useOutlets";
import ProductForm from "@/components/products/ProductForm";
import VariantForm from "@/components/products/VariantForm";
import VariantLibrary from "@/components/products/VariantLibrary";
import { useToast } from "@/hooks/use-toast";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { queryClient } from "@/lib/queryClient";

const formatIDR = (price: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);

export default function ProductsPage() {
  const [, setLocation] = useLocation();
  const { toast, addToast } = useToast();
  const { hasFeature } = useFeatures();
  const hasProductVariants = hasFeature("product_variants");

  const [activeTab, setActiveTab] = useState<"products" | "variants">("products");
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [viewState, setViewState] = useState<"list" | "form_product" | "form_variant">("list");
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [editingVariant, setEditingVariant] = useState<Variant | null>(null);
  const [loadingProductToggles, setLoadingProductToggles] = useState<Set<string>>(new Set());
  const [loadingVariantToggles, setLoadingVariantToggles] = useState<Set<string>>(new Set());
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState<string>("");
  const [savingCategory, setSavingCategory] = useState<string | null>(null);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [confirmDeleteCategoryId, setConfirmDeleteCategoryId] = useState<string | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOutletId, setSelectedOutletId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [insertBeforeId, setInsertBeforeId] = useState<string | "end" | null>(null);
  const [localCategories, setLocalCategories] = useState<Array<{ id: string; name: string; items: any[] }>>([]);

  // Management page always fetches all products (outlet availability filter only applies in POS)
  const { data: products = [], isLoading: isLoadingProducts } = useProducts({ includeUnavailable: true });
  const { data: categories = [] } = useCategories();
  const { data: variants = [], isLoading: isLoadingVariants } = useVariantsLibrary();
  const { data: outletsData } = useOutlets();
  const { data: outletConfigsData } = useOutletProductConfigs();
  const toggleOutletProduct = useToggleOutletProductConfig();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const createOrUpdateVariant = useCreateOrUpdateVariant();
  const renameCategoryMutation = useRenameCategory();
  const createCategoryMutation = useCreateCategory();
  const deleteCategoryMutation = useDeleteCategory();
  const reorderCategoriesMutation = useReorderCategories();

  const allOutlets = outletsData?.outlets ?? [];
  const hasMultiOutlet = allOutlets.length > 1;

  // Build a lookup map: `${outletId}:${productId}` → isAvailable (default true if no config)
  const outletConfigMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const cfg of outletConfigsData?.configs ?? []) {
      map.set(`${cfg.outletId}:${cfg.productId}`, cfg.isAvailable);
    }
    return map;
  }, [outletConfigsData]);

  const [togglingOutletProduct, setTogglingOutletProduct] = useState<Set<string>>(new Set());

  const handleToggleOutletProduct = async (outletId: string, productId: string, current: boolean) => {
    const key = `${outletId}:${productId}`;
    setTogglingOutletProduct((prev) => new Set(prev).add(key));
    try {
      await toggleOutletProduct.mutateAsync({ outletId, productId, isAvailable: !current });
    } catch {
      addToast("Gagal mengubah ketersediaan produk", "error");
    } finally {
      setTogglingOutletProduct((prev) => { const n = new Set(prev); n.delete(key); return n; });
    }
  };
  

  const groupedProducts = useMemo(() => {
    const groups: Record<string, any[]> = {};

    for (const category of categories) {
      groups[category.name] = [];
    }

    products.forEach((product) => {
      const category = product.category || "Uncategorized";
      if (!groups[category]) groups[category] = [];
      groups[category].push(product);
    });

    Object.keys(groups).forEach((category) => {
      groups[category].sort((a, b) => {
        const nameA = (a.name || "").toLowerCase();
        const nameB = (b.name || "").toLowerCase();
        return nameA.localeCompare(nameB);
      });
    });

    return groups;
  }, [products, categories]);

  const toggleCategory = (categoryName: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [categoryName]: !prev[categoryName],
    }));
  };

  const handleEditCategory = (categoryName: string) => {
    setEditingCategory(categoryName);
    setEditingCategoryName(categoryName);
  };

  const handleSaveCategory = async (oldCategoryName: string, newCategoryName: string) => {
    const trimmedName = newCategoryName.trim();
    
    if (!trimmedName || trimmedName === oldCategoryName) {
      setEditingCategory(null);
      return;
    }

    setSavingCategory(oldCategoryName);
    try {
      await renameCategoryMutation.mutateAsync({ old_name: oldCategoryName, new_name: trimmedName });
      setEditingCategory(null);
      addToast("Kategori berhasil diperbarui", "success");
    } catch (error) {
      addToast("Gagal memperbarui kategori", "error");
    } finally {
      setSavingCategory(null);
    }
  };

  const handleCancelEditCategory = () => {
    setEditingCategory(null);
  };



  const orderedCategories = useMemo(() => {
    const byName = new Map(categories.map((c) => [c.name, c]));
    return Object.keys(groupedProducts).map((name) => ({
      id: byName.get(name)?.id ?? name,
      name,
      items: groupedProducts[name] || [],
    }));
  }, [categories, groupedProducts]);

  const filteredLocalCategories = useMemo(() => {
    if (!searchQuery.trim()) return localCategories;
    const q = searchQuery.toLowerCase();
    return localCategories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter((p) => (p.name || "").toLowerCase().includes(q)),
      }))
      .filter((cat) => cat.items.length > 0 || cat.name.toLowerCase().includes(q));
  }, [localCategories, searchQuery]);

  useEffect(() => {
    if (!draggingId) {
      setLocalCategories(orderedCategories);
    }
  }, [orderedCategories, draggingId]);

  const handleDeleteCategory = async (categoryId: string, categoryName: string) => {
    const fallback = window.prompt(`Pindahkan produk dari kategori "${categoryName}" ke kategori:`, "Uncategorized");
    if (!fallback || !fallback.trim()) return;
    try {
      await deleteCategoryMutation.mutateAsync({ id: categoryId, fallback_name: fallback.trim() });
      addToast("Kategori berhasil dihapus", "success");
    } catch (error) {
      addToast("Gagal menghapus kategori", "error");
    }
  };

  const handleDragStart = (e: React.DragEvent, categoryId: string) => {
    setDraggingId(categoryId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, categoryId: string) => {
    if (!reorderMode) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    if (e.clientY < mid) {
      setInsertBeforeId(categoryId);
    } else {
      const idx = localCategories.findIndex((c) => c.id === categoryId);
      const next = localCategories[idx + 1];
      setInsertBeforeId(next ? next.id : "end");
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggingId || !insertBeforeId) {
      setDraggingId(null);
      setInsertBeforeId(null);
      return;
    }
    const current = [...localCategories];
    const fromIdx = current.findIndex((c) => c.id === draggingId);
    if (fromIdx < 0) { setDraggingId(null); setInsertBeforeId(null); return; }
    const [moved] = current.splice(fromIdx, 1);
    let toIdx: number;
    if (insertBeforeId === "end") {
      toIdx = current.length;
    } else {
      toIdx = current.findIndex((c) => c.id === insertBeforeId);
      if (toIdx < 0) toIdx = current.length;
    }
    current.splice(toIdx, 0, moved);
    setLocalCategories(current);
    setDraggingId(null);
    setInsertBeforeId(null);
    try {
      await reorderCategoriesMutation.mutateAsync({ ordered_ids: current.map((c) => c.id) });
      addToast("Urutan kategori diperbarui", "success");
    } catch (error) {
      setLocalCategories(orderedCategories);
      addToast("Gagal menyimpan urutan kategori", "error");
    }
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setInsertBeforeId(null);
  };

  const handleCreateProduct = () => {
    setEditingProduct(null);
    setViewState("form_product");
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      await createCategoryMutation.mutateAsync({ name: newCategoryName.trim() });
      setNewCategoryName("");
      setIsCategoryDialogOpen(false);
      addToast("Kategori berhasil dibuat", "success");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Gagal membuat kategori";
      addToast(message, "error");
    }
  };

  const handleEditProduct = (product: any) => {
    setEditingProduct(product);
    setViewState("form_product");
  };

  const handleCreateVariant = () => {
    setEditingVariant(null);
    setViewState("form_variant");
  };

  const handleEditVariant = (variant: Variant) => {
    setEditingVariant(variant);
    setViewState("form_variant");
  };

  const handleSaveProduct = async (data: any) => {
    try {
      if (editingProduct) {
        await updateProduct.mutateAsync({
          ...data,
          product_id: editingProduct.id,
        });
        toast({
          title: "Berhasil",
          description: "Produk berhasil diperbarui",
        });
      } else {
        await createProduct.mutateAsync(data);
        toast({
          title: "Berhasil",
          description: "Produk berhasil ditambahkan",
        });
      }
      setViewState("list");
      setEditingProduct(null);
    } catch (error) {
      toast({
        title: "Gagal",
        description: error instanceof Error ? error.message : "Terjadi kesalahan",
        variant: "destructive",
      });
    }
  };

  const handleSaveVariant = async (data: any) => {
    try {
      await createOrUpdateVariant.mutateAsync(data);
      toast({
        title: "Berhasil",
        description: editingVariant ? "Varian berhasil diperbarui" : "Varian berhasil dibuat",
      });
      setViewState("list");
      setEditingVariant(null);
    } catch (error) {
      toast({
        title: "Gagal",
        description: error instanceof Error ? error.message : "Terjadi kesalahan",
        variant: "destructive",
      });
    }
  };

  const handleCancelForm = () => {
    setViewState("list");
    setEditingProduct(null);
    setEditingVariant(null);
  };

  const handleNavigateToVariants = () => {
    setActiveTab("variants");
    setViewState("list");
  };

  const handleToggleProductAvailability = async (productId: string, newStatus: boolean) => {
    setLoadingProductToggles((prev) => new Set(prev).add(productId));
    // Get current products from cache
    const currentProducts = queryClient.getQueryData(["/api/catalog/products"]) as any[] | undefined;
    let updatedProducts: any[] | undefined;
    
    // Optimistically update the cache
    if (currentProducts) {
      updatedProducts = currentProducts.map((p) =>
        p.id === productId ? { ...p, is_active: newStatus } : p
      );
      queryClient.setQueryData(["/api/catalog/products"], updatedProducts);
    }

    try {
      // Call mutation directly without waiting for cache invalidation
      await updateProduct.mutateAsync({
        product_id: productId,
        is_active: newStatus,
      } as any);
      
      // After mutation succeeds, keep the optimistic state to maintain order
      // Don't let auto-refetch reorder the products
      if (currentProducts && updatedProducts) {
        const latestProducts = queryClient.getQueryData(["/api/catalog/products"]) as any[] | undefined;
        if (latestProducts && latestProducts !== updatedProducts) {
          // If data changed due to refetch, re-apply the sort to maintain order
          const productMap = new Map(latestProducts.map((p) => [p.id, p]));
          const sortedProducts = currentProducts.map((p) => productMap.get(p.id) || p);
          queryClient.setQueryData(["/api/catalog/products"], sortedProducts);
        }
      }
      
      addToast(
        newStatus ? "Produk diaktifkan" : "Produk dinonaktifkan",
        newStatus ? "success" : "info"
      );
    } catch (error) {
      // Revert to previous state on error
      if (currentProducts) {
        queryClient.setQueryData(["/api/catalog/products"], currentProducts);
      }
      addToast("Gagal mengubah status produk", "error");
    } finally {
      setLoadingProductToggles((prev) => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }
  };

  const handleToggleVariantOptionAvailability = async (
    variantId: string,
    optionIndex: number,
    newStatus: boolean
  ) => {
    const toggleKey = `${variantId}-${optionIndex}`;
    setLoadingVariantToggles((prev) => new Set(prev).add(toggleKey));
    // Get current products from cache for optimistic update
    const currentProducts = queryClient.getQueryData(["/api/catalog/products"]) as any[] | undefined;
    let updatedProducts: any[] | undefined;
    
    try {
      const variant = variants.find((v) => v.id === variantId);
      if (!variant) return;

      const updatedOptions = variant.options.map((opt, idx) =>
        idx === optionIndex ? { ...opt, available: newStatus } : opt
      );

      const variantType: "single" | "multiple" = variant.type === "radio" ? "single" : "multiple";
      
      // Optimistically update cache - update products with new variant options
      // Use is_available to match API response format
      if (currentProducts) {
        updatedProducts = currentProducts.map((p) => {
          const optGroups = p.option_groups || [];
          const hasThisVariant = optGroups.some((g: any) => g.name === variant.name);
          
          if (hasThisVariant) {
            return {
              ...p,
              option_groups: optGroups.map((g: any) => 
                g.name === variant.name 
                  ? {
                      ...g,
                      options: (g.options || []).map((opt: any, idx: number) =>
                        idx === optionIndex 
                          ? { ...opt, is_available: newStatus }
                          : opt
                      ),
                    }
                  : g
              ),
            };
          }
          return p;
        });
        queryClient.setQueryData(["/api/catalog/products"], updatedProducts);
      }

      try {
        await createOrUpdateVariant.mutateAsync({
          name: variant.name,
          type: variantType,
          required: variant.required,
          options: updatedOptions.map((opt) => ({
            name: opt.name,
            price_delta: opt.price,
            is_available: opt.available,
          })),
          linkedProducts: products
            .filter((p) =>
              (p.option_groups || []).some((g: any) => g.name === variant.name)
            )
            .map((p) => p.id),
          isEditing: true,
          oldName: variant.name,
        });
      } catch (innerError) {
        // Mutation error caught here, will be handled by outer catch
        throw innerError;
      }

      addToast(
        newStatus ? "Opsi diaktifkan" : "Opsi dinonaktifkan",
        newStatus ? "success" : "info"
      );
    } catch (error) {
      // Revert to previous state on error
      if (currentProducts) {
        queryClient.setQueryData(["/api/catalog/products"], currentProducts);
      }
      addToast("Gagal mengubah status opsi", "error");
    } finally {
      const toggleKey = `${variantId}-${optionIndex}`;
      setLoadingVariantToggles((prev) => {
        const next = new Set(prev);
        next.delete(toggleKey);
        return next;
      });
    }
  };

  const handleDeleteProduct = async () => {
    if (!editingProduct) return;
    if (confirm(`Hapus produk "${editingProduct.name}"?`)) {
      try {
        await updateProduct.mutateAsync({
          product_id: editingProduct.id,
          is_deleted: true,
        } as any);
        addToast("Produk telah dihapus", "success");
        setViewState("list");
        setEditingProduct(null);
      } catch (error) {
        addToast("Gagal menghapus produk", "error");
      }
    }
  };

  const handleDeleteVariant = async (variantId: string) => {
    const variant = variants.find((v) => v.id === variantId);
    if (!variant) return;
    
    if (confirm(`Hapus varian "${variant.name}"?`)) {
      try {
        // Delete variant by updating with empty options
        await createOrUpdateVariant.mutateAsync({
          name: variant.name,
          type: variant.type === "radio" ? "single" : "multiple",
          required: variant.required,
          options: [],
          linkedProducts: [],
          isEditing: true,
          oldName: variant.name,
          isDeleting: true,
        } as any);
        addToast("Varian telah dihapus", "success");
      } catch (error) {
        addToast("Gagal menghapus varian", "error");
      }
    }
  };

  if (viewState === "form_product") {
    // Build outlet availability list for the product being edited
    const formOutletAvailability = allOutlets.map((outlet) => {
      const key = `${outlet.id}:${editingProduct?.id}`;
      return {
        outletId: outlet.id,
        outletName: outlet.name,
        isAvailable: outletConfigMap.has(key) ? outletConfigMap.get(key)! : true,
        isToggling: togglingOutletProduct.has(key),
      };
    });

    return (
      <ProductForm
        product={editingProduct}
        categories={categories.map((c: any) => ({ id: c.id, name: c.name }))}
        onSave={handleSaveProduct}
        onCancel={handleCancelForm}
        isLoading={updateProduct.isPending || createProduct.isPending}
        onNavigateToVariants={handleNavigateToVariants}
        onDelete={editingProduct ? handleDeleteProduct : undefined}
        outletAvailability={formOutletAvailability}
        onToggleOutlet={(outletId, newValue) =>
          handleToggleOutletProduct(outletId, editingProduct?.id, !newValue)
        }
      />
    );
  }

  if (viewState === "form_variant") {
    return (
      <VariantForm
        variant={editingVariant}
        products={products}
        onSave={handleSaveVariant}
        onCancel={handleCancelForm}
        isLoading={createOrUpdateVariant.isPending}
        onDelete={editingVariant ? () => handleDeleteVariant(editingVariant.id) : undefined}
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {isCategoryDialogOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-md space-y-4">
            <h3 className="text-lg font-bold text-slate-800">Tambah Kategori</h3>
            <input className="w-full border border-slate-200 rounded-xl p-3 text-sm" placeholder="Nama kategori" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button className="px-4 py-2 rounded-xl border" onClick={() => setIsCategoryDialogOpen(false)}>Batal</button>
              <button className="px-4 py-2 rounded-xl bg-blue-600 text-white" onClick={handleCreateCategory}>Simpan</button>
            </div>
          </div>
        </div>
      )}
      <PageHeader
        title="Produk & Varian"
        subtitle="Kelola katalog produk dan grup varian"
        onBack={() => setLocation("/hub")}
        actions={
          activeTab === "products" ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsCategoryDialogOpen(true)}
                className="bg-white text-slate-700 border border-slate-200 px-3 py-2 rounded-xl text-sm font-bold"
                data-testid="button-add-category"
              >
                + Kategori
              </button>
              <button
                onClick={handleCreateProduct}
                className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm hover:bg-blue-700 transition-all"
                data-testid="button-add-product"
              >
                <Plus size={16} /> Produk
              </button>
            </div>
          ) : (
            <button
              onClick={handleCreateVariant}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm hover:bg-blue-700 transition-all"
              data-testid="button-add-variant"
            >
              <Plus size={16} /> Grup Varian
            </button>
          )
        }
        tabs={
          <div className="flex gap-6">
            <button
              onClick={() => setActiveTab("products")}
              className={`py-3 text-sm font-bold border-b-2 transition-all ${
                activeTab === "products"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
              data-testid="tab-products"
            >
              Daftar Produk
            </button>
            <button
              onClick={() => hasProductVariants && setActiveTab("variants")}
              className={`py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                activeTab === "variants"
                  ? "border-blue-600 text-blue-600"
                  : hasProductVariants
                  ? "border-transparent text-slate-400 hover:text-slate-600"
                  : "border-transparent text-slate-300 cursor-not-allowed"
              }`}
              data-testid="tab-variants"
            >
              Perpustakaan Varian
              {!hasProductVariants && <Lock size={12} className="text-slate-300" />}
            </button>
          </div>
        }
      />

      {activeTab === "products" && (
        <div className="px-4 pt-4 space-y-2">
          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Cari produk..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              data-testid="input-search-products"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                data-testid="button-clear-search"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Outlet filter — only shown when tenant has 2+ outlets */}
          {hasMultiOutlet && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <Store size={14} className="text-slate-400 flex-shrink-0" />
              <button
                onClick={() => setSelectedOutletId(null)}
                data-testid="filter-outlet-all"
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                  selectedOutletId === null
                    ? "bg-slate-800 text-white border-slate-800"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-400 hover:text-slate-700"
                }`}
              >
                Semua Cabang
              </button>
              {allOutlets.map((outlet) => (
                <button
                  key={outlet.id}
                  onClick={() => setSelectedOutletId(outlet.id)}
                  data-testid={`filter-outlet-${outlet.id}`}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                    selectedOutletId === outlet.id
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600"
                  }`}
                >
                  {outlet.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20">
        {activeTab === "products" && (
          <div className="space-y-4">
            {isLoadingProducts ? (
              <div className="text-center py-8 text-slate-400">
                <p>Memuat produk...</p>
              </div>
            ) : Object.keys(groupedProducts).length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <p className="mb-2">Belum ada produk</p>
                <p className="text-xs">Klik tombol "+ Produk" untuk menambahkan</p>
              </div>
            ) : (
              <>
                {/* Reorder toggle above first category */}
                <div className="flex justify-end -mt-1 mb-1">
                  <button
                    onClick={() => setReorderMode((v) => !v)}
                    className={`text-xs font-semibold px-2 py-1 rounded-lg transition-colors ${
                      reorderMode
                        ? "text-blue-600 bg-blue-50 hover:bg-blue-100"
                        : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                    }`}
                    data-testid="button-reorder-categories"
                  >
                    {reorderMode ? "✓ Selesai" : "Ubah urutan"}
                  </button>
                </div>

                {/* Drop zone at the top */}
                {reorderMode && (
                  <div
                    className="h-2"
                    onDragOver={(e) => { e.preventDefault(); const first = localCategories[0]; if (first) setInsertBeforeId(first.id); }}
                    onDrop={handleDrop}
                  />
                )}

                {filteredLocalCategories.map(({ id: categoryId, name: category, items }) => {
                const isCollapsed = collapsedCategories[category];
                const isDragging = draggingId === categoryId;
                const showInsertBefore = reorderMode && insertBeforeId === categoryId && draggingId && !isDragging;
                const isConfirmingDelete = confirmDeleteCategoryId === categoryId;
                return (
                  <div key={category}>
                    {/* Insert indicator line */}
                    {showInsertBefore && (
                      <div className="flex items-center gap-2 my-1 px-1">
                        <div className="h-0.5 flex-1 bg-blue-500 rounded-full shadow-sm" style={{ boxShadow: "0 0 4px rgba(59,130,246,0.6)" }} />
                        <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                      </div>
                    )}
                  <div
                    className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all duration-150 select-none ${
                      isDragging
                        ? "opacity-40 border-blue-300 scale-[0.98] shadow-none"
                        : isConfirmingDelete
                        ? "border-red-200"
                        : "border-slate-200"
                    } ${reorderMode ? "cursor-grab active:cursor-grabbing" : ""}`}
                    draggable={reorderMode}
                    onDragStart={(e) => handleDragStart(e, categoryId)}
                    onDragOver={(e) => handleDragOver(e, categoryId)}
                    onDrop={handleDrop}
                    onDragEnd={handleDragEnd}
                    data-testid={`category-${category}`}
                  >
                    {/* Inline delete confirmation bar */}
                    {isConfirmingDelete ? (
                      <div className="px-4 py-3 bg-red-50 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Trash2 size={15} className="text-red-500 flex-shrink-0" />
                          <span className="text-sm text-red-700 font-medium truncate">
                            Hapus kategori <span className="font-bold">"{category}"</span>?
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 transition-colors"
                            onClick={() => setConfirmDeleteCategoryId(null)}
                            data-testid={`button-cancel-delete-${categoryId}`}
                          >
                            Batal
                          </button>
                          <button
                            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                            onClick={() => { setConfirmDeleteCategoryId(null); handleDeleteCategory(categoryId, category); }}
                            data-testid={`button-confirm-delete-${categoryId}`}
                          >
                            Hapus
                          </button>
                        </div>
                      </div>
                    ) : (
                    <div
                      className={`p-4 flex justify-between items-center transition-colors ${
                        reorderMode ? "bg-blue-50/60" : "bg-slate-50 hover:bg-slate-100"
                      }`}
                      data-testid={`category-header-${category}`}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {reorderMode && <GripVertical size={16} className="text-blue-400" />}
                        {editingCategory === category ? (
                          <input
                            autoFocus
                            type="text"
                            value={editingCategoryName}
                            onChange={(e) => setEditingCategoryName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleSaveCategory(category, editingCategoryName);
                              } else if (e.key === "Escape") {
                                handleCancelEditCategory();
                              }
                            }}
                            onBlur={() => handleSaveCategory(category, editingCategoryName)}
                            className="font-bold text-slate-700 capitalize px-2 py-1 border border-blue-500 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white"
                            data-testid={`input-category-name-${category}`}
                            disabled={savingCategory === category}
                          />
                        ) : (
                          <h3
                            onClick={() => !reorderMode && handleEditCategory(category)}
                            className={`font-bold text-slate-700 capitalize transition-colors ${!reorderMode ? "cursor-pointer hover:text-blue-600" : ""}`}
                            data-testid={`text-category-${category}`}
                          >
                            {category}
                          </h3>
                        )}
                        <span className="bg-slate-200 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                          {items.length}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {!reorderMode && (
                          <button
                            type="button"
                            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
                            onClick={() => setConfirmDeleteCategoryId(categoryId)}
                            data-testid={`button-delete-category-${categoryId}`}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                        {!reorderMode && (
                        <div
                          onClick={() => toggleCategory(category)}
                          className={`text-slate-400 transition-transform duration-300 cursor-pointer hover:text-slate-600 flex-shrink-0 p-1 ${
                            isCollapsed ? "-rotate-90" : "rotate-0"
                          }`}
                          data-testid={`button-toggle-category-${category}`}
                        >
                          <ChevronDown size={20} />
                        </div>
                        )}
                      </div>
                    </div>
                    )}

                    {!isCollapsed && (
                      <div className="divide-y divide-slate-100 animate-in slide-in-from-top-2">
                        {items.map((product) => {
                          const variantsCount = product.option_groups?.length || 0;
                          const stockQty = product.stock_qty ?? product.stockQty ?? 0;
                          const imageUrl = product.image_url || product.imageUrl || "";
                          const basePrice = product.base_price || product.basePrice || 0;
                          const isActive = product.is_active !== false;

                          return (
                            <div
                              key={product.id}
                              className={`p-3 flex items-center gap-4 transition-colors group ${
                                !isActive
                                  ? "bg-slate-50 opacity-70"
                                  : "hover:bg-blue-50"
                              }`}
                              data-testid={`product-card-${product.id}`}
                            >
                              <div
                                onClick={() => handleEditProduct(product)}
                                className="flex-1 flex items-center gap-4 cursor-pointer min-w-0"
                              >
                                <div className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0 relative">
                                  {imageUrl ? (
                                    <img
                                      src={imageUrl}
                                      className={`w-full h-full object-cover transition-all ${
                                        !isActive ? "grayscale" : ""
                                      }`}
                                      alt={product.name}
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                                      <Plus size={20} />
                                    </div>
                                  )}
                                  {!isActive && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                                      <span className="bg-slate-800 text-white text-[8px] font-bold px-1 rounded">
                                        OFF
                                      </span>
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-bold text-slate-800 truncate">
                                    {product.name}
                                  </h4>
                                  <div className="flex items-center gap-3 mt-1">
                                    <span className="font-bold text-blue-600 text-xs">
                                      {formatIDR(basePrice)}
                                    </span>
                                    {product.stock_tracking_enabled || product.stockTrackingEnabled ? (
                                      <span
                                        className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                          stockQty < 10
                                            ? "bg-red-100 text-red-600"
                                            : "bg-green-100 text-green-600"
                                        }`}
                                      >
                                        Stok: {stockQty}
                                      </span>
                                    ) : null}
                                    {variantsCount > 0 && (
                                      <span className="flex items-center gap-1 text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                        <Layers size={10} /> {variantsCount} Varian
                                      </span>
                                    )}
                                  </div>

                                </div>
                              </div>

                              {/* ── Right-side control ─────────────────────────────────
                                  When a specific outlet is selected → toggle controls
                                  outlet availability for that branch.
                                  When "Semua Cabang" (no filter) → toggle controls
                                  global active status.
                              ─────────────────────────────────────────────────────── */}
                              {hasMultiOutlet && selectedOutletId ? (() => {
                                const key = `${selectedOutletId}:${product.id}`;
                                const isAvail = outletConfigMap.has(key) ? outletConfigMap.get(key)! : true;
                                const isToggling = togglingOutletProduct.has(key);
                                const outletName = allOutlets.find(o => o.id === selectedOutletId)?.name ?? "Cabang";
                                return (
                                  <div className="pl-4 border-l border-slate-100 flex flex-col items-center gap-1 min-w-[52px]">
                                    <ToggleSwitch
                                      checked={isAvail}
                                      onChange={() => handleToggleOutletProduct(selectedOutletId, product.id, isAvail)}
                                      isLoading={isToggling}
                                      data-testid={`toggle-outlet-${selectedOutletId}-${product.id}`}
                                    />
                                    <span className="text-[9px] text-center font-semibold leading-tight text-slate-400 max-w-[52px] truncate">
                                      {outletName}
                                    </span>
                                  </div>
                                );
                              })() : (
                              <div className="pl-4 border-l border-slate-100 flex flex-col items-center gap-1 min-w-[52px]">
                                <ToggleSwitch
                                  checked={isActive}
                                  onChange={(val) =>
                                    handleToggleProductAvailability(product.id, val)
                                  }
                                  isLoading={loadingProductToggles.has(product.id)}
                                  data-testid={`toggle-product-${product.id}`}
                                />
                                <span className="text-[9px] font-semibold text-slate-400">Global</span>
                              </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  </div>
                );
              })}

                {/* End drop zone + indicator */}
                {reorderMode && (
                  <>
                    {insertBeforeId === "end" && draggingId && (
                      <div className="flex items-center gap-2 my-1 px-1">
                        <div className="h-0.5 flex-1 bg-blue-500 rounded-full shadow-sm" style={{ boxShadow: "0 0 4px rgba(59,130,246,0.6)" }} />
                        <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                      </div>
                    )}
                    <div
                      className="h-8"
                      onDragOver={(e) => { e.preventDefault(); setInsertBeforeId("end"); }}
                      onDrop={handleDrop}
                    />
                  </>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === "variants" && (
          <>
            {isLoadingVariants ? (
              <div className="text-center py-8 text-slate-400">
                <p>Memuat varian...</p>
              </div>
            ) : (
              <VariantLibrary
                variants={variants}
                products={products}
                onVariantClick={handleEditVariant}
                onCreateNew={handleCreateVariant}
                onToggleVariantOption={handleToggleVariantOptionAvailability}
                loadingVariantToggles={loadingVariantToggles}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
