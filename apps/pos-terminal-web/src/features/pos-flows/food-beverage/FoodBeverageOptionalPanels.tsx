import type { BusinessCapabilities } from "@pos/application/business-flows";

export function FoodBeverageOptionalPanels({ capabilities }: { capabilities: BusinessCapabilities }) {
  const panels = [
    { key: "tableService", enabled: capabilities.tableService, title: "Table & floor service", off: "Kasir F&B tetap bisa checkout tanpa meja. Aktifkan restaurant_table_service untuk kontrol meja/floor plan." },
    { key: "kitchenOps", enabled: capabilities.kitchenOps, title: "Kitchen / KDS", off: "Tombol kitchen disembunyikan sampai restaurant_kitchen_ops aktif dan alur aman tersedia." },
    { key: "orderQueue", enabled: capabilities.orderQueue, title: "Order queue", off: "Antrian/prep tracking opsional; full payment tidak memerlukan orders_queue." },
    { key: "splitBill", enabled: capabilities.splitBill, title: "Split bill", off: "Split bill hanya tampil melalui entitlement payments_split_bill." },
    { key: "partialPayment", enabled: capabilities.partialPayment, title: "DP / partial payment", off: "DP/partial payment hanya tampil melalui entitlement payments_partial_payment." },
    { key: "multiPayment", enabled: capabilities.multiPayment, title: "Multi payment", off: "Multi-payment hanya tampil melalui entitlement payments_multi_payment." },
  ];

  return (
    <aside className="mx-4 mb-3 rounded-xl border bg-card p-3 text-sm shadow-sm" data-testid="food-beverage-optional-panels">
      <div className="mb-2">
        <p className="font-semibold">Food & Beverage mode</p>
        <p className="text-muted-foreground">Baseline: pilih produk/menu → cart → bayar penuh/cash → struk. Fitur restoran bersifat opsional.</p>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {panels.map((panel) => (
          <div key={panel.key} data-testid={`fb-panel-${panel.key}`} className={`rounded-lg border p-2 ${panel.enabled ? "border-emerald-200 bg-emerald-50" : "bg-muted/40"}`}>
            <p className="font-medium">{panel.title}</p>
            <p className="text-xs text-muted-foreground">{panel.enabled ? "Entitlement aktif; tampilkan kontrol hanya jika runtime flow aman." : panel.off}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}
