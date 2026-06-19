import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  Bluetooth, CheckCircle2, Link2Off,
  Printer, Globe, Wifi, WifiOff, RefreshCw, ChevronLeft,
} from "lucide-react";
import { bluetoothReceiptPrinter } from "@/lib/receiptPrinter";
import {
  ALL_PRINTER_PROVIDERS,
  bluetoothPrinterProvider,
  browserPrintProvider,
  getActivePrinterProvider,
} from "@/lib/printerProvider";
import type { PrinterProvider } from "@/lib/printerProvider";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PrintQueuePanel } from "@/components/offline/PrintQueuePanel";

const TEST_PAYLOAD = {
  orderNumber: "TEST-PRINT",
  tenantName: "AuraPoS Printer Hub",
  paymentMethod: "cash" as const,
  createdAt: new Date(),
  subtotal: 10_000,
  tax: 1_000,
  serviceCharge: 500,
  total: 11_500,
  items: [{ name: "Test item — cek printer 58mm", qty: 1, unitPrice: 10_000, total: 10_000 }],
};

// ─── Provider card ────────────────────────────────────────────────────────────

function ProviderCard({
  provider,
  isActive,
  onTestPrint,
  isBusy,
  extraAction,
}: {
  provider: PrinterProvider;
  isActive: boolean;
  onTestPrint: (p: PrinterProvider) => void;
  isBusy: boolean;
  extraAction?: React.ReactNode;
}) {
  const available = provider.isAvailable();

  const Icon = provider.id === "bluetooth" ? Bluetooth : Globe;

  return (
    <div
      data-testid={`card-printer-provider-${provider.id}`}
      className={`bg-white rounded-2xl border p-4 space-y-3 transition-all ${
        isActive
          ? "border-blue-400 ring-1 ring-blue-200 shadow-sm"
          : "border-slate-200"
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon size={18} className={available ? "text-blue-500" : "text-slate-300"} />
        <h2 className="font-bold text-slate-800">{provider.label}</h2>
        {isActive && (
          <Badge className="ml-auto bg-blue-100 text-blue-700 border-blue-200 text-xs" variant="outline">
            Aktif
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {available ? (
          <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
            <Wifi size={12} /> Tersedia
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <WifiOff size={12} /> Tidak tersedia
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {extraAction}
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onTestPrint(provider)}
          disabled={isBusy || !available}
          data-testid={`button-test-print-${provider.id}`}
        >
          <CheckCircle2 className="mr-1.5" size={14} /> Test Print
        </Button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PrintersPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [btState, setBtState] = useState(bluetoothReceiptPrinter.getState());
  const [isBusy, setIsBusy] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<PrinterProvider>(
    getActivePrinterProvider() ?? browserPrintProvider
  );

  const refreshBtState = () => {
    setBtState(bluetoothReceiptPrinter.getState());
    setActiveProvider(getActivePrinterProvider() ?? browserPrintProvider);
  };

  useEffect(() => {
    bluetoothReceiptPrinter.reconnectIfPossible().catch(() => {}).finally(refreshBtState);
  }, []);

  const handleTestPrint = async (provider: PrinterProvider) => {
    try {
      setIsBusy(provider.id);
      await provider.print({ ...TEST_PAYLOAD, createdAt: new Date() });
      toast({ title: "Test print sukses", description: `Dicetak via: ${provider.label}` });
    } catch (error) {
      toast({
        title: "Test print gagal",
        description: error instanceof Error ? error.message : "Gagal test print",
        variant: "destructive",
      });
    } finally {
      setIsBusy(null);
    }
  };

  const handlePairBluetooth = async () => {
    try {
      setIsBusy("pair");
      const name = await bluetoothReceiptPrinter.pairAndConnect();
      refreshBtState();
      toast({ title: "Printer terhubung", description: `${name} siap dipakai.` });
    } catch (error) {
      toast({
        title: "Pairing gagal",
        description: error instanceof Error ? error.message : "Gagal pair printer",
        variant: "destructive",
      });
    } finally {
      setIsBusy(null);
    }
  };

  const handleDisconnectBluetooth = async () => {
    await bluetoothReceiptPrinter.disconnect();
    refreshBtState();
    toast({ title: "Printer diputus", description: "Koneksi Bluetooth dimatikan." });
  };

  const handleForgetBluetooth = async () => {
    await bluetoothReceiptPrinter.forgetDevice();
    refreshBtState();
    toast({ title: "Device dihapus", description: "Pairing printer dihapus. Pair ulang dari tombol Pair." });
  };

  return (
    <div className="flex-1 h-full bg-slate-50 overflow-y-auto pb-20">
      <div className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLocation("/hub")}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            data-testid="button-back"
          >
            <ChevronLeft size={20} className="text-slate-600" />
          </button>
          <div>
            <h1 className="text-base font-bold text-slate-800 leading-tight">Printer Hub</h1>
            <p className="text-[11px] text-slate-400 leading-none">Manajemen printer &amp; antrian cetak struk</p>
          </div>
        </div>
        <button
          onClick={refreshBtState}
          className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
          title="Refresh status"
          data-testid="button-refresh-printer-status"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="p-4 space-y-4">

        {/* Active provider summary */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 flex items-center gap-2 text-sm">
          <Printer size={16} className="text-blue-500 flex-shrink-0" />
          <span className="text-blue-700">
            Printer aktif: <strong>{activeProvider.label}</strong>
            {activeProvider.id === "bluetooth" && (
              <span className="ml-1 text-blue-500">
                ({btState === "connected" ? "terkoneksi" : btState === "connecting" ? "menghubungkan…" : "terputus"})
              </span>
            )}
          </span>
        </div>

        {/* Provider cards */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-0.5">
            Provider yang tersedia
          </h3>

          {/* Bluetooth card */}
          <ProviderCard
            provider={bluetoothPrinterProvider}
            isActive={activeProvider.id === "bluetooth"}
            onTestPrint={handleTestPrint}
            isBusy={isBusy === "bluetooth"}
            extraAction={
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handlePairBluetooth}
                  disabled={isBusy === "pair" || btState === "connecting"}
                  data-testid="button-pair-bluetooth"
                >
                  <Bluetooth className="mr-1.5" size={14} />
                  {btState === "connected" ? "Pair Ulang" : "Pair / Connect"}
                </Button>
                {btState === "connected" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDisconnectBluetooth}
                    data-testid="button-disconnect-bluetooth"
                  >
                    <Link2Off className="mr-1.5" size={14} /> Putuskan
                  </Button>
                )}
                {bluetoothReceiptPrinter.getPairedDeviceId() && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-500 hover:bg-red-50"
                    onClick={handleForgetBluetooth}
                    data-testid="button-forget-bluetooth"
                  >
                    Hapus Pairing
                  </Button>
                )}
              </div>
            }
          />

          {/* Browser print card */}
          <ProviderCard
            provider={browserPrintProvider}
            isActive={activeProvider.id === "browser"}
            onTestPrint={handleTestPrint}
            isBusy={isBusy === "browser"}
          />
        </div>

        {/* Device info */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-1.5">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Info Perangkat
          </h3>
          <p className="text-xs text-slate-500">
            Bluetooth device ID:{" "}
            <span className="font-mono text-slate-700">
              {bluetoothReceiptPrinter.getPairedDeviceId() ?? "belum dipasangkan"}
            </span>
          </p>
          <p className="text-xs text-slate-500">
            Web Bluetooth didukung:{" "}
            <span className="font-semibold">
              {typeof navigator !== "undefined" && "bluetooth" in navigator ? "Ya" : "Tidak (gunakan Browser Print)"}
            </span>
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Provider prioritas: Bluetooth (jika paired) → Browser Print (fallback)
          </p>
        </div>

        {/* Print queue */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <PrintQueuePanel />
        </div>

      </div>
    </div>
  );
}
