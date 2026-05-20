import { useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useProducts, useUpdateProduct, type CreateProductInput } from "@/hooks/api/useProducts";
import { queryClient } from "@/lib/queryClient";
import type { Product } from "@pos/domain/catalog/types";

export interface VariantOption {
  name: string;
  price: number;
  available?: boolean;
}

export interface Variant {
  id: string;
  name: string;
  type: "radio" | "checkbox";
  required: boolean;
  options: VariantOption[];
}

export interface VariantFormData {
  name: string;
  type: "single" | "multiple";
  required: boolean;
  options: Array<{
    name: string;
    price_delta: number;
    is_available?: boolean;
  }>;
  linkedProducts: string[];
}

export function useVariantsLibrary() {
  const { data: products, isLoading, error } = useProducts();

  const variants = useMemo(() => {
    if (!products) return [];

    const variantsMap = new Map<string, Variant>();

    products.forEach((product: any) => {
      if (product.option_groups && Array.isArray(product.option_groups)) {
        product.option_groups.forEach((group: any) => {
          if (!variantsMap.has(group.name)) {
            variantsMap.set(group.name, {
              id: group.id || group.name,
              name: group.name,
              type: group.selection_type === "single" ? "radio" : "checkbox",
              required: group.is_required || false,
              options: (group.options || []).map((opt: any) => ({
                name: opt.name,
                price: Number(opt.price_delta || 0),
                available: opt.is_available !== false, // Include available status from API
              })),
            });
          }
        });
      }
    });

    // Sort by name for stable, predictable ordering regardless of save/refetch
    return Array.from(variantsMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "id")
    );
  }, [products]);

  return { data: variants, isLoading, error };
}

export function useCreateOrUpdateVariant() {
  const updateProduct = useUpdateProduct();
  const { data: products } = useProducts();

  return useMutation({
    mutationFn: async (variantData: VariantFormData & { isEditing?: boolean; oldName?: string }) => {
      if (!products) throw new Error("Products not loaded");

      const { linkedProducts, name, type, required, options, isEditing, oldName } = variantData;

      const buildOptionGroup = (display_order: number) => ({
        name,
        selection_type: type,
        min_selections: required ? 1 : 0,
        max_selections: type === "single" ? 1 : options.length,
        is_required: required,
        display_order,
        options: options.map((opt, idx) => ({
          name: opt.name,
          price_delta: opt.price_delta,
          is_available: opt.is_available !== false,
          display_order: idx,
        })),
      });

      const updates: Promise<any>[] = [];

      products.forEach((product: any) => {
        const shouldHave = linkedProducts.includes(product.id);
        const existingGroups = product.option_groups || [];

        const nameToMatch = isEditing && oldName ? oldName : name;
        const hasVariant = existingGroups.some(
          (g: any) => g.name === nameToMatch
        );

        let newGroups = [...existingGroups];

        if (shouldHave) {
          const existingIdx = newGroups.findIndex(
            (g: any) => g.name === nameToMatch
          );

          if (existingIdx >= 0) {
            // Preserve existing display_order so position in dialog never shifts
            const preservedOrder = newGroups[existingIdx].display_order ?? existingIdx;
            newGroups[existingIdx] = buildOptionGroup(preservedOrder);
          } else {
            newGroups.push(buildOptionGroup(newGroups.length));
          }
        } else if (hasVariant) {
          newGroups = newGroups.filter((g: any) => g.name !== nameToMatch);
        } else {
          return;
        }

        updates.push(
          updateProduct.mutateAsync({
            product_id: product.id,
            name: product.name,
            base_price: Number(product.base_price || product.basePrice || 0),
            category: product.category,
            image_url: product.image_url || product.imageUrl,
            stock_tracking_enabled: product.stock_tracking_enabled || product.stockTrackingEnabled,
            stock_qty: Number(product.stock_qty || product.stockQty || 0),
            sku: product.sku,
            option_groups: newGroups.map((g: any) => ({
              name: g.name,
              selection_type: g.selection_type || g.selectionType,
              min_selections: g.min_selections || g.minSelections || 0,
              max_selections: g.max_selections || g.maxSelections || 1,
              is_required: g.is_required ?? g.isRequired ?? false,
              display_order: g.display_order ?? g.displayOrder,   // ← selalu kirim display_order
              options: (g.options || []).map((o: any, oIdx: number) => ({
                name: o.name,
                price_delta: Number(o.price_delta || o.priceDelta || 0),
                is_available: o.is_available !== false,
                display_order: o.display_order ?? oIdx,           // ← preserve option order
              })),
            })),
          })
        );
      });

      await Promise.all(updates);
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/catalog/products"] });
    },
  });
}
