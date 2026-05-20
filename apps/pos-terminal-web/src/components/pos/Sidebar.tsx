import { ShoppingBag, LayoutGrid, Square, Settings, LogOut } from "lucide-react";
import { useLocation } from "wouter";
import { useTenant } from "@/context/TenantContext";

type NavItemProps = {
  icon: typeof LayoutGrid;
  label: string;
  route?: string;
  isActive?: boolean;
  onClick?: () => void;
  testId?: string;
  className?: string;
};

function NavItem({ 
  icon: Icon, 
  label, 
  isActive = false, 
  onClick,
  testId,
  className = ""
}: NavItemProps) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`p-3 rounded-xl transition-all flex justify-center group relative ${
        isActive
          ? "bg-blue-50 text-blue-600"
          : "text-slate-400 hover:bg-slate-50"
      } ${className}`}
    >
      <Icon size={22} />
      <span className="absolute left-14 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
        {label}
      </span>
    </button>
  );
}

export function Sidebar() {
  const [location, setLocation] = useLocation();
  const { hasModule, isLoading } = useTenant();

  const handleNavigation = (route: string) => {
    setLocation(route);
  };

  const isPOSActive = location === "/pos" || location === "/";
  const isTablesActive = location === "/tables";
  const isManagementActive = ["/dashboard", "/products", "/stock", "/reports", "/employees", "/store-profile", "/orders"].includes(location);

  const showTables = !isLoading && hasModule('enable_table_management');

  return (
    <aside className="hidden md:flex w-20 bg-white border-r border-slate-200 flex-col items-center py-6 flex-shrink-0 z-30">
      {/* Logo */}
      <div className="mb-8 p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-200">
        <ShoppingBag className="text-white w-6 h-6" />
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 w-full flex flex-col gap-4 px-2">
        <NavItem
          icon={LayoutGrid}
          label="POS Menu"
          isActive={isPOSActive}
          onClick={() => handleNavigation("/pos")}
          testId="button-nav-pos"
        />

        {showTables && (
          <NavItem
            icon={Square}
            label="Tables"
            isActive={isTablesActive}
            onClick={() => handleNavigation("/tables")}
            testId="button-nav-tables"
          />
        )}

        <NavItem
          icon={Settings}
          label="Management"
          isActive={isManagementActive}
          onClick={() => handleNavigation("/hub")}
          testId="button-nav-management"
        />
      </nav>

      {/* Logout Button */}
      <button 
        className="p-3 text-slate-400 hover:text-red-500 transition-colors"
        data-testid="button-nav-logout"
      >
        <LogOut size={22} />
      </button>
    </aside>
  );
}

export function SidebarContent({ onItemClick }: { onItemClick?: () => void }) {
  const [location, setLocation] = useLocation();
  const { hasModule, isLoading } = useTenant();

  const handleNavigation = (route: string) => {
    setLocation(route);
    onItemClick?.();
  };

  const isPOSActive = location === "/pos" || location === "/";
  const isTablesActive = location === "/tables";
  const isManagementActive = ["/dashboard", "/products", "/stock", "/reports", "/employees", "/store-profile", "/orders"].includes(location);

  const showTables = !isLoading && hasModule('enable_table_management');

  return (
    <div className="flex flex-col gap-2 mt-8">
      <button
        onClick={() => handleNavigation("/pos")}
        data-testid="button-nav-mobile-pos"
        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
          isPOSActive
            ? "bg-blue-50 text-blue-600"
            : "text-slate-600 hover:bg-slate-50"
        }`}
      >
        <LayoutGrid size={20} />
        <span className="font-medium">POS Menu</span>
      </button>

      {showTables && (
        <button
          onClick={() => handleNavigation("/tables")}
          data-testid="button-nav-mobile-tables"
          className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
            isTablesActive
              ? "bg-blue-50 text-blue-600"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <Square size={20} />
          <span className="font-medium">Tables</span>
        </button>
      )}

      <button
        onClick={() => handleNavigation("/hub")}
        data-testid="button-nav-mobile-management"
        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
          isManagementActive
            ? "bg-blue-50 text-blue-600"
            : "text-slate-600 hover:bg-slate-50"
        }`}
      >
        <Settings size={20} />
        <span className="font-medium">Management</span>
      </button>

      <div className="flex-1 min-h-8" />

      <button
        onClick={() => onItemClick?.()}
        data-testid="button-nav-mobile-logout"
        className="w-full flex items-center gap-3 p-3 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
      >
        <LogOut size={20} />
        <span className="font-medium">Logout</span>
      </button>
    </div>
  );
}
