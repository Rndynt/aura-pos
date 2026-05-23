// @ts-nocheck
import { useState } from "react";
import { useLocation } from "wouter";
import { useTenant } from "@/context/TenantContext";
import { useTenantProfile } from "@/hooks/api/useTenantProfile";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutGrid,
  ChefHat,
  Heart,
  Truck,
  CalendarDays,
  Package,
  MapPin,
  Printer,
  CreditCard,
  BarChart3,
  Tag,
  Zap,
  ShoppingBag,
  ArrowLeft,
  CheckCircle2,
  Lock,
  Sparkles,
  Crown,
  ChevronRight,
  X,
  ExternalLink,
  Info,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { getActiveTenantId } from "@/lib/tenant";

// ─── Types ────────────────────────────────────────────────────────────────────

type PlanTier = "free" | "growth" | "pro";

type ModuleKey =
  | "enableTableManagement"
  | "enableKitchenTicket"
  | "enableLoyalty"
  | "enableDelivery"
  | "enableInventory"
  | "enableAppointments"
  | "enableMultiLocation";

type FeatureItem = {
  id: ModuleKey | string;
  isModule: boolean;
  moduleKey?: ModuleKey;
  title: string;
  description: string;
  longDesc: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  requiredPlan: PlanTier;
  category: string;
  badge?: string;
};

// ─── Catalog Definition ───────────────────────────────────────────────────────

const CATALOG: FeatureItem[] = [
  // ── Restoran & Meja
  {
    id: "enableTableManagement",
    isModule: true,
    moduleKey: "enableTableManagement",
    title: "Manajemen Meja",
    description: "Denah meja real-time, status duduk, & kelola pesanan per meja.",
    longDesc:
      "Aktifkan fitur denah meja restoran dengan status real-time (tersedia/terisi/reservasi). Kasir bisa melihat, memilih, dan melanjutkan pesanan langsung dari tampilan denah meja yang interaktif.",
    icon: LayoutGrid,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    requiredPlan: "free",
    category: "Restoran & Meja",
  },
  {
    id: "enableKitchenTicket",
    isModule: true,
    moduleKey: "enableKitchenTicket",
    title: "Kitchen Display (KDS)",
    description: "Tiket pesanan real-time langsung ke layar dapur.",
    longDesc:
      "Tampilkan tiket pesanan secara otomatis ke layar Kitchen Display System (KDS). Staf dapur bisa update status (cooking → ready) tanpa kertas struk, mengurangi miskomunikasi.",
    icon: ChefHat,
    iconBg: "bg-orange-100",
    iconColor: "text-orange-600",
    requiredPlan: "free",
    category: "Restoran & Meja",
  },
  // ── Pelanggan
  {
    id: "enableLoyalty",
    isModule: true,
    moduleKey: "enableLoyalty",
    title: "Program Loyalitas",
    description: "Poin reward, member card, & retensi pelanggan.",
    longDesc:
      "Bangun hubungan jangka panjang dengan pelanggan melalui sistem poin reward. Pelanggan kumpul poin setiap transaksi dan bisa tukar dengan diskon atau hadiah.",
    icon: Heart,
    iconBg: "bg-pink-100",
    iconColor: "text-pink-600",
    requiredPlan: "growth",
    category: "Pelanggan",
    badge: "Populer",
  },
  {
    id: "enableDelivery",
    isModule: true,
    moduleKey: "enableDelivery",
    title: "Delivery & Pengiriman",
    description: "Tipe order delivery, alamat pengiriman, & tracking.",
    longDesc:
      "Tambahkan tipe pesanan delivery ke alur POS. Kasir bisa input alamat pengiriman, catatan driver, dan pantau status pengiriman langsung dari dashboard.",
    icon: Truck,
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
    requiredPlan: "growth",
    category: "Pelanggan",
  },
  {
    id: "enableAppointments",
    isModule: true,
    moduleKey: "enableAppointments",
    title: "Sistem Appointment",
    description: "Jadwal booking, reminder otomatis, & manajemen antrian.",
    longDesc:
      "Cocok untuk salon, klinik, atau bengkel. Pelanggan bisa booking jadwal dan mendapat reminder otomatis. Manajer bisa lihat kalender appointment dan atur kapasitas slot.",
    icon: CalendarDays,
    iconBg: "bg-violet-100",
    iconColor: "text-violet-600",
    requiredPlan: "growth",
    category: "Pelanggan",
  },
  // ── Inventori
  {
    id: "enableInventory",
    isModule: true,
    moduleKey: "enableInventory",
    title: "Manajemen Inventori",
    description: "Stok otomatis berkurang, low-stock alert, & laporan.",
    longDesc:
      "Aktifkan tracking stok otomatis. Setiap pesanan terkonfirmasi akan mengurangi stok produk secara real-time. Dapatkan notifikasi saat stok mendekati batas minimum.",
    icon: Package,
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    requiredPlan: "growth",
    category: "Inventori",
  },
  // ── Ekspansi
  {
    id: "enableMultiLocation",
    isModule: true,
    moduleKey: "enableMultiLocation",
    title: "Multi Lokasi",
    description: "Kelola beberapa cabang dari satu dashboard.",
    longDesc:
      "Buka dan kelola beberapa cabang bisnis dari satu akun. Lihat laporan per cabang, atur produk & harga per lokasi, dan transfer stok antar cabang dengan mudah.",
    icon: MapPin,
    iconBg: "bg-cyan-100",
    iconColor: "text-cyan-600",
    requiredPlan: "pro",
    category: "Ekspansi",
    badge: "Pro",
  },
];

const CATEGORIES = ["Semua", "Restoran & Meja", "Pelanggan", "Inventori", "Ekspansi"];

// ─── Plan config ──────────────────────────────────────────────────────────────

const PLANS = [
  {
    tier: "free" as PlanTier,
    name: "Starter",
    price: "Gratis",
    color: "slate",
    features: ["POS Terminal", "Manajemen Produk", "Laporan Dasar", "Meja & KDS"],
  },
  {
    tier: "growth" as PlanTier,
    name: "Growth",
    price: "Rp 149.000",
    color: "blue",
    features: ["Semua Starter", "Loyalitas Pelanggan", "Delivery", "Inventori", "Appointment"],
    popular: true,
  },
  {
    tier: "pro" as PlanTier,
    name: "Pro",
    price: "Rp 349.000",
    color: "violet",
    features: ["Semua Growth", "Multi Lokasi", "API Integration", "Priority Support"],
  },
];

const PLAN_RANK: Record<PlanTier, number> = { free: 0, growth: 1, pro: 2 };

// ─── Component ────────────────────────────────────────────────────────────────

export default function MarketplacePage() {
  const [, setLocation] = useLocation();
  const { tenantId, moduleConfig } = useTenant();
  const { data: profile, isLoading } = useTenantProfile(tenantId);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeCategory, setActiveCategory] = useState("Semua");
  const [selectedFeature, setSelectedFeature] = useState<FeatureItem | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [showPlans, setShowPlans] = useState(false);

  const currentPlan: PlanTier = (profile?.tenant?.planTier as PlanTier) ?? "free";

  const isModuleActive = (item: FeatureItem): boolean => {
    if (!item.isModule || !item.moduleKey) return false;
    return !!(moduleConfig?.[item.moduleKey]);
  };

  const canActivate = (item: FeatureItem): boolean => {
    return PLAN_RANK[item.requiredPlan] <= PLAN_RANK[currentPlan];
  };

  const handleToggle = async (item: FeatureItem) => {
    if (!item.isModule || !item.moduleKey) return;
    if (!canActivate(item)) {
      setShowPlans(true);
      return;
    }
    const newVal = !isModuleActive(item);
    setToggling(item.id);
    try {
      const res = await fetch("/api/tenants/modules", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": getActiveTenantId(),
        },
        body: JSON.stringify({ [item.moduleKey]: newVal }),
      });
      if (!res.ok) throw new Error("Gagal mengupdate modul");
      await queryClient.invalidateQueries({ queryKey: ["/api/tenants/profile"] });
      toast({
        title: newVal ? `${item.title} diaktifkan` : `${item.title} dinonaktifkan`,
        description: newVal
          ? "Fitur sudah aktif dan siap digunakan."
          : "Fitur berhasil dinonaktifkan.",
      });
      setSelectedFeature(null);
    } catch {
      toast({ title: "Gagal", description: "Coba lagi beberapa saat.", variant: "destructive" });
    } finally {
      setToggling(null);
    }
  };

  const filtered =
    activeCategory === "Semua"
      ? CATALOG
      : CATALOG.filter((f) => f.category === activeCategory);

  const activeModules = CATALOG.filter((f) => isModuleActive(f));

  return (
    <div className="flex-1 h-full bg-slate-50 overflow-y-auto pb-6">
      {/* ── HEADER ── */}
      <div className="bg-white border-b border-slate-100 sticky top-0 z-10">
        <div className="flex items-center gap-3 px-4 py-4">
          <button
            onClick={() => setLocation("/hub")}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors"
            data-testid="button-back-hub"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-black text-slate-800" data-testid="text-marketplace-title">
              Marketplace Fitur
            </h1>
            <p className="text-[11px] text-slate-400">Aktifkan modul sesuai kebutuhan bisnis</p>
          </div>
          <button
            onClick={() => setShowPlans(true)}
            className="flex items-center gap-1.5 bg-violet-50 border border-violet-200 text-violet-700 text-xs font-bold px-3 py-1.5 rounded-xl hover:bg-violet-100 transition-colors"
            data-testid="button-view-plans"
          >
            <Crown size={13} />
            Paket
          </button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-5">

        {/* ── PLAN BANNER ── */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-5 text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white" />
            <div className="absolute -bottom-16 -left-8 w-40 h-40 rounded-full bg-white" />
          </div>
          <div className="relative flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={14} className="text-yellow-400" />
                <span className="text-[11px] font-bold text-white/60 uppercase tracking-wide">
                  Paket Saat Ini
                </span>
              </div>
              <h2 className="text-2xl font-black mb-1">
                {PLANS.find((p) => p.tier === currentPlan)?.name ?? "Starter"}
              </h2>
              <p className="text-white/60 text-xs">
                {activeModules.length} modul aktif dari {CATALOG.length} tersedia
              </p>
            </div>
            <button
              onClick={() => setShowPlans(true)}
              className="flex items-center gap-1 bg-white text-slate-800 font-bold text-xs px-3 py-2 rounded-xl hover:bg-slate-100 transition-colors"
              data-testid="button-upgrade"
            >
              Upgrade <ChevronRight size={13} />
            </button>
          </div>

          {/* Progress bar */}
          <div className="relative mt-4">
            <div className="flex justify-between text-[10px] text-white/50 mb-1.5">
              <span>Modul Aktif</span>
              <span>{activeModules.length} / {CATALOG.length}</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-white/70 rounded-full transition-all duration-500"
                style={{ width: `${(activeModules.length / CATALOG.length) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* ── ACTIVE MODULES ── */}
        {activeModules.length > 0 && (
          <div>
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">
              Modul Aktif
            </h2>
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {activeModules.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedFeature(item)}
                  className="flex-shrink-0 flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-3 py-2 shadow-sm hover:shadow-md hover:border-slate-300 transition-all"
                  data-testid={`chip-active-${item.id}`}
                >
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${item.iconBg}`}>
                    <item.icon size={14} className={item.iconColor} />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-slate-700 whitespace-nowrap">{item.title}</p>
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                      <span className="text-[10px] text-emerald-600 font-semibold">Aktif</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── CATEGORY FILTER ── */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeCategory === cat
                  ? "bg-slate-800 text-white shadow-sm"
                  : "bg-white text-slate-500 border border-slate-200 hover:border-slate-300"
              }`}
              data-testid={`filter-cat-${cat}`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* ── FEATURE GRID ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((item) => {
            const active = isModuleActive(item);
            const unlocked = canActivate(item);
            const isToggling = toggling === item.id;

            return (
              <div
                key={item.id}
                className={`bg-white rounded-2xl border-2 transition-all duration-200 overflow-hidden ${
                  active
                    ? "border-emerald-200 shadow-emerald-50 shadow-md"
                    : unlocked
                    ? "border-slate-200 hover:border-slate-300 hover:shadow-md"
                    : "border-slate-100 opacity-70"
                }`}
                data-testid={`card-feature-${item.id}`}
              >
                <div className="p-4">
                  {/* Top row */}
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${item.iconBg}`}>
                      <item.icon size={18} className={item.iconColor} />
                    </div>
                    <div className="flex items-center gap-2">
                      {item.badge && (
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                          item.badge === "Pro"
                            ? "bg-violet-50 text-violet-600 border-violet-200"
                            : "bg-orange-50 text-orange-600 border-orange-200"
                        }`}>
                          {item.badge}
                        </span>
                      )}
                      {!unlocked && (
                        <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center">
                          <Lock size={11} className="text-slate-400" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Title + description */}
                  <h3 className="font-black text-slate-800 text-sm mb-1">{item.title}</h3>
                  <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">{item.description}</p>
                </div>

                {/* Footer */}
                <div className={`px-4 py-3 flex items-center justify-between border-t ${
                  active ? "bg-emerald-50/50 border-emerald-100" : "bg-slate-50/50 border-slate-100"
                }`}>
                  {/* Plan badge */}
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    item.requiredPlan === "free"
                      ? "bg-slate-100 text-slate-500"
                      : item.requiredPlan === "growth"
                      ? "bg-blue-50 text-blue-600"
                      : "bg-violet-50 text-violet-600"
                  }`}>
                    {item.requiredPlan === "free" ? "Gratis" : item.requiredPlan === "growth" ? "Growth" : "Pro"}
                  </span>

                  {/* Toggle */}
                  {unlocked ? (
                    <button
                      onClick={() => handleToggle(item)}
                      disabled={isToggling}
                      className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition-all active:scale-95 ${
                        active
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                          : "bg-slate-800 text-white hover:bg-slate-700"
                      } ${isToggling ? "opacity-60" : ""}`}
                      data-testid={`toggle-${item.id}`}
                    >
                      {isToggling ? (
                        <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                      ) : active ? (
                        <ToggleRight size={14} />
                      ) : (
                        <ToggleLeft size={14} />
                      )}
                      {active ? "Aktif" : "Aktifkan"}
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowPlans(true)}
                      className="flex items-center gap-1 text-[11px] font-bold text-violet-600 hover:text-violet-700 transition-colors"
                      data-testid={`upgrade-${item.id}`}
                    >
                      <Crown size={11} />
                      Upgrade
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── INFO FOOTER ── */}
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <Info size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700 leading-relaxed">
            Beberapa fitur membutuhkan upgrade paket. Perubahan modul langsung aktif tanpa restart aplikasi.
          </p>
        </div>
      </div>

      {/* ── FEATURE DETAIL DRAWER ── */}
      {selectedFeature && (
        <>
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-[60]"
            onClick={() => setSelectedFeature(null)}
          />
          <div className="fixed inset-x-0 bottom-0 z-[70] bg-white rounded-t-3xl shadow-2xl">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-200" />
            </div>
            <div className="px-5 pb-6 pt-3">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${selectedFeature.iconBg}`}>
                    <selectedFeature.icon size={22} className={selectedFeature.iconColor} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 text-base">{selectedFeature.title}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      {isModuleActive(selectedFeature) ? (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Aktif
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-slate-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                          Tidak Aktif
                        </span>
                      )}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        selectedFeature.requiredPlan === "free"
                          ? "bg-slate-100 text-slate-500"
                          : selectedFeature.requiredPlan === "growth"
                          ? "bg-blue-50 text-blue-600"
                          : "bg-violet-50 text-violet-600"
                      }`}>
                        {selectedFeature.requiredPlan === "free" ? "Gratis" : selectedFeature.requiredPlan === "growth" ? "Growth" : "Pro"}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedFeature(null)}
                  className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Description */}
              <p className="text-sm text-slate-600 leading-relaxed mb-5">{selectedFeature.longDesc}</p>

              {/* Action */}
              {canActivate(selectedFeature) ? (
                <button
                  onClick={() => handleToggle(selectedFeature)}
                  disabled={toggling === selectedFeature.id}
                  className={`w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.99] ${
                    isModuleActive(selectedFeature)
                      ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      : "bg-slate-800 text-white hover:bg-slate-700 shadow-lg shadow-slate-200"
                  }`}
                  data-testid="button-toggle-detail"
                >
                  {toggling === selectedFeature.id ? (
                    <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  ) : isModuleActive(selectedFeature) ? (
                    <>
                      <ToggleRight size={16} />
                      Nonaktifkan Modul
                    </>
                  ) : (
                    <>
                      <Zap size={16} />
                      Aktifkan Sekarang
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={() => { setSelectedFeature(null); setShowPlans(true); }}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 bg-violet-600 text-white hover:bg-violet-700 transition-all shadow-lg shadow-violet-200 active:scale-[0.99]"
                  data-testid="button-upgrade-detail"
                >
                  <Crown size={16} />
                  Upgrade ke {selectedFeature.requiredPlan === "growth" ? "Growth" : "Pro"}
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── PLANS MODAL ── */}
      {showPlans && (
        <>
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-[3px] z-[80]"
            onClick={() => setShowPlans(false)}
          />
          <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden">
              {/* Modal header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="font-black text-slate-800 text-lg">Pilih Paket</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Unlock lebih banyak fitur untuk bisnis kamu</p>
                </div>
                <button
                  onClick={() => setShowPlans(false)}
                  className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-5 space-y-3">
                {PLANS.map((plan) => {
                  const isCurrent = plan.tier === currentPlan;
                  return (
                    <div
                      key={plan.tier}
                      className={`rounded-2xl border-2 p-4 relative transition-all ${
                        plan.popular
                          ? "border-blue-400 bg-blue-50/30"
                          : isCurrent
                          ? "border-slate-300 bg-slate-50"
                          : "border-slate-200"
                      }`}
                      data-testid={`plan-card-${plan.tier}`}
                    >
                      {plan.popular && (
                        <span className="absolute -top-3 left-4 text-[10px] font-black bg-blue-500 text-white px-2.5 py-0.5 rounded-full">
                          PALING POPULER
                        </span>
                      )}
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-black text-slate-800">{plan.name}</h3>
                          <p className="text-lg font-black text-slate-800">
                            {plan.price}
                            {plan.tier !== "free" && <span className="text-xs font-semibold text-slate-400">/bln</span>}
                          </p>
                        </div>
                        {isCurrent ? (
                          <span className="text-[11px] font-black bg-slate-200 text-slate-600 px-2.5 py-1 rounded-xl">
                            Paket Kamu
                          </span>
                        ) : (
                          <button className={`text-xs font-black px-3 py-1.5 rounded-xl text-white transition-colors ${
                            plan.tier === "growth" ? "bg-blue-500 hover:bg-blue-600" : "bg-violet-500 hover:bg-violet-600"
                          }`}>
                            Pilih
                          </button>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {plan.features.map((f) => (
                          <div key={f} className="flex items-center gap-2">
                            <CheckCircle2 size={12} className={plan.popular ? "text-blue-500" : "text-slate-400"} />
                            <span className="text-xs text-slate-600">{f}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
