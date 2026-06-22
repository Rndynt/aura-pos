import { useState, useMemo, useEffect } from "react";
import { Drawer } from "vaul";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  X,
  ArrowRight,
  PackageOpen,
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
  canCancelServerDraft,
  canContinueServerDraft,
  canPayActiveOrder,
  getActiveOrderStatusLabel,
  getOrderPaidAmount,
  getOrderRemainingAmount,
  getOrderTotalAmount,
  isActivePOSOrder,
  isTrueServerDraft,
  type POSLifecycleOrder,
} from "@/features/pos-core";

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
  const [detailOrder, setDetailOrder] = useState<POSLifecycleOrder | null>(null);

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
      serverDrafts: orders.filter(canContinueServerDraft),
      activeOrders: orders.filter(
        (order) => !canContinueServerDraft(order) && isActivePOSOrder(order),
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
      <div className="overflow-y-auto flex-1 min-h-0 px-4 py-3 space-y-2">
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
              {serverDrafts.map((order) => {
                const itemCount = (order as any).orderItems?.length ?? (order as any).items?.length ?? 0;
                const rawDate = (order as any).orderDate ?? (order as any).createdAt;
                const timeStr = rawDate ? new Date(rawDate).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : null;
                return (
                <div
                  key={order.id}
                  className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-100 bg-white hover:bg-amber-50/40 hover:border-amber-200 transition-colors"
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
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-slate-800 font-mono">{order.orderNumber}</span>
                      {order.tableNumber && (
                        <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">Meja {order.tableNumber}</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Rp {Number(order.total ?? 0).toLocaleString("id-ID")}
                      {itemCount > 0 && <span> · {itemCount} item</span>}
                      {timeStr && <span> · {timeStr}</span>}
                    </p>
                  </button>
                  <button
                    onClick={(e) => handleDeleteServer(e, order.id)}
                    hidden={!canCancelServerDraft(order)}
                    disabled={deletingServerId === order.id || !canCancelServerDraft(order)}
                    className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                    data-testid={`btn-delete-draft-${order.id}`}
                  >
                    {deletingServerId === order.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      onContinueOrder(order.id);
                      onOpenChange(false);
                    }}
                    className="flex-shrink-0 flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
                    data-testid={`btn-lanjut-draft-${order.id}`}
                  >
                    Lanjut<ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                );
              })}
              {activeOrders.length > 0 && (
                <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 px-1 pt-3">
                  Pesanan Aktif
                </div>
              )}
              {activeOrders.map((order) => {
                const itemCount = (order as any).orderItems?.length ?? (order as any).items?.length ?? 0;
                const rawDate = (order as any).orderDate ?? (order as any).createdAt;
                const timeStr = rawDate ? new Date(rawDate).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : null;
                return (
                <div
                  key={order.id}
                  className="flex items-center gap-2 p-2.5 rounded-xl border border-emerald-100 bg-white hover:bg-emerald-50/40 hover:border-emerald-200 transition-colors"
                  data-testid={`row-active-order-${order.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-slate-800 font-mono">{(order as any).orderNumber}</span>
                      {(order as any).tableNumber && (
                        <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">Meja {(order as any).tableNumber}</span>
                      )}
                      <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] px-1.5 py-0 h-4 font-semibold">
                        {getActiveOrderStatusLabel(order)}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Rp {Number((order as any).total ?? 0).toLocaleString("id-ID")}
                      {itemCount > 0 && <span> · {itemCount} item</span>}
                      {timeStr && <span> · {timeStr}</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => setDetailOrder(order)}
                    className="flex-shrink-0 flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-semibold px-2 py-1.5 rounded-lg"
                    data-testid={`btn-view-active-order-${order.id}`}
                  >
                    <Eye className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => {
                      onPayActiveOrder?.(order);
                      onOpenChange(false);
                    }}
                    disabled={!canPayActiveOrder(order) || (getOrderRemainingAmount(order) ?? 0) <= 0}
                    className="flex-shrink-0 flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    data-testid={`btn-pay-active-order-${order.id}`}
                  >
                    Bayar<CreditCard className="w-3 h-3" />
                  </button>
                </div>
                );
              })}
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
                className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-100 bg-white hover:bg-blue-50/40 hover:border-blue-200 transition-colors"
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
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-slate-800 font-mono">LOCAL-{draft.id.slice(0, 8)}</span>
                    {draft.tableNumber && (
                      <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">Meja {draft.tableNumber}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Rp {Number(draft.total ?? 0).toLocaleString("id-ID")} · {new Date(draft.updatedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </button>
                <button
                  onClick={(e) => handleDeleteLocal(e, draft.id)}
                  disabled={deletingLocalId === draft.id}
                  className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                  data-testid={`btn-delete-local-draft-${draft.id}`}
                >
                  {deletingLocalId === draft.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  onClick={() => {
                    onResumeLocalDraft(draft);
                    onOpenChange(false);
                  }}
                  className="flex-shrink-0 flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
                  data-testid={`btn-lanjut-local-draft-${draft.id}`}
                >
                  Lanjut<ArrowRight className="w-3 h-3" />
                </button>
              </div>
            ))
          ))}
      </div>
    </div>
  );

  const detailDialog = (
    <ActiveOrderDetailDialog
      order={detailOrder}
      onOpenChange={(nextOpen) => { if (!nextOpen) setDetailOrder(null); }}
      onPay={(order) => { onPayActiveOrder?.(order); setDetailOrder(null); onOpenChange(false); }}
    />
  );

  if (isMobile) {
    return (
      <>
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
        {detailDialog}
      </>
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
        {detailDialog}
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

function formatRp(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `Rp ${value.toLocaleString("id-ID")}`;
}

function useIsLandscapeMobile() {
  const [isLandscape, setIsLandscape] = useState(false);
  useEffect(() => {
    const check = () => {
      setIsLandscape(
        window.innerWidth > window.innerHeight && window.innerWidth < 900,
      );
    };
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);
  return isLandscape;
}

function ActiveOrderDetailDialog({
  order,
  onOpenChange,
  onPay,
}: {
  order: POSLifecycleOrder | null;
  onOpenChange: (open: boolean) => void;
  onPay: (order: POSLifecycleOrder) => void;
}) {
  const isLandscape = useIsLandscapeMobile();

  if (!order) return null;

  const items = (
    (order as any).items ?? (order as any).orderItems ?? []
  ) as Array<any>;
  const total = getOrderTotalAmount(order);
  const paid = getOrderPaidAmount(order);
  const remaining = getOrderRemainingAmount(order);
  const canPay = canPayActiveOrder(order) && remaining !== null && remaining > 0;

  const orderNumber =
    (order as any).orderNumber ?? (order as any).order_number ?? order.id;
  const tableNumber =
    (order as any).tableNumber ?? (order as any).table_number;
  const customerName =
    (order as any).customerName ?? (order as any).customer_name;
  const statusLabel =
    (order as any).lifecycleLabel ?? getActiveOrderStatusLabel(order);
  const payStatus =
    (order as any).paymentStatus ?? (order as any).payment_status ?? "unpaid";

  const payStatusLabel =
    payStatus === "paid"
      ? "Lunas"
      : payStatus === "partial"
        ? "Sebagian"
        : "Belum Bayar";
  const payStatusCls =
    payStatus === "paid"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : payStatus === "partial"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-slate-100 text-slate-500 border-slate-200";

  /* ── Left panel: order info + items list ── */
  const leftPanel = (
    <div
      className={`flex flex-col min-h-0 ${isLandscape ? "flex-1 border-r border-slate-100 overflow-hidden" : ""}`}
    >
      {/* Order header */}
      <div className="px-4 pt-3 pb-3 border-b border-slate-100 flex-shrink-0">
        <div className="font-mono font-black text-slate-900 text-base leading-tight">
          {orderNumber}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] px-2 h-5 font-semibold">
            {statusLabel}
          </Badge>
          <Badge
            className={`border text-[10px] px-2 h-5 font-semibold ${payStatusCls}`}
          >
            {payStatusLabel}
          </Badge>
          {tableNumber && (
            <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
              Meja {tableNumber}
            </span>
          )}
          {customerName && (
            <span className="text-[11px] text-slate-600 truncate max-w-[140px]">
              {customerName}
            </span>
          )}
        </div>
      </div>

      {/* Items list — scrollable */}
      <div
        className={`overflow-y-auto px-4 py-3 ${isLandscape ? "flex-1 min-h-0" : "max-h-44"}`}
      >
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
          Item Pesanan ({items.length})
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-slate-400 py-2 text-center">
            Tidak ada item
          </p>
        ) : (
          <div className="space-y-2.5">
            {items.map((item, index) => {
              const qty = item.quantity ?? 1;
              const subtotal = Number(
                item.itemSubtotal ?? item.item_subtotal ?? 0,
              );
              const unitPrice = qty > 0 ? Math.round(subtotal / qty) : subtotal;
              const variantLabel = item.variantName ?? item.variant_name ?? null;
              const selectedOpts: any[] = item.selectedOptions ?? item.selected_options ?? [];
              const optionsLabel = selectedOpts.length > 0
                ? selectedOpts.map((o: any) => o.optionName ?? o.option_name ?? "").filter(Boolean).join(", ")
                : null;
              const variantDisplay = variantLabel
                ? optionsLabel ? `${variantLabel} · ${optionsLabel}` : variantLabel
                : optionsLabel;
              return (
                <div
                  key={item.id ?? index}
                  className="flex items-start justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 leading-snug">
                      {item.productName ??
                        item.product_name ??
                        item.name ??
                        "Item"}
                    </p>
                    {variantDisplay && (
                      <p className="text-[11px] text-blue-500 font-medium mt-0.5">{variantDisplay}</p>
                    )}
                    {item.notes && (
                      <p className="text-[11px] text-amber-600 italic mt-0.5">"{item.notes}"</p>
                    )}
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {formatRp(unitPrice)} × {qty}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-slate-800 flex-shrink-0">
                    {formatRp(subtotal)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  /* ── Right panel: summary + actions ── */
  const rightPanel = (
    <div
      className={`flex flex-col flex-shrink-0 ${isLandscape ? "w-[200px]" : ""}`}
    >
      {/* Summary */}
      <div className={`px-4 pt-3 pb-3 ${isLandscape ? "flex-1" : "border-t border-slate-100"}`}>
        {isLandscape && (
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
            Ringkasan
          </div>
        )}
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Total</span>
            <span className="font-bold text-slate-800">{formatRp(total)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Terbayar</span>
            <span
              className={`font-bold ${paid !== null && paid > 0 ? "text-emerald-600" : "text-slate-400"}`}
            >
              {formatRp(paid)}
            </span>
          </div>
          {remaining !== null && remaining > 0 && (
            <div className="flex justify-between border-t border-slate-100 pt-1.5 mt-0.5">
              <span className="font-semibold text-slate-700">Sisa</span>
              <span className="font-black text-amber-600">
                {formatRp(remaining)}
              </span>
            </div>
          )}
          {remaining === 0 && (
            <div className="text-[11px] text-emerald-600 font-semibold text-center py-1 bg-emerald-50 rounded-lg mt-1">
              ✓ Tagihan Lunas
            </div>
          )}
          {remaining === null && (
            <p className="text-[10px] text-red-500 mt-1">
              Sisa tidak dapat dihitung.
            </p>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-4 py-3 flex gap-2 border-t border-slate-100">
        <button
          onClick={() => onOpenChange(false)}
          className="flex-1 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition-colors"
        >
          Tutup
        </button>
        <button
          disabled={!canPay}
          onClick={() => onPay(order)}
          className="flex-1 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Bayar
        </button>
      </div>
    </div>
  );

  return (
    <Dialog open={!!order} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className={`p-0 gap-0 overflow-hidden ${isLandscape ? "max-w-[560px]" : "max-w-sm"}`}
        style={{ maxHeight: isLandscape ? "85dvh" : "88dvh" }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Detail Pesanan Aktif</DialogTitle>
        </DialogHeader>

        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
          <h3 className="text-sm font-bold text-slate-800">
            Detail Pesanan Aktif
          </h3>
          <button
            onClick={() => onOpenChange(false)}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content: 2-panel on landscape, stacked on portrait */}
        <div
          className={`flex min-h-0 ${isLandscape ? "flex-row overflow-hidden" : "flex-col"}`}
          style={isLandscape ? { height: "calc(85dvh - 52px)" } : undefined}
        >
          {leftPanel}
          {rightPanel}
        </div>
      </DialogContent>
    </Dialog>
  );
}
