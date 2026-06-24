import { useOpenOrders } from "@/lib/api/tableHooks";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, Clock, CheckCircle2 } from "lucide-react";
import { useTenant } from "@/context/TenantContext";

interface OrderQueuePanelProps {
  compact?: boolean;
}

export function OrderQueuePanel({ compact = false }: OrderQueuePanelProps) {
  const { tenantId } = useTenant();
  const { data, isLoading, error } = useOpenOrders();

  if (!tenantId) {
    return null;
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-md">
        <AlertCircle className="w-4 h-4 text-destructive" />
        <span className="text-sm text-destructive">Failed to load orders</span>
      </div>
    );
  }

  const orders = data?.orders ?? [];
  const orderCount = orders.length;
  const operationalStatuses = new Set(["draft", "confirmed", "preparing", "ready", "served"]);
  const pendingCount = orders.filter((o) => operationalStatuses.has(o.status)).length;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">{orderCount} Order(s)</span>
        {pendingCount > 0 && (
          <Badge variant="secondary" className="ml-auto">
            {pendingCount} Pending
          </Badge>
        )}
      </div>
    );
  }

  return (
    <Card className="p-4" data-testid="panel-order-queue">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Open Orders</h3>
          <Badge variant="outline">{orderCount}</Badge>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <span className="text-sm text-muted-foreground">Loading orders...</span>
          </div>
        ) : orderCount === 0 ? (
          <div className="flex items-center justify-center py-6">
            <span className="text-sm text-muted-foreground">No open orders</span>
          </div>
        ) : (
          <ScrollArea className="h-48">
            <div className="space-y-2 pr-4">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-start gap-2 p-2 rounded-md hover-elevate"
                  data-testid={`order-queue-item-${order.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        Order #{order.orderNumber}
                      </span>
                      {operationalStatuses.has(order.status) && (
                        <Badge variant="secondary" className="text-xs">
                          {order.status === "served" ? "Served" : "Active"}
                        </Badge>
                      )}
                    </div>
                    {order.tableNumber && (
                      <p className="text-xs text-muted-foreground">
                        Table {order.tableNumber}
                      </p>
                    )}
                    {order.customerName && (
                      <p className="text-xs text-muted-foreground">
                        {order.customerName}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">
                      Rp {Number(order.total).toLocaleString("id-ID")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {order.paymentStatus === "paid" ? (
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle2 className="w-3 h-3" />
                          Paid
                        </span>
                      ) : (
                        <span className="text-yellow-600">Unpaid</span>
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </Card>
  );
}
