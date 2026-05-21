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
  Printer 
} from "lucide-react";
import { UnifiedBottomNav } from "@/components/navigation/UnifiedBottomNav";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/context/TenantContext";
import { useTenantProfile } from "@/hooks/api/useTenantProfile";
import { Skeleton } from "@/components/ui/skeleton";

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

  const storeName = profile?.tenant?.name ?? "—";
  const storeInitials = storeName !== "—" ? getInitials(storeName) : "..";
  const userRole = user?.role
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
    : "Owner";

  const MENU_ITEMS = [
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
  ];

  const handleNavigate = (menuId: string) => {
    const routes: Record<string, string> = {
      dashboard: "/dashboard",
      products: "/products",
      stock: "/stock",
      employees: "/employees",
      reports: "/reports",
      store: "/store-profile",
      printers: "/printers",
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
      localStorage.clear();
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

      {/* Menu Grid */}
      <div className="p-4 pt-0 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {MENU_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => handleNavigate(item.id)}
            className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md active:scale-95 transition-all flex flex-col items-start gap-3"
            data-testid={`button-menu-${item.id}`}
          >
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.color}`}
            >
              <item.icon size={20} />
            </div>
            <div className="text-left">
              <h4 className="font-bold text-slate-700" data-testid={`text-menu-title-${item.id}`}>
                {item.title}
              </h4>
              <p className="text-[10px] text-slate-400" data-testid={`text-menu-subtitle-${item.id}`}>
                {item.subtitle}
              </p>
            </div>
          </button>
        ))}
      </div>

      <div className="p-4">
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
