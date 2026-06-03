import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { 
  BarChart3, 
  Box, 
  Package, 
  Users2, 
  FileText, 
  Store, 
  Edit2, 
  LogOut,
  Printer,
  ShoppingBag,
  Download,
  CheckCircle2,
  Smartphone,
  ClipboardList,
  Building2,
  ChevronDown,
  MapPin,
} from "lucide-react";
import { UnifiedBottomNav } from "@/components/navigation/UnifiedBottomNav";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/context/TenantContext";
import { useTenantProfile } from "@/hooks/api/useTenantProfile";
import { Skeleton } from "@/components/ui/skeleton";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { useOutlet } from "@/context/OutletContext";
import { clearActiveTenantCache } from "@/lib/tenant";
import { clearActiveOutletId } from "@/lib/outlet";

type CurrentUser = {
  id: string;
  name: string;
  email: string;
  username?: string;
  role?: string;
};

function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (body?.success && body?.data) setUser(body.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { user, loading };
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function HomePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { tenantId } = useTenant();
  const { data: profile, isLoading: profileLoading } = useTenantProfile(tenantId);
  const { user, loading: userLoading } = useCurrentUser();
  const { activeOutlet, outlets, setActiveOutlet, isLoading: outletLoading } = useOutlet();
  const [showOutletPicker, setShowOutletPicker] = useState(false);

  const storeName = profile?.tenant?.name ?? "—";
  const storeInitials = storeName !== "—" ? getInitials(storeName) : "..";
  const userRole = user?.role
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
    : "Owner";

  const MENU_ITEMS = [
    {
      id: 'marketplace',
      title: 'Marketplace',
      icon: ShoppingBag,
      color: 'bg-violet-100 text-violet-600',
      subtitle: 'Aktifkan fitur bisnis',
      highlight: true,
    },
    {
      id: 'dashboard',
      title: 'Dashboard',
      icon: BarChart3,
      color: 'bg-blue-100 text-blue-600',
      subtitle: 'Lihat ringkasan',
    },
    {
      id: 'products',
      title: 'Produk',
      icon: Box,
      color: 'bg-orange-100 text-orange-600',
      subtitle: 'Kelola menu produk',
    },
    {
      id: 'stock',
      title: 'Stok',
      icon: Package,
      color: 'bg-purple-100 text-purple-600',
      subtitle: 'Kelola stok barang',
    },
    {
      id: 'employees',
      title: 'Karyawan',
      icon: Users2,
      color: 'bg-green-100 text-green-600',
      subtitle: 'Kelola karyawan',
    },
    {
      id: 'reports',
      title: 'Laporan',
      icon: FileText,
      color: 'bg-pink-100 text-pink-600',
      subtitle: 'Lihat laporan penjualan',
    },
    {
      id: 'outlets',
      title: 'Cabang',
      icon: Building2,
      color: 'bg-teal-100 text-teal-600',
      subtitle: 'Kelola outlet & cabang',
    },
    {
      id: 'store',
      title: 'Profil Toko',
      icon: Store,
      color: 'bg-slate-100 text-slate-600',
      subtitle: 'Pengaturan toko',
    },
    {
      id: 'printers',
      title: 'Printers',
      icon: Printer,
      color: 'bg-cyan-100 text-cyan-600',
      subtitle: 'Pairing & test print',
    },
    {
      id: 'local-orders',
      title: 'Order Offline',
      icon: ClipboardList,
      color: 'bg-indigo-100 text-indigo-600',
      subtitle: 'Transaksi & sinkronisasi',
    },
  ];

  const handleNavigate = (menuId: string) => {
    const routes: Record<string, string> = {
      marketplace: "/marketplace",
      dashboard: "/dashboard",
      products: "/products",
      stock: "/stock",
      employees: "/employees",
      reports: "/reports",
      store: "/store-profile",
      printers: "/printers",
      "local-orders": "/local-orders",
      outlets: "/outlets",
    };

    const route = routes[menuId];

    if (route) {
      setLocation(route);
      return;
    }

    toast({
      title: "Fitur dalam pengembangan",
      description: `Halaman ${MENU_ITEMS.find((m) => m.id === menuId)?.title} sedang dalam pengembangan`,
    });
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "include",
      });
      clearActiveTenantCache();
      clearActiveOutletId();
      localStorage.clear();
      sessionStorage.clear(); // Prevent cart/session data from leaking to next tenant login
      setLocation("/login");
    } catch {
      toast({
        title: "Gagal logout",
        description: "Terjadi kesalahan saat keluar. Coba lagi.",
        variant: "destructive",
      });
    }
  };

  const isLoading = profileLoading || userLoading;
  const { canInstall, isInstalled, install } = usePwaInstall();

  const handleInstall = async () => {
    await install();
  };

  return (
    <div className="flex-1 h-full bg-slate-50 overflow-y-auto pb-20">
      <header className="bg-white border-b border-slate-200 p-4 sticky top-0 z-10">
        <h1 className="text-xl font-extrabold text-slate-800" data-testid="text-page-title">
          Manajemen
        </h1>
        <p className="text-xs text-slate-500" data-testid="text-page-subtitle">
          Pengaturan toko & laporan
        </p>
      </header>

      {/* Profile Card */}
      <div className="p-4">
        <div className="bg-slate-800 text-white p-5 rounded-2xl flex items-center gap-4 shadow-lg shadow-slate-300" data-testid="card-profile">
          {isLoading ? (
            <Skeleton className="w-12 h-12 rounded-full bg-white/20" />
          ) : (
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0" data-testid="text-avatar">
              {storeInitials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-36 bg-white/20 rounded" />
                <Skeleton className="h-3 w-24 bg-white/10 rounded" />
              </div>
            ) : (
              <>
                <h3 className="font-bold text-lg truncate" data-testid="text-store-name">
                  {storeName}
                </h3>
                <p className="text-xs text-slate-300" data-testid="text-branch-info">
                  {user?.name ? `${user.name} • ` : ""}{userRole}
                </p>
              </>
            )}
          </div>
          <button 
            className="p-2 bg-white/10 rounded-lg hover:bg-white/20 flex-shrink-0"
            data-testid="button-edit-profile"
            onClick={() => setLocation("/store-profile")}
          >
            <Edit2 size={16} />
          </button>
        </div>
      </div>

      {/* Outlet Switcher */}
      <div className="px-4 pb-3">
        <button
          onClick={() => setShowOutletPicker((v) => !v)}
          className="w-full flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 text-left hover:border-blue-300 hover:shadow-sm transition-all"
          data-testid="button-outlet-switcher"
        >
          <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <Building2 size={16} className="text-teal-600" />
          </div>
          <div className="flex-1 min-w-0">
            {outletLoading ? (
              <Skeleton className="h-4 w-32" />
            ) : (
              <>
                <p className="text-xs font-semibold text-slate-500">Cabang Aktif</p>
                <p className="text-sm font-bold text-slate-800 truncate">
                  {activeOutlet?.name ?? "—"}
                  {activeOutlet?.address && (
                    <span className="font-normal text-slate-400 ml-1.5 text-xs">
                      <MapPin size={10} className="inline -mt-0.5" /> {activeOutlet.address}
                    </span>
                  )}
                </p>
              </>
            )}
          </div>
          <ChevronDown
            size={16}
            className={`text-slate-400 transition-transform flex-shrink-0 ${showOutletPicker ? "rotate-180" : ""}`}
          />
        </button>

        {/* Dropdown list */}
        {showOutletPicker && outlets.length > 1 && (
          <div className="mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            {outlets.map((o) => (
              <button
                key={o.id}
                onClick={() => { setActiveOutlet(o); setShowOutletPicker(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors ${
                  o.id === activeOutlet?.id ? "bg-blue-50" : ""
                }`}
                data-testid={`button-outlet-pick-${o.id}`}
              >
                <Building2 size={14} className={o.id === activeOutlet?.id ? "text-blue-500" : "text-slate-400"} />
                <span className={`text-sm font-semibold ${o.id === activeOutlet?.id ? "text-blue-700" : "text-slate-700"}`}>
                  {o.name}
                </span>
                {o.isDefault && (
                  <span className="ml-auto text-[10px] font-bold bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full">UTAMA</span>
                )}
                {o.id === activeOutlet?.id && (
                  <CheckCircle2 size={14} className="ml-auto text-blue-500" />
                )}
              </button>
            ))}
            <div className="border-t border-slate-100">
              <button
                onClick={() => { setShowOutletPicker(false); setLocation("/outlets"); }}
                className="w-full text-center text-xs font-semibold text-blue-600 py-3 hover:bg-blue-50 transition-colors"
                data-testid="button-outlet-manage"
              >
                Kelola Cabang →
              </button>
            </div>
          </div>
        )}

        {showOutletPicker && outlets.length <= 1 && (
          <div className="mt-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="border-t border-slate-100">
              <button
                onClick={() => { setShowOutletPicker(false); setLocation("/outlets"); }}
                className="w-full text-center text-xs font-semibold text-blue-600 py-3 hover:bg-blue-50 transition-colors"
                data-testid="button-outlet-manage-single"
              >
                Kelola Cabang →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Menu Grid */}
      <div className="p-4 pt-0 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {MENU_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => handleNavigate(item.id)}
            className={`p-4 rounded-2xl border shadow-sm hover:shadow-md active:scale-95 transition-all flex flex-col items-start gap-3 ${
              (item as any).highlight
                ? "bg-gradient-to-br from-violet-600 to-violet-700 border-violet-500 text-white"
                : "bg-white border-slate-100"
            }`}
            data-testid={`button-menu-${item.id}`}
          >
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                (item as any).highlight ? "bg-white/20" : item.color
              }`}
            >
              <item.icon size={20} className={(item as any).highlight ? "text-white" : ""} />
            </div>
            <div className="text-left">
              <h4
                className={`font-bold ${(item as any).highlight ? "text-white" : "text-slate-700"}`}
                data-testid={`text-menu-title-${item.id}`}
              >
                {item.title}
              </h4>
              <p
                className={`text-[10px] ${(item as any).highlight ? "text-white/70" : "text-slate-400"}`}
                data-testid={`text-menu-subtitle-${item.id}`}
              >
                {item.subtitle}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Install App Card */}
      <div className="px-4 pb-3">
        {isInstalled ? (
          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3" data-testid="card-pwa-installed">
            <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-800">Aplikasi sudah terpasang</p>
              <p className="text-[11px] text-emerald-600">AuraPoS berjalan sebagai aplikasi native di perangkat ini.</p>
            </div>
          </div>
        ) : canInstall ? (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-4" data-testid="card-pwa-install">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
                <Smartphone size={18} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-blue-900">Pasang di Perangkat Ini</p>
                <p className="text-[11px] text-blue-600 mt-0.5">
                  Install AuraPoS agar bisa dipakai offline langsung dari layar utama, tanpa buka browser.
                </p>
              </div>
            </div>
            <button
              onClick={handleInstall}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-sm font-semibold py-2.5 rounded-xl transition-all"
              data-testid="button-pwa-install"
            >
              <Download size={16} />
              Pasang Aplikasi
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 bg-slate-100 border border-slate-200 rounded-2xl px-4 py-3" data-testid="card-pwa-pending">
            <Smartphone size={20} className="text-slate-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-600">Pasang sebagai Aplikasi</p>
              <p className="text-[11px] text-slate-400">
                Buka halaman ini di Chrome, lalu ketuk ⋮ → <strong>Tambahkan ke layar utama</strong>.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 pt-0">
        <button 
          onClick={handleLogout}
          className="w-full bg-red-50 text-red-600 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-100 transition-colors border border-red-200"
          data-testid="button-logout"
        >
          <LogOut size={18} />
          Keluar Aplikasi
        </button>
        <p className="text-center text-[10px] text-slate-400 mt-4" data-testid="text-version">
          AuraPOS v1.0.2 • Build 20231122
        </p>
      </div>

      {/* Mobile Navigation */}
      <UnifiedBottomNav cartCount={0} />
    </div>
  );
}
