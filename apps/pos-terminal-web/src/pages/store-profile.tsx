import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Store } from "lucide-react";
import { InputField, PageHeader } from "@/components/design";
import { useTenant } from "@/context/TenantContext";
import { useTenantProfile } from "@/hooks/api/useTenantProfile";
import { Skeleton } from "@/components/ui/skeleton";

export default function StoreProfilePage() {
  const [, setLocation] = useLocation();
  const { tenantId } = useTenant();
  const { data: profile, isLoading } = useTenantProfile(tenantId);

  const [formData, setFormData] = useState({
    businessName: "",
    phone: "",
    address: "",
  });

  // Sync form with real tenant data once loaded
  useEffect(() => {
    if (profile?.tenant) {
      setFormData({
        businessName: profile.tenant.business_name || profile.tenant.name || "",
        phone: profile.tenant.business_phone || "",
        address: profile.tenant.business_address || "",
      });
    }
  }, [profile]);

  const handleBack = () => {
    setLocation("/hub");
  };

  const handleSave = () => {
    // TODO: wire up save API
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 animate-in fade-in slide-in-from-bottom-4">
      <PageHeader
        title="Profil Toko"
        subtitle="Informasi & identitas bisnis kamu"
        onBack={handleBack}
        actions={
          <button
            onClick={handleSave}
            className="text-blue-600 font-extrabold text-sm hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
            data-testid="button-save"
          >
            Simpan
          </button>
        }
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-2xl mx-auto w-full space-y-6">
        {/* Store Info Card */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center">
          <div
            className="w-20 h-20 bg-slate-100 rounded-full mb-4 flex items-center justify-center border-4 border-white shadow-lg"
            data-testid="icon-store"
          >
            <Store size={32} className="text-slate-400" />
          </div>
          {isLoading ? (
            <>
              <Skeleton className="h-6 w-48 mb-2" />
              <Skeleton className="h-4 w-32" />
            </>
          ) : (
            <>
              <h2 className="text-xl font-black text-slate-800" data-testid="text-store-name">
                {profile?.tenant?.name || "—"}
              </h2>
              <p className="text-sm text-slate-500" data-testid="text-tenant-id">
                ID: {tenantId}
              </p>
            </>
          )}
        </div>

        {/* Information Form */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-800 mb-2 border-b pb-2">
            Informasi
          </h3>

          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          ) : (
            <>
              <InputField
                label="Nama Usaha"
                value={formData.businessName}
                onChange={(e) =>
                  setFormData({ ...formData, businessName: e.target.value })
                }
                placeholder="Masukkan nama usaha"
                data-testid="input-business-name"
              />

              <InputField
                label="Telepon"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                placeholder="Masukkan nomor telepon"
                type="tel"
                data-testid="input-phone"
              />

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">Alamat</label>
                <textarea
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  value={formData.address}
                  onChange={(e) =>
                    setFormData({ ...formData, address: e.target.value })
                  }
                  placeholder="Masukkan alamat usaha"
                  rows={3}
                  data-testid="textarea-address"
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
