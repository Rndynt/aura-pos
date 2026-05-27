import {
  ShoppingBag, LayoutGrid, UtensilsCrossed, ChefHat, Grip, LogOut,
  AlertTriangle, Printer, ClipboardList, Wifi, WifiOff, RefreshCw,
  CheckCircle2, Clock3, XCircle, Receipt,
} from "lucide-react";
import { useLocation } from "wouter";
import { useTenant } from "@/context/TenantContext";
import { useEffect, useState, useCallback } from "react";
import { offlineDb, runSyncEngine } from "@pos/offline";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

// ─── Compact sync status button for the sidebar ───────────────────────────────
function SidebarSyncButton() {
  const [pending, setPending]   = useState(0);
  const [failed, setFailed]     = useState(0);
  const [conflict, setConflict] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [p, f, c] = await Promise.all([
        offlineDb.sync_outbox.where("status").anyOf("pending", "syncing").count(),
        offlineDb.sync_outbox.where("status").equals("failed").count(),
        offlineDb.sync_conflicts.count(),
      ]);
      if (mounted) { setPending(p); setFailed(f); setConflict(c); }
    };
    load().catch(() => undefined);
    const t = setInterval(() => load().catch(() => undefined), 5000);
    return () => { mounted = false; clearInterval(t); };
  }, []);

  const { isOnline } = useNetworkStatus(pending);

  const handleSync = useCallback(async () => {
    if (isSyncing || !isOnline) return;
    setIsSyncing(true);
    try { await runSyncEngine(); } catch { /* no-op */ } finally { setIsSyncing(false); }
  }, [isSyncing, isOnline]);

  const severity = !isOnline ? "gray"
    : (failed > 0 || conflict > 0) ? "red"
    : pending > 0 ? "yellow"
    : "green";

  const colorMap = {
    green:  { dot: "bg-emerald-400",  icon: CheckCircle2, ring: "hover:bg-emerald-50" },
    yellow: { dot: "bg-amber-400",    icon: Clock3,       ring: "hover:bg-amber-50"   },
    red:    { dot: "bg-red-400",      icon: AlertTriangle,ring: "hover:bg-red-50"     },
    gray:   { dot: "bg-slate-400",    icon: WifiOff,      ring: "hover:bg-slate-100"  },
  }[severity];

  const Icon = isSyncing ? RefreshCw : colorMap.icon;

  const total = pending + failed + conflict;
  const tooltipText = !isOnline ? "Offline"
    : isSyncing ? "Sedang sync…"
    : failed > 0 ? `${failed} gagal — klik untuk retry`
    : conflict > 0 ? `${conflict} konflik`
    : pending > 0 ? `${pending} menunggu sync`
    : "Semua tersinkron";

  return (
    <button
      onClick={handleSync}
      title={tooltipText}
      data-testid="button-sidebar-sync"
      className={`group relative flex items-center justify-center w-11 h-11 rounded-xl transition-all duration-150 text-slate-400 ${colorMap.ring}`}
    >
      <Icon
        size={20}
        strokeWidth={1.8}
        className={`${severity === "red" ? "text-red-500" : severity === "yellow" ? "text-amber-500" : severity === "green" ? "text-emerald-500" : "text-slate-400"} ${isSyncing ? "animate-spin" : ""}`}
      />
      {/* Badge count */}
      {total > 0 && (
        <span className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full text-[10px] font-bold flex items-center justify-center text-white ${colorMap.dot}`}>
          {total > 9 ? "9+" : total}
        </span>
      )}
      {/* Tooltip */}
      <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-50">
        {tooltipText}
        <span className="absolute -left-1 top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800" />
      </span>
    </button>
  );
}

// ─── Desktop icon-only sidebar ────────────────────────────────────────────────
function SidebarItem({
  icon: Icon, label, isActive = false, onClick, testId,
}: {
  icon: typeof LayoutGrid; label: string;
  isActive?: boolean; onClick?: () => void; testId?: string;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      title={label}
      className={`group relative flex items-center justify-center w-11 h-11 rounded-xl transition-all duration-150 ${
        isActive
          ? "bg-blue-600 text-white shadow-md shadow-blue-400/30"
          : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      }`}
    >
      <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />

      {/* Tooltip */}
      <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-50">
        {label}
        <span className="absolute -left-1 top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800" />
      </span>
    </button>
  );
}

export function Sidebar() {
  const [location, setLocation] = useLocation();
  const { hasModule, isLoading } = useTenant();

  const showTables  = !isLoading && hasModule("enable_table_management");
  const showKitchen = !isLoading && hasModule("enable_kitchen_ticket");

  const nav = (path: string) => setLocation(path);
  const isHub = ["/hub", "/dashboard", "/products", "/stock", "/reports", "/employees", "/store-profile"].some(p => location === p || location.startsWith(p));

  return (
    <aside className="hidden md:flex flex-col items-center w-[68px] h-screen bg-white border-r border-slate-100 py-5 flex-shrink-0 z-30 gap-2">

      {/* Logo */}
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-md shadow-blue-300/40 mb-3 flex-shrink-0">
        <ShoppingBag size={18} className="text-white" strokeWidth={2.5} />
      </div>

      {/* Nav items */}
      <nav className="flex flex-col items-center gap-1.5 flex-1">
        <SidebarItem
          icon={LayoutGrid}
          label="Kasir / POS"
          isActive={location === "/pos" || location === "/"}
          onClick={() => nav("/pos")}
          testId="button-nav-pos"
        />

        <SidebarItem
          icon={Receipt}
          label="Pesanan"
          isActive={location.startsWith("/orders")}
          onClick={() => nav("/orders")}
          testId="button-nav-orders"
        />

        {showTables && (
          <SidebarItem
            icon={UtensilsCrossed}
            label="Meja"
            isActive={location.startsWith("/tables")}
            onClick={() => nav("/tables")}
            testId="button-nav-tables"
          />
        )}

        {showKitchen && (
          <SidebarItem
            icon={ChefHat}
            label="Dapur / Kitchen"
            isActive={location.startsWith("/kitchen")}
            onClick={() => nav("/kitchen")}
            testId="button-nav-kitchen"
          />
        )}

        <SidebarItem
          icon={Printer}
          label="Printer Hub"
          isActive={location.startsWith("/printers")}
          onClick={() => nav("/printers")}
          testId="button-nav-printers"
        />

        <SidebarItem
          icon={ClipboardList}
          label="Order Offline"
          isActive={location.startsWith("/local-orders")}
          onClick={() => nav("/local-orders")}
          testId="button-nav-local-orders"
        />

        <SidebarItem
          icon={AlertTriangle}
          label="Konflik Sync"
          isActive={location.startsWith("/sync-conflicts")}
          onClick={() => nav("/sync-conflicts")}
          testId="button-nav-sync-conflicts"
        />

        <SidebarItem
          icon={Grip}
          label="Hub / Manajemen"
          isActive={isHub}
          onClick={() => nav("/hub")}
          testId="button-nav-hub"
        />
      </nav>

      {/* Sync status indicator */}
      <SidebarSyncButton />

      {/* Logout */}
      <button
        className="flex items-center justify-center w-11 h-11 rounded-xl text-slate-300 hover:bg-red-50 hover:text-red-500 transition-all duration-150 flex-shrink-0"
        data-testid="button-nav-logout"
        title="Keluar"
      >
        <LogOut size={18} strokeWidth={1.8} />
      </button>
    </aside>
  );
}

// ─── SidebarContent (used in mobile sheet/drawer if needed) ───────────────────
export function SidebarContent({ onItemClick }: { onItemClick?: () => void }) {
  const [location, setLocation] = useLocation();
  const { hasModule, isLoading } = useTenant();

  const showTables  = !isLoading && hasModule("enable_table_management");
  const showKitchen = !isLoading && hasModule("enable_kitchen_ticket");

  const nav = (path: string) => { setLocation(path); onItemClick?.(); };
  const isHub = ["/hub", "/dashboard", "/products", "/stock", "/reports", "/employees", "/store-profile"].some(p => location === p || location.startsWith(p));

  const items = [
    { path: "/pos",             icon: LayoutGrid,     label: "Kasir / POS",      active: location === "/pos" || location === "/",   show: true         },
    { path: "/orders",          icon: Receipt,        label: "Pesanan",          active: location.startsWith("/orders"),            show: true         },
    { path: "/tables",          icon: UtensilsCrossed,label: "Meja",             active: location.startsWith("/tables"),            show: showTables   },
    { path: "/kitchen",         icon: ChefHat,        label: "Dapur / Kitchen",  active: location.startsWith("/kitchen"),           show: showKitchen  },
    { path: "/printers",        icon: Printer,        label: "Printer Hub",      active: location.startsWith("/printers"),          show: true         },
    { path: "/local-orders",    icon: ClipboardList,  label: "Order Offline",    active: location.startsWith("/local-orders"),      show: true         },
    { path: "/sync-conflicts",  icon: AlertTriangle,  label: "Konflik Sync",     active: location.startsWith("/sync-conflicts"),    show: true         },
    { path: "/hub",             icon: Grip,           label: "Hub / Manajemen",  active: isHub,                                     show: true         },
  ];

  return (
    <div className="flex flex-col gap-1 py-4">
      {items.filter(i => i.show).map(({ path, icon: Icon, label, active }) => (
        <button
          key={path}
          onClick={() => nav(path)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium ${
            active ? "bg-blue-50 text-blue-600" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
          }`}
        >
          <Icon size={18} strokeWidth={active ? 2.5 : 1.8} />
          {label}
        </button>
      ))}

      <div className="mt-2 pt-2 border-t border-slate-100">
        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all">
          <LogOut size={18} strokeWidth={1.8} />
          Keluar
        </button>
      </div>
    </div>
  );
}
