import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getPOSOrderDisplaySummary, isUnpaidActiveRestaurantOrder, type POSLifecycleOrder } from "@/features/pos-core";

export function RestaurantOrderLifecyclePanel({ orders, isLoading, onPayActiveOrder }: { orders: POSLifecycleOrder[]; isLoading?: boolean; onPayActiveOrder: (order: POSLifecycleOrder) => void }) {
  const activeOrders = orders.filter(isUnpaidActiveRestaurantOrder);
  return (
    <Card className="m-3" data-testid="restaurant-active-order-lifecycle-panel">
      <CardHeader className="pb-2"><CardTitle className="text-base">Pesanan Aktif Restoran</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? <p className="text-sm text-muted-foreground">Memuat pesanan aktif...</p> : null}
        {!isLoading && activeOrders.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada pesanan aktif.</p> : null}
        {activeOrders.map((order) => {
          const { orderNumber, tableNumber, total, label } = getPOSOrderDisplaySummary(order);
          return (
            <div key={order.id} className="flex items-center justify-between rounded-md border p-2 gap-2">
              <div className="min-w-0">
                <p className="font-medium truncate">#{orderNumber} {tableNumber ? `· Meja ${tableNumber}` : ""}</p>
                <p className="text-xs text-muted-foreground">{label} · Rp {total.toLocaleString("id-ID")}</p>
              </div>
              <Button type="button" size="sm" onClick={() => onPayActiveOrder(order)}>Detail / Bayar</Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
