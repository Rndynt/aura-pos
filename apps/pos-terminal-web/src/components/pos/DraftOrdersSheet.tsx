import { useState } from "react";
import { Drawer } from "vaul";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useOpenOrders } from "@/lib/api/tableHooks";
import { useCancelOrder } from "@/lib/api/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/context/TenantContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { Clock, ArrowRight, PackageOpen, User, Trash2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface DraftOrdersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinueOrder: (orderId: string) => void;
}

export function DraftOrdersSheet({ open, onOpenChange, onContinueOrder }: DraftOrdersSheetProps) {
  const isMobile = useIsMobile();
  const { data, isLoading } = useOpenOrders();
  const { tenantId } = useTenant();
  const cancelOrder = useCancelOrder();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const orders = data?.orders ?? [];
  const unpaid = orders.filter((o) => o.paymentStatus !== "paid");

  const handleDelete = async (e: React.MouseEvent, orderId: string) => {
    e.stopPropagation();
    setDeletingId(orderId);
    try {
      await cancelOrder.mutateAsync({ orderId, tenantId });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/open", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    } finally {
      setDeletingId(null);
    }
  };

  const content = (
    <div className="flex flex-col overflow-hidden" style={{ maxHeight: isMobile ? "70dvh" : "480px" }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
          <Clock className="w-4 h-4 text-amber-500" />
        </div>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Pesanan Draft</h2>
          <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold">
            {unpaid.length}
          </Badge>
        </div>
      </div>

      {/* List */}
      <div className="overflow-y-auto flex-1 min-h-0 px-4 py-3 space-y-2">
        {isLoading ? (
          <div className="flex flex-col gap-2 py-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : unpaid.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
              <PackageOpen className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-600">Tidak ada draft</p>
            <p className="text-xs text-slate-400 mt-1">Semua pesanan sudah selesai</p>
          </div>
        ) : (
          unpaid.map((order) => (
            <div
              key={order.id}
              className="w-full flex items-center gap-2 p-3 rounded-xl border border-slate-100 bg-white hover:bg-blue-50/40 hover:border-blue-200 transition-colors"
              data-testid={`row-draft-${order.id}`}
            >
              {/* Order info — clickable */}
              <button
                onClick={() => { onContinueOrder(order.id); onOpenChange(false); }}
                className="flex-1 min-w-0 text-left"
                data-testid={`btn-continue-draft-${order.id}`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-slate-700">
                    {order.orderNumber}
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
                <p className="text-sm font-bold text-slate-800 mt-0.5">
                  Rp {Number(order.total ?? 0).toLocaleString("id-ID")}
                </p>
              </button>

              {/* Delete */}
              <button
                onClick={(e) => handleDelete(e, order.id)}
                disabled={deletingId === order.id}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                data-testid={`btn-delete-draft-${order.id}`}
              >
                {deletingId === order.id
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Trash2 className="w-4 h-4" />
                }
              </button>

              {/* Continue CTA */}
              <button
                onClick={() => { onContinueOrder(order.id); onOpenChange(false); }}
                className="flex-shrink-0 flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                data-testid={`btn-lanjut-draft-${order.id}`}
              >
                Lanjut
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer.Root open={open} onOpenChange={onOpenChange}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-[55]" />
          <Drawer.Content
            className="fixed bottom-0 left-0 right-0 z-[60] bg-white rounded-t-2xl flex flex-col"
            data-testid="sheet-draft-orders"
          >
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <Drawer.Handle className="w-10 h-1 rounded-full bg-slate-300" />
            </div>
            {content}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden" data-testid="dialog-draft-orders">
        <DialogHeader className="sr-only">
          <DialogTitle>Pesanan Draft</DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
