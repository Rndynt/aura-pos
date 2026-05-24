import { useState } from "react";
import { useLocation } from "wouter";
import { Building2, Plus, Pencil, Trash2, Check, MapPin, Phone, Star } from "lucide-react";
import { PageHeader } from "@/components/design";
import { useOutlets, useCreateOutlet, useUpdateOutlet, useDeleteOutlet } from "@/hooks/api/useOutlets";
import { useOutlet } from "@/context/OutletContext";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import type { Outlet } from "@/context/OutletContext";

// ─── Form modal ───────────────────────────────────────────────────────────────
function OutletFormModal({
  outlet,
  onClose,
}: {
  outlet?: Outlet | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const create = useCreateOutlet();
  const update = useUpdateOutlet();
  const isEdit = !!outlet;

  const [name, setName] = useState(outlet?.name ?? "");
  const [slug, setSlug] = useState(outlet?.slug ?? "");
  const [address, setAddress] = useState(outlet?.address ?? "");
  const [phone, setPhone] = useState(outlet?.phone ?? "");

  const pending = create.isPending || update.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;

    try {
      if (isEdit) {
        await update.mutateAsync({ id: outlet!.id, name, slug, address, phone });
        toast({ title: "Cabang diperbarui" });
      } else {
        await create.mutateAsync({ name, slug, address, phone });
        toast({ title: "Cabang baru ditambahkan" });
      }
      onClose();
    } catch (err: any) {
      toast({ title: "Gagal", description: err.message, variant: "destructive" });
    }
  };

  const labelCls = "block text-xs font-semibold text-slate-500 mb-1";
  const inputCls =
    "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-base font-bold text-slate-800 mb-5">
          {isEdit ? "Edit Cabang" : "Tambah Cabang Baru"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelCls}>Nama Cabang *</label>
            <input
              className={inputCls}
              placeholder="Cabang Utama"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              data-testid="input-outlet-name"
            />
          </div>
          <div>
            <label className={labelCls}>Kode / Slug *</label>
            <input
              className={inputCls}
              placeholder="main"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
              required
              data-testid="input-outlet-slug"
            />
            <p className="text-xs text-slate-400 mt-1">Hanya huruf kecil, angka, dan tanda hubung</p>
          </div>
          <div>
            <label className={labelCls}>Alamat</label>
            <textarea
              className={inputCls + " resize-none h-20"}
              placeholder="Jl. Sudirman No. 45..."
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              data-testid="input-outlet-address"
            />
          </div>
          <div>
            <label className={labelCls}>No. Telepon</label>
            <input
              className={inputCls}
              placeholder="+62812-xxxx-xxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              data-testid="input-outlet-phone"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              data-testid="button-outlet-cancel"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
              data-testid="button-outlet-save"
            >
              {pending ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function OutletsPage() {
  const [, setLocation] = useLocation();
  const { data, isLoading } = useOutlets();
  const deleteOutlet = useDeleteOutlet();
  const { activeOutlet, setActiveOutlet } = useOutlet();
  const { toast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Outlet | null>(null);

  const outlets = data?.outlets ?? [];

  const handleDelete = async (outlet: Outlet) => {
    if (outlet.isDefault) {
      toast({ title: "Outlet default tidak bisa dihapus", variant: "destructive" });
      return;
    }
    if (!confirm(`Hapus cabang "${outlet.name}"? Data terkait tidak akan dihapus.`)) return;
    try {
      await deleteOutlet.mutateAsync(outlet.id);
      toast({ title: "Cabang dinonaktifkan" });
    } catch (err: any) {
      toast({ title: "Gagal", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 animate-in fade-in slide-in-from-bottom-4">
      <PageHeader
        title="Manajemen Cabang"
        subtitle="Kelola outlet & lokasi bisnis kamu"
        onBack={() => setLocation("/hub")}
        actions={
          <button
            onClick={() => { setEditTarget(null); setShowForm(true); }}
            className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
            data-testid="button-add-outlet"
          >
            <Plus size={15} />
            Tambah
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-2xl mx-auto w-full space-y-3">

        {/* Info banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700">
          <span className="font-semibold">Gratis 1 cabang.</span> Setiap cabang tambahan Rp 10.000/bulan.
          {outlets.length >= 1 && (
            <span className="ml-1">Kamu punya <strong>{outlets.length}</strong> cabang aktif.</span>
          )}
        </div>

        {/* Outlet cards */}
        {isLoading ? (
          [1, 2].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4">
              <Skeleton className="h-5 w-40 mb-2" />
              <Skeleton className="h-4 w-64" />
            </div>
          ))
        ) : outlets.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Building2 size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Belum ada cabang</p>
          </div>
        ) : (
          outlets.map((outlet) => {
            const isActive = activeOutlet?.id === outlet.id;
            return (
              <div
                key={outlet.id}
                data-testid={`card-outlet-${outlet.id}`}
                className={`bg-white rounded-xl border-2 p-4 transition-all ${
                  isActive ? "border-blue-500 shadow-md shadow-blue-100" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800 text-sm">{outlet.name}</span>
                      {outlet.isDefault && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                          <Star size={10} strokeWidth={2.5} />
                          UTAMA
                        </span>
                      )}
                      {isActive && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                          <Check size={10} strokeWidth={2.5} />
                          AKTIF
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 font-mono">/{outlet.slug}</p>
                    {outlet.address && (
                      <p className="text-xs text-slate-500 mt-1.5 flex items-start gap-1.5">
                        <MapPin size={11} className="mt-0.5 flex-shrink-0 text-slate-400" />
                        {outlet.address}
                      </p>
                    )}
                    {outlet.phone && (
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                        <Phone size={11} className="flex-shrink-0 text-slate-400" />
                        {outlet.phone}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!isActive && (
                      <button
                        onClick={() => setActiveOutlet(outlet)}
                        className="text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                        data-testid={`button-switch-outlet-${outlet.id}`}
                      >
                        Pilih
                      </button>
                    )}
                    <button
                      onClick={() => { setEditTarget(outlet); setShowForm(true); }}
                      className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                      data-testid={`button-edit-outlet-${outlet.id}`}
                    >
                      <Pencil size={14} />
                    </button>
                    {!outlet.isDefault && (
                      <button
                        onClick={() => handleDelete(outlet)}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        data-testid={`button-delete-outlet-${outlet.id}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Upgrade hint when at limit */}
        {!isLoading && outlets.length >= 1 && (
          <div className="bg-slate-100 rounded-xl border border-slate-200 px-4 py-3 text-xs text-slate-500 text-center">
            Untuk menambah lebih dari 1 cabang, aktifkan paket <strong className="text-slate-700">Multi-Cabang</strong> di Marketplace.
          </div>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <OutletFormModal
          outlet={editTarget}
          onClose={() => { setShowForm(false); setEditTarget(null); }}
        />
      )}
    </div>
  );
}
