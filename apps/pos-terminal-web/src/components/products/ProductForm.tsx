import { useState, useEffect } from "react";
import { Box, Layers, Save, ChevronLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ProductFormProps {
  product?: any | null;
  onSave: (data: any) => void;
  onCancel: () => void;
  isLoading?: boolean;
  onNavigateToVariants?: () => void;
  onDelete?: () => void;
  categories?: Array<{ id: string; name: string }>;
}

const InputField = ({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
}) => (
  <div className="space-y-1">
    <label className="text-xs font-bold text-slate-500">{label}</label>
    <input
      type={type}
      className="w-full border border-slate-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      placeholder={placeholder}
      value={value}
      onChange={onChange}
    />
  </div>
);

export default function ProductForm({
  product,
  onSave,
  onCancel,
  isLoading,
  onNavigateToVariants,
  onDelete,
  categories = [],
}: ProductFormProps) {
  const [formData, setFormData] = useState({
    name: "",
    category: "Makanan",
    category_id: "",
    price: "",
    stockTracking: false,
    stockQty: 0,
    sku: "",
    imageUrl: "",
  });

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name || "",
        category: product.category || "Makanan",
        category_id: product.category_id || "",
        price: (product.base_price || product.basePrice || "").toString(),
        stockTracking: product.stock_tracking_enabled || product.stockTrackingEnabled || false,
        stockQty: product.stock_qty || product.stockQty || 0,
        sku: product.sku || "",
        imageUrl: product.image_url || product.imageUrl || "",
      });
    }
  }, [product]);

  const handleSubmit = () => {
    onSave({
      name: formData.name,
      category: formData.category,
      category_id: formData.category_id || undefined,
      base_price: parseFloat(formData.price) || 0,
      stock_tracking_enabled: formData.stockTracking,
      stock_qty: formData.stockTracking ? parseInt(formData.stockQty.toString()) : undefined,
      sku: formData.sku,
      image_url: formData.imageUrl,
    });
  };

  const variantsCount = product?.option_groups?.length || 0;

  return (
    <div className="flex flex-col h-full bg-slate-50 animate-in fade-in">
      <div className="bg-white border-b border-slate-200 p-4 sticky top-0 z-10 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            data-testid="button-back"
          >
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-lg font-bold text-slate-800" data-testid="text-form-title">
            {product ? "Edit Produk" : "Tambah Produk"}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {product && onDelete && (
            <button
              onClick={onDelete}
              className="bg-red-50 text-red-600 p-2 rounded-lg hover:bg-red-100 transition-colors"
              data-testid="button-delete-product"
              type="button"
            >
              <Trash2 size={20} />
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-200 disabled:opacity-50"
            data-testid="button-save-product"
          >
            <Save size={16} /> {isLoading ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-3xl mx-auto w-full space-y-6 pb-20">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
            <Box size={18} /> Informasi Dasar
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            <InputField
              label="Nama Produk"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Nama produk"
            />
            <InputField
              label="Harga (Rp)"
              type="number"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              placeholder="0"
            />
            <InputField
              label="SKU"
              value={formData.sku}
              onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
              placeholder="SKU-001"
            />
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500">Kategori</label>
              <Select
                value={formData.category_id || formData.category}
                onValueChange={(selectedValue) => {
                  const selectedCategory = categories.find(
                    (category) => category.id === selectedValue || category.name === selectedValue
                  );

                  if (selectedCategory) {
                    setFormData({
                      ...formData,
                      category: selectedCategory.name,
                      category_id: selectedCategory.id,
                    });
                    return;
                  }

                  setFormData({
                    ...formData,
                    category: selectedValue,
                    category_id: "",
                  });
                }}
              >
                <SelectTrigger className="h-10 rounded-xl border-slate-200">
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-700">Lacak Stok?</p>
            </div>
            <div className="flex items-center gap-3">
              {formData.stockTracking && (
                <input
                  type="number"
                  className="w-24 border border-slate-200 rounded-lg p-2 text-sm text-center"
                  placeholder="Qty"
                  value={formData.stockQty}
                  onChange={(e) =>
                    setFormData({ ...formData, stockQty: parseInt(e.target.value) || 0 })
                  }
                  data-testid="input-stock-qty"
                />
              )}
              <button
                onClick={() =>
                  setFormData({ ...formData, stockTracking: !formData.stockTracking })
                }
                className={`w-12 h-6 rounded-full p-1 transition-colors ${
                  formData.stockTracking ? "bg-blue-600" : "bg-slate-300"
                }`}
                data-testid="toggle-stock-tracking"
              >
                <div
                  className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
                    formData.stockTracking ? "translate-x-6" : ""
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm opacity-80">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-700 flex items-center gap-2">
              <Layers size={18} /> Varian Aktif
            </h3>
            {onNavigateToVariants && (
              <button
                onClick={onNavigateToVariants}
                className="text-xs text-blue-600 font-bold hover:underline"
                data-testid="button-manage-variants"
              >
                Kelola di Tab Varian
              </button>
            )}
          </div>
          {variantsCount === 0 ? (
            <p className="text-sm text-slate-400 italic">Tidak ada varian terhubung.</p>
          ) : (
            <div className="space-y-2">
              {product.option_groups.map((group: any, i: number) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100"
                >
                  <span className="font-bold text-sm text-slate-700">{group.name}</span>
                  <span className="text-xs text-slate-500">
                    {group.options?.length || 0} Opsi
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
