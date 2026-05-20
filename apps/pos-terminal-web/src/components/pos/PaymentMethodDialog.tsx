// @ts-nocheck - React 19 compatibility with shadcn/ui components
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Banknote, CreditCard, QrCode, X } from "lucide-react";
import type { PaymentMethod } from "@/hooks/useCart";

type PaymentMethodDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (paymentMethod: PaymentMethod, cashReceived?: number) => void;
  onMethodChange?: (method: PaymentMethod) => void;
  cartTotal: number;
  isSubmitting?: boolean;
  defaultPaymentMethod?: PaymentMethod;
};

const formatIDR = (price: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);

export function PaymentMethodDialog({
  open,
  onClose,
  onConfirm,
  onMethodChange,
  cartTotal,
  isSubmitting = false,
  defaultPaymentMethod = "cash",
}: PaymentMethodDialogProps) {
  const [method, setMethod] = useState<PaymentMethod>(defaultPaymentMethod);

  const selectMethod = (m: PaymentMethod) => {
    setMethod(m);
    onMethodChange?.(m);
  };
  const [cashAmount, setCashAmount] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (open) {
      setMethod(defaultPaymentMethod);
      setCashAmount("");
      setIsProcessing(false);
    }
  }, [open, defaultPaymentMethod]);

  const change = (parseInt(cashAmount) || 0) - cartTotal;
  const isEnough = change >= 0;

  const handleQuickMoney = (amount: number) => {
    setCashAmount(amount.toString());
  };

  const handleProcess = () => {
    if (isSubmitting || isProcessing) return;
    if (method === 'cash' && !isEnough) return;
    
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      onConfirm(method, method === 'cash' ? parseInt(cashAmount) || cartTotal : undefined);
    }, 500);
  };

  const handleCancel = () => {
    if (!isSubmitting && !isProcessing) {
      setMethod(defaultPaymentMethod);
      setCashAmount("");
      onClose();
    }
  };

  const renderMethodButton = (id: PaymentMethod, label: string, Icon: typeof Banknote) => (
    <button
      key={id}
      onClick={() => selectMethod(id)}
      className={`flex-1 p-2 md:p-3 rounded-xl flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 transition-all border ${
        method === id
          ? "bg-blue-50 border-blue-600 text-blue-600 shadow-sm"
          : "bg-white hover:bg-slate-50 border-slate-200 text-slate-500"
      }`}
      data-testid={`button-payment-method-${id}`}
    >
      <Icon size={18} />
      <span className="font-bold text-[10px] md:text-sm">{label}</span>
    </button>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isSubmitting && !isProcessing && !nextOpen) {
          handleCancel();
        }
      }}
    >
      <DialogTitle className="sr-only">Payment Method Selection</DialogTitle>
      <DialogContent 
        className="p-0 gap-0 w-full md:max-w-2xl md:rounded-2xl rounded-t-2xl overflow-hidden flex flex-col md:flex-row h-[85vh] md:h-auto md:max-h-[90vh]"
        data-testid="dialog-payment-method"
      >
        {/* Sidebar (Desktop Only) - Hidden on Mobile */}
        <div className="hidden md:flex w-1/3 bg-slate-50 border-r border-slate-200 p-4 flex-col gap-2">
          <h3 className="font-bold text-slate-700 mb-2 px-1">Metode</h3>
          <button
            onClick={() => selectMethod("cash")}
            className={`p-3 rounded-xl flex items-center gap-3 transition-all ${
              method === "cash"
                ? "bg-white border-2 border-blue-600 text-blue-600 shadow-md"
                : "hover:bg-white border border-transparent text-slate-600"
            }`}
            data-testid="sidebar-payment-cash"
          >
            <Banknote size={20} />
            <span className="font-bold text-sm">Tunai</span>
          </button>
          <button
            onClick={() => selectMethod("ewallet")}
            className={`p-3 rounded-xl flex items-center gap-3 transition-all ${
              method === "ewallet"
                ? "bg-white border-2 border-blue-600 text-blue-600 shadow-md"
                : "hover:bg-white border border-transparent text-slate-600"
            }`}
            data-testid="sidebar-payment-qris"
          >
            <QrCode size={20} />
            <span className="font-bold text-sm">QRIS</span>
          </button>
          <button
            onClick={() => selectMethod("card")}
            className={`p-3 rounded-xl flex items-center gap-3 transition-all ${
              method === "card"
                ? "bg-white border-2 border-blue-600 text-blue-600 shadow-md"
                : "hover:bg-white border border-transparent text-slate-600"
            }`}
            data-testid="sidebar-payment-card"
          >
            <CreditCard size={20} />
            <span className="font-bold text-sm">Kartu</span>
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col h-full relative">
          {/* Header */}
          <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-white flex-shrink-0">
            <div>
              <p className="text-xs text-slate-500 font-medium">Total Tagihan</p>
              <h2 className="text-2xl font-black text-slate-800" data-testid="text-payment-total">
                {formatIDR(cartTotal)}
              </h2>
            </div>
          </div>

          {/* Mobile Method Tabs (Horizontal) - Visible only on mobile */}
          <div className="md:hidden flex gap-2 p-3 border-b border-slate-100 bg-slate-50 overflow-x-auto no-scrollbar flex-shrink-0">
            {renderMethodButton("cash", "Tunai", Banknote)}
            {renderMethodButton("ewallet", "QRIS", QrCode)}
            {renderMethodButton("card", "Kartu", CreditCard)}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-4 md:p-6 bg-white">
            {method === "cash" && (
              <div className="space-y-4 animate-in slide-in-from-right-2 pb-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">
                    Uang Diterima
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">
                      Rp
                    </span>
                    <input
                      type="number"
                      autoFocus
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      placeholder="0"
                      value={cashAmount}
                      onChange={(e) => setCashAmount(e.target.value)}
                      data-testid="input-cash-received"
                    />
                  </div>
                </div>

                {/* Quick Money Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleQuickMoney(cartTotal)}
                    className="px-3 py-2 bg-slate-100 rounded-lg text-xs font-bold text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-colors border border-transparent hover:border-blue-200"
                    data-testid="button-quick-exact"
                  >
                    Uang Pas
                  </button>
                  <button
                    onClick={() => handleQuickMoney(50000)}
                    className="px-3 py-2 bg-slate-100 rounded-lg text-xs font-bold text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-colors border border-transparent hover:border-blue-200"
                    data-testid="button-quick-50k"
                  >
                    50.000
                  </button>
                  <button
                    onClick={() => handleQuickMoney(100000)}
                    className="px-3 py-2 bg-slate-100 rounded-lg text-xs font-bold text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-colors border border-transparent hover:border-blue-200"
                    data-testid="button-quick-100k"
                  >
                    100.000
                  </button>
                  <button
                    onClick={() => handleQuickMoney(200000)}
                    className="px-3 py-2 bg-slate-100 rounded-lg text-xs font-bold text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-colors border border-transparent hover:border-blue-200"
                    data-testid="button-quick-200k"
                  >
                    200.000
                  </button>
                </div>

                <div
                  className={`p-4 rounded-xl border ${
                    isEnough
                      ? "bg-green-50 border-green-200"
                      : "bg-red-50 border-red-200"
                  } flex justify-between items-center transition-colors duration-300`}
                >
                  <span
                    className={`text-sm font-bold ${
                      isEnough ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {isEnough ? "Kembalian" : "Kurang"}
                  </span>
                  <span
                    className={`text-xl font-black ${
                      isEnough ? "text-green-700" : "text-red-700"
                    }`}
                    data-testid="text-change-amount"
                  >
                    {formatIDR(Math.abs(change))}
                  </span>
                </div>
              </div>
            )}

            {method === "ewallet" && (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-4 animate-in slide-in-from-right-2 py-4">
                <div className="bg-white p-4 rounded-xl border-2 border-slate-800 shadow-sm">
                  <QrCode size={120} className="text-slate-800" />
                </div>
                <div>
                  <p className="font-bold text-slate-800">Scan QRIS</p>
                  <p className="text-sm text-slate-500">Menunggu pembayaran...</p>
                </div>
              </div>
            )}

            {method === "card" && (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-4 animate-in slide-in-from-right-2 py-4">
                <div className="bg-blue-50 p-6 rounded-full">
                  <CreditCard size={48} className="text-blue-600" />
                </div>
                <p className="text-sm text-slate-500 max-w-[200px]">
                  Silakan gesek kartu pada mesin EDC terpisah.
                </p>
              </div>
            )}
          </div>

          {/* Sticky Footer */}
          <div className="p-4 border-t border-slate-100 bg-white sticky bottom-0 z-10 flex-shrink-0">
            <button
              onClick={handleProcess}
              disabled={isProcessing || isSubmitting || (method === "cash" && !isEnough)}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 shadow-lg shadow-blue-200 transition-all active:scale-[0.98]"
              data-testid="button-confirm-payment"
            >
              {isProcessing || isSubmitting ? (
                "Memproses..."
              ) : method === "cash" ? (
                "Bayar & Cetak Struk"
              ) : (
                "Konfirmasi Pembayaran"
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
