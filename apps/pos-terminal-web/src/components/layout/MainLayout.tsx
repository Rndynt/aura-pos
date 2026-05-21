import { Sidebar } from "@/components/pos/Sidebar";
import { UnifiedBottomNav } from "@/components/navigation/UnifiedBottomNav";

interface MainLayoutProps {
  children: React.ReactNode;
  cartCount?: number;
  onCartClick?: () => void;
  hideBottomNav?: boolean;
}

export function MainLayout({ children, cartCount = 0, onCartClick, hideBottomNav }: MainLayoutProps) {
  return (
    <div className="flex h-screen bg-background w-full overflow-hidden">

      {/* Desktop Sidebar */}
      <Sidebar />
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      {!hideBottomNav && (
        <UnifiedBottomNav cartCount={cartCount} onCartClick={onCartClick} />
      )}
    </div>
  );
}
