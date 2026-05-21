import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Bluetooth, CheckCircle2, Link2Off, Printer } from "lucide-react";
import { bluetoothReceiptPrinter } from "@/lib/receiptPrinter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

export default function PrintersPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [state, setState] = useState(bluetoothReceiptPrinter.getState());
  const [isBusy, setIsBusy] = useState(false);

  const refreshState = () => setState(bluetoothReceiptPrinter.getState());

  useEffect(() => {
    bluetoothReceiptPrinter.reconnectIfPossible().catch(() => {}).finally(refreshState);
  }, []);

  const handlePair = async () => {
    try {
      setIsBusy(true);
      const name = await bluetoothReceiptPrinter.pairAndConnect();
      refreshState();
      toast({ title: "Printer terhubung", description: `${name} siap dipakai untuk cetak struk.` });
    } catch (error) {
      toast({ title: "Pairing gagal", description: error instanceof Error ? error.message : "Gagal pair printer", variant: "destructive" });
    } finally {
      setIsBusy(false);
    }
  };

  const handleDisconnect = async () => {
    await bluetoothReceiptPrinter.disconnect();
    refreshState();
    toast({ title: "Printer diputus", description: "Koneksi printer dimatikan manual." });
  };

  const handleTestPrint = async () => {
    try {
      setIsBusy(true);
      await bluetoothReceiptPrinter.print({
        orderNumber: "TEST-PRINT",
        tenantName: "AuraPoS Printer Hub",
        paymentMethod: "cash",
        createdAt: new Date(),
        subtotal: 10000,
        tax: 1000,
        serviceCharge: 500,
        total: 11500,
        items: [{ name: "Test item", qty: 1, unitPrice: 10000, total: 10000 }],
      });
      toast({ title: "Test print sukses", description: "Silakan cek hasil cetak di printer 58mm." });
    } catch (error) {
      toast({ title: "Test print gagal", description: error instanceof Error ? error.message : "Gagal test print", variant: "destructive" });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="flex-1 h-full bg-slate-50 overflow-y-auto pb-20">
      <header className="bg-white border-b border-slate-200 p-4 sticky top-0 z-10 flex items-center gap-3">
        <button onClick={() => setLocation("/hub")} className="p-2 rounded-lg border border-slate-200 bg-white">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-extrabold text-slate-800">Printer Hub</h1>
          <p className="text-xs text-slate-500">Pairing & testing printer struk Bluetooth 58mm</p>
        </div>
      </header>

      <div className="p-4 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Printer className="text-slate-600" size={18} />
            <h2 className="font-bold text-slate-800">Receipt Printer</h2>
          </div>
          <p className="text-sm text-slate-500">Status: <span className="font-semibold">{state}</span></p>
          <p className="text-xs text-slate-400">Device ID tersimpan: {bluetoothReceiptPrinter.getPairedDeviceId() || "belum ada"}</p>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handlePair} disabled={isBusy || state === "connecting"}>
              <Bluetooth className="mr-2" size={16} /> Pair / Connect
            </Button>
            <Button variant="secondary" onClick={handleTestPrint} disabled={isBusy || state !== "connected"}>
              <CheckCircle2 className="mr-2" size={16} /> Test Print
            </Button>
            <Button variant="outline" onClick={handleDisconnect} disabled={isBusy || state !== "connected"}>
              <Link2Off className="mr-2" size={16} /> Disconnect Manual
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
