import { Clock, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import type { Order } from "@pos/domain/orders/types";

interface OrderQueueProps {
  orders: Order[];
  onUpdateStatus: (orderId: string, status: string) => void;
  onExpandChange?: (isExpanded: boolean) => void;
}

const getStatusBgColor = (status: string) => {
  switch (status) {
    case "confirmed": return "bg-orange-50";
    case "preparing": return "bg-yellow-50";
    case "ready":     return "bg-green-50";
    case "served":    return "bg-purple-50";
    default:          return "bg-slate-50";
  }
};

const getStatusTextColor = (status: string) => {
  switch (status) {
    case "confirmed": return "text-orange-600";
    case "preparing": return "text-yellow-600";
    case "ready":     return "text-green-600";
    case "served":    return "text-purple-600";
    default:          return "text-slate-600";
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case "confirmed": return "Menunggu";
    case "preparing": return "Diproses";
    case "ready":     return "Siap Saji";
    case "served":    return "Disajikan";
    default:          return status;
  }
};

const formatTime = (date: Date | string | undefined) => {
  if (!date) return "-";
  const d = new Date(date);
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
};

export function OrderQueue({ orders, onUpdateStatus, onExpandChange }: OrderQueueProps) {
  const [isVisible, setIsVisible] = useState(false);

  const activeOrders = orders.filter((o) =>
    ["confirmed", "preparing", "ready", "served"].includes(o.status)
  );

  const handleQuickAction = (orderId: string, currentStatus: string) => {
    const next: Record<string, string> = {
      confirmed: "preparing",
      preparing: "ready",
      ready:     "served",   // kitchen selesai di served; completed = financial close (kasir)
    };
    const nextStatus = next[currentStatus];
    if (nextStatus) onUpdateStatus(orderId, nextStatus);
  };

  if (!isVisible) {
    return (
      <div className="px-4 md:px-8 py-2.5">
        <button
          onClick={() => {
            setIsVisible(true);
            onExpandChange?.(true);
          }}
          className="flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors border border-blue-100"
          data-testid="button-show-queue"
        >
          <Eye size={14} /> Show Order Queue ({activeOrders.length})
        </button>
      </div>
    );
  }

  return (
    <div
      className="px-4 md:px-8 py-4 md:py-5 animate-in slide-in-from-top-2 transition-all duration-300 ease-in-out"
      data-testid="order-queue"
    >
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
          <Clock size={16} className="text-blue-600" /> Order Queue
          <span className="bg-slate-100 text-slate-600 text-[10px] px-2 py-0.5 rounded-full">
            {activeOrders.length} Active
          </span>
        </h3>
        <button
          onClick={() => {
            setIsVisible(false);
            onExpandChange?.(false);
          }}
          className="text-slate-400 hover:text-slate-600"
          data-testid="button-hide-queue"
        >
          <EyeOff size={16} />
        </button>
      </div>

      {activeOrders.length === 0 ? (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4 text-center text-xs text-slate-400">
          No active orders in queue.
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar snap-x">
          {activeOrders.map((order) => (
            <div
              key={order.id}
              className="snap-start min-w-[220px] w-[220px] bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-col gap-2 hover:border-blue-300 transition-colors"
              data-testid={`queue-card-${order.id}`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="font-black text-slate-800 text-xs truncate">
                      {order.order_number || order.id}
                    </span>
                    {order.table_number && (
                      <span className="bg-slate-100 text-slate-600 text-[9px] font-bold px-1.5 rounded">
                        {order.table_number}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 truncate font-medium">
                    {order.customer_name || "Walk-in"}
                  </p>
                </div>
                <div
                  className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase ${getStatusBgColor(
                    order.status
                  )} border-transparent ${getStatusTextColor(order.status)}`}
                >
                  {getStatusLabel(order.status)}
                </div>
              </div>

              <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-auto pt-2 border-t border-slate-50">
                <Clock size={10} /> {formatTime(order.created_at)} •{" "}
                {(order.items?.length || 0)} Items
              </div>

              <div className="w-full">
                <button
                  onClick={() =>
                    handleQuickAction(order.id, order.status)
                  }
                  className={`w-full text-[10px] font-bold py-1.5 rounded flex items-center justify-center gap-1 transition-colors ${
                    order.status === "ready"
                      ? "bg-green-600 hover:bg-green-700 text-white"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
                  data-testid={`queue-action-${order.id}`}
                >
                  {order.status === "confirmed"
                    ? "Start Prep"
                    : order.status === "preparing"
                      ? "Mark Ready"
                      : "Complete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
