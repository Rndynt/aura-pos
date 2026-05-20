// @ts-nocheck
import { Drawer } from "vaul";
import { useOpenOrders } from "@/lib/api/tableHooks";
import { Clock, ArrowRight, PackageOpen, User, Hash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface DraftOrdersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinueOrder: (orderId: string) => void;
}

export function DraftOrdersSheet({ open, onOpenChange, onContinueOrder }: DraftOrdersSheetProps) {
  const { data, isLoading } = useOpenOrders();
  const orders = data?.orders ?? [];
  const unpaid = orders.filter((o) => o.paymentStatus !== "paid");

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-[55]" />
        <Drawer.Content
          className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-2xl flex flex-col"
          style={{ maxHeight: "80dvh" }}
          data-testid="sheet-draft-orders"
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <Drawer.Handle className="w-10 h-1 rounded-full bg-slate-300" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                <Clock className="w-4 h-4 text-amber-500" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Pesanan Draft</h2>
                <p className="text-xs text-slate-400">{unpaid.length} pesanan belum selesai</p>
              </div>
            </div>
            <Badge
              variant="secondary"
              className="bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold"
            >
              {unpaid.length}
            </Badge>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2 pb-8">
            {isLoading ? (
              <div className="flex flex-col gap-2 py-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : unpaid.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                  <PackageOpen className="w-6 h-6 text-slate-400" />
                </div>
                <p className="text-sm font-medium text-slate-600">Tidak ada draft</p>
                <p className="text-xs text-slate-400 mt-1">Semua pesanan sudah selesai</p>
              </div>
            ) : (
              unpaid.map((order) => (
                <button
                  key={order.id}
                  onClick={() => {
                    onContinueOrder(order.id);
                    onOpenChange(false);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-white hover:bg-blue-50/60 hover:border-blue-200 active:bg-blue-100 transition-colors text-left group"
                  data-testid={`btn-continue-draft-${order.id}`}
                >
                  {/* Order info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="flex items-center gap-1 text-xs font-semibold text-slate-700">
                        <Hash className="w-3 h-3 text-slate-400" />
                        {order.orderNumber ?? order.id.slice(-6).toUpperCase()}
                      </span>
                      {order.tableNumber && (
                        <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          Meja {order.tableNumber}
                        </span>
                      )}
                    </div>
                    {order.customerName && (
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1 truncate">
                        <User className="w-3 h-3 flex-shrink-0" />
                        {order.customerName}
                      </p>
                    )}
                    <p className="text-sm font-bold text-slate-800 mt-1">
                      Rp {Number(order.total ?? 0).toLocaleString("id-ID")}
                    </p>
                  </div>

                  {/* CTA */}
                  <div className="flex-shrink-0 flex items-center gap-1 bg-blue-600 group-hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                    Lanjut
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </button>
              ))
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
