import { useState, useMemo } from "react";
import { Drawer } from "vaul";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Clock,
  ArrowRight,
  PackageOpen,
  User,
  Trash2,
  Loader2,
  Smartphone,
  Server,
  CreditCard,
  Eye,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTenant } from "@/context/TenantContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOpenOrders } from "@/lib/api/tableHooks";
import { useCancelOrder } from "@/lib/api/hooks";
import {
  deleteLocalDraftOrder,
  listLocalDraftOrders,
  type LocalDraftOrder,
} from "@pos/offline";
import {
  getActiveOrderStatusLabel,
  isActivePOSOrder,
  isTrueServerDraft,
  type POSLifecycleOrder,
} from "@/features/pos/services/orderLifecycle";

interface CombinedDraftSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinueOrder: (orderId: string) => void;
  onResumeLocalDraft: (draft: LocalDraftOrder) => void;
  onPayActiveOrder?: (order: POSLifecycleOrder) => void;
}

type Tab = "server" | "local";

export function CombinedDraftSheet({
  open,
  onOpenChange,
  onContinueOrder,
  onResumeLocalDraft,
  onPayActiveOrder,
}: CombinedDraftSheetProps) {
  const isMobile = useIsMobile();
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("server");
  const [deletingServerId, setDeletingServerId] = useState<string | null>(null);
  const [deletingLocalId, setDeletingLocalId] = useState<string | null>(null);

  const { data: openOrdersData, isLoading: serverLoading } = useOpenOrders();
  const cancelOrder = useCancelOrder();

  const { data: localDrafts = [], isLoading: localLoading } = useQuery({
    queryKey: ["local-drafts", tenantId],
    queryFn: () => listLocalDraftOrders(tenantId),
    enabled: open,
  });

  const { serverDrafts, activeOrders } = useMemo(() => {
    const orders = (openOrdersData?.orders ?? []) as POSLifecycleOrder[];
    return {
      serverDrafts: orders.filter(isTrueServerDraft),
      activeOrders: orders.filter(
        (order) => !isTrueServerDraft(order) && isActivePOSOrder(order),
      ),
    };
  }, [openOrdersData]);

  const handleDeleteServer = async (e: React.MouseEvent, orderId: string) => {
    e.stopPropagation();
    setDeletingServerId(orderId);
    try {
      await cancelOrder.mutateAsync({ orderId });
      queryClient.invalidateQueries({
        queryKey: ["/api/orders/open", tenantId],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    } finally {
      setDeletingServerId(null);
    }
  };

  const handleDeleteLocal = async (e: React.MouseEvent, draftId: string) => {
    e.stopPropagation();
    setDeletingLocalId(draftId);
    try {
      await deleteLocalDraftOrder(tenantId, draftId);
      queryClient.invalidateQueries({ queryKey: ["local-drafts", tenantId] });
    } finally {
      setDeletingLocalId(null);
    }
  };

  const content = (
    <div
      className="flex flex-col overflow-hidden"
      style={{ maxHeight: isMobile ? "72dvh" : "520px" }}
    >
      {/* Tab Bar */}
      <div className="flex border-b border-slate-100 flex-shrink-0">
        <button
          onClick={() => setActiveTab("server")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-colors border-b-2 ${
            activeTab === "server"
              ? "border-amber-500 text-amber-700 bg-amber-50/50"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
          data-testid="tab-server-drafts"
        >
          <Server className="w-3.5 h-3.5" />
          <span>Server</span>
          {serverDrafts.length + activeOrders.length > 0 && (
            <span
              className={`min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold rounded-full leading-none ${
                activeTab === "server"
                  ? "bg-amber-500 text-white"
                  : "bg-slate-200 text-slate-600"
              }`}
            >
              {serverDrafts.length + activeOrders.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("local")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-colors border-b-2 ${
            activeTab === "local"
              ? "border-blue-500 text-blue-700 bg-blue-50/50"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
          data-testid="tab-local-drafts"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Draft Lokal</span>
          {localDrafts.length > 0 && (
            <span
              className={`min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold rounded-full leading-none ${
                activeTab === "local"
                  ? "bg-blue-500 text-white"
                  : "bg-slate-200 text-slate-600"
              }`}
            >
              {localDrafts.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Content */}
      <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
        {/* Server Drafts Tab */}
        {activeTab === "server" &&
          (serverLoading ? (
            <div className="flex flex-col gap-2 py-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 bg-slate-100 rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : serverDrafts.length === 0 && activeOrders.length === 0 ? (
            <EmptyState
              label="Tidak ada open order"
              sublabel="Semua pesanan sudah selesai atau dibayar"
            />
          ) : (
            <>
              {serverDrafts.length > 0 && (
                <div className="text-[11px] font-bold uppercase tracking-wide text-amber-700 px-1 pt-1">
                  Draft Server
                </div>
              )}
              {serverDrafts.map((order) => (
                <div
                  key={order.id}
                  className="w-full flex items-center gap-2 p-3 rounded-xl border border-slate-100 bg-white hover:bg-amber-50/40 hover:border-amber-200 transition-colors"
                  data-testid={`row-draft-${order.id}`}
                >
                  <button
                    onClick={() => {
                      onContinueOrder(order.id);
                      onOpenChange(false);
                    }}
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
                  <button
                    onClick={(e) => handleDeleteServer(e, order.id)}
                    disabled={deletingServerId === order.id}
                    className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                    data-testid={`btn-delete-draft-${order.id}`}
                  >
                    {deletingServerId === order.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      onContinueOrder(order.id);
                      onOpenChange(false);
                    }}
                    className="flex-shrink-0 flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                    data-testid={`btn-lanjut-draft-${order.id}`}
                  >
                    Lanjut
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {activeOrders.length > 0 && (
                <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 px-1 pt-3">
                  Pesanan Aktif
                </div>
              )}
              {activeOrders.map((order) => (
                <div
                  key={order.id}
                  className="w-full flex items-center gap-2 p-3 rounded-xl border border-emerald-100 bg-white hover:bg-emerald-50/40 hover:border-emerald-200 transition-colors"
                  data-testid={`row-active-order-${order.id}`}
                >
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-slate-700">
                        {(order as any).orderNumber}
                      </span>
                      {(order as any).tableNumber && (
                        <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          Meja {(order as any).tableNumber}
                        </span>
                      )}
                      <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] px-1.5 py-0 h-4 font-semibold">
                        {getActiveOrderStatusLabel(order)}
                      </Badge>
                    </div>
                    {(order as any).customerName && (
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1 truncate">
                        <User className="w-3 h-3 flex-shrink-0" />
                        {(order as any).customerName}
                      </p>
                    )}
                    <p className="text-sm font-bold text-slate-800 mt-0.5">
                      Rp{" "}
                      {Number((order as any).total ?? 0).toLocaleString(
                        "id-ID",
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      onPayActiveOrder?.(order);
                      onOpenChange(false);
                    }}
                    className="flex-shrink-0 flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                    data-testid={`btn-pay-active-order-${order.id}`}
                  >
                    Bayar
                    <CreditCard className="w-3.5 h-3.5" />
                  </button>
                  <button
                    disabled
                    className="flex-shrink-0 flex items-center gap-1 bg-slate-100 text-slate-500 text-xs font-semibold px-3 py-1.5 rounded-lg"
                    data-testid={`btn-view-active-order-${order.id}`}
                    title="Detail aktif akan dibuka dari halaman Pesanan"
                  >
                    Detail
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </>
          ))}

        {/* Local Drafts Tab */}
        {activeTab === "local" &&
          (localLoading ? (
            <div className="text-xs text-slate-500 py-4 text-center">
              Memuat draft lokal...
            </div>
          ) : localDrafts.length === 0 ? (
            <EmptyState
              label="Tidak ada draft lokal"
              sublabel="Draft lokal dibuat saat offline atau saat simpan gagal karena koneksi"
            />
          ) : (
            localDrafts.map((draft) => (
              <div
                key={draft.id}
                className="w-full flex items-center gap-2 p-3 rounded-xl border border-slate-100 bg-white hover:bg-blue-50/40 hover:border-blue-200 transition-colors"
                data-testid={`row-local-draft-${draft.id}`}
              >
                <button
                  onClick={() => {
                    onResumeLocalDraft(draft);
                    onOpenChange(false);
                  }}
                  className="flex-1 min-w-0 text-left"
                  data-testid={`btn-resume-local-draft-${draft.id}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-slate-700">
                      LOCAL-{draft.id.slice(0, 8)}
                    </span>
                    {draft.tableNumber && (
                      <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        Meja {draft.tableNumber}
                      </span>
                    )}
                    <Badge className="bg-blue-50 text-blue-600 border border-blue-200 text-[10px] px-1.5 py-0 h-4 font-semibold">
                      Lokal
                    </Badge>
                  </div>
                  {draft.customerName && (
                    <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1 truncate">
                      <User className="w-3 h-3 flex-shrink-0" />
                      {draft.customerName}
                    </p>
                  )}
                  <p className="text-sm font-bold text-slate-800 mt-0.5">
                    Rp {Number(draft.total ?? 0).toLocaleString("id-ID")}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    <Clock className="w-3 h-3 inline mr-0.5" />
                    {new Date(draft.updatedAt).toLocaleString("id-ID")}
                  </p>
                </button>
                <button
                  onClick={(e) => handleDeleteLocal(e, draft.id)}
                  disabled={deletingLocalId === draft.id}
                  className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                  data-testid={`btn-delete-local-draft-${draft.id}`}
                >
                  {deletingLocalId === draft.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={() => {
                    onResumeLocalDraft(draft);
                    onOpenChange(false);
                  }}
                  className="flex-shrink-0 flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  data-testid={`btn-lanjut-local-draft-${draft.id}`}
                >
                  Lanjut
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          ))}
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
            data-testid="sheet-combined-drafts"
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
      <DialogContent
        className="max-w-md p-0 overflow-hidden"
        data-testid="dialog-combined-drafts"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Draft Pesanan</DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ label, sublabel }: { label: string; sublabel?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
        <PackageOpen className="w-6 h-6 text-slate-400" />
      </div>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      {sublabel && (
        <p className="text-xs text-slate-400 mt-1 max-w-[220px]">{sublabel}</p>
      )}
    </div>
  );
}
