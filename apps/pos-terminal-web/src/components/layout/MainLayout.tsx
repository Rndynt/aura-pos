import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/pos/Sidebar";
import { UnifiedBottomNav } from "@/components/navigation/UnifiedBottomNav";
import { useTerminalIdentity } from "@/hooks/useTerminalIdentity";
import { usePrintWorker } from "@/hooks/usePrintWorker";

import { getPrintJobStats } from "@pos/offline";
import { getActiveTenantId } from "@/lib/tenant";
import { Printer } from "lucide-react";
import { useLocation } from "wouter";

interface MainLayoutProps {
  children: React.ReactNode;
  cartCount?: number;
  onCartClick?: () => void;
  hideBottomNav?: boolean;
}

export function MainLayout({ children, cartCount = 0, onCartClick, hideBottomNav }: MainLayoutProps) {
  const terminal = useTerminalIdentity();
  const [, setLocation] = useLocation();

  usePrintWorker({ terminalId: terminal?.terminalId ?? null, enabled: true });

  const { data: printStats } = useQuery({
    queryKey: ["print-job-stats", terminal?.terminalId],
    queryFn: () => {
      if (!terminal) return null;
      return getPrintJobStats(getActiveTenantId(), terminal.terminalId);
    },
    enabled: !!terminal,
    refetchInterval: 10_000,
  });

  const pendingPrintCount = (printStats?.pending ?? 0) + (printStats?.printing ?? 0);
  const failedPrintCount  = printStats?.failed ?? 0;
  const hasPrintAlert     = pendingPrintCount > 0 || failedPrintCount > 0;

  return (
    <div className="flex h-screen bg-background w-full overflow-hidden">

      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Print alert — only shown when there are pending/failed print jobs */}
        {hasPrintAlert && (
          <div className="flex-shrink-0 flex items-center justify-end px-4 pt-2">
            <button
              onClick={() => setLocation("/printers")}
              data-testid="button-print-status-badge"
              title="Buka antrian cetak"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold transition-colors
                         bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100"
            >
              <Printer size={13} />
              {failedPrintCount > 0 ? (
                <span className="text-red-600">{failedPrintCount} cetak gagal</span>
              ) : (
                <span>{pendingPrintCount} antrian cetak</span>
              )}
            </button>
          </div>
        )}

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
