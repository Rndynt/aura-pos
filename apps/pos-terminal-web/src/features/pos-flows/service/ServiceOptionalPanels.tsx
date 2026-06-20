import type { BusinessCapabilities } from "@pos/application/business-flows";

export function ServiceOptionalPanels({ capabilities }: { capabilities: BusinessCapabilities }) {
  const panels = [
    { key: "orderQueue", enabled: capabilities.orderQueue, title: "Job queue", off: "Queue/tracking pekerjaan opsional; checkout jasa tetap tersedia tanpanya." },
    { key: "partialPayment", enabled: capabilities.partialPayment, title: "DP / partial payment", off: "DP hanya aktif melalui entitlement payments_partial_payment." },
    { key: "multiPayment", enabled: capabilities.multiPayment, title: "Multi payment", off: "Multi-payment hanya aktif melalui entitlement payments_multi_payment." },
    { key: "appointment", enabled: false, title: "Appointment lifecycle", off: "Belum diimplementasikan di P6; jangan blokir checkout service baseline." },
  ];

  return (
    <aside className="mx-4 mb-3 rounded-xl border bg-card p-3 text-sm shadow-sm" data-testid="service-optional-panels">
      <div className="mb-2">
        <p className="font-semibold">Service mode</p>
        <p className="text-muted-foreground">Baseline: pilih layanan/produk → cart → bayar penuh/cash → struk. Progress/appointment adalah modul opsional.</p>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {panels.map((panel) => (
          <div key={panel.key} data-testid={`service-panel-${panel.key}`} className={`rounded-lg border p-2 ${panel.enabled ? "border-emerald-200 bg-emerald-50" : "bg-muted/40"}`}>
            <p className="font-medium">{panel.title}</p>
            <p className="text-xs text-muted-foreground">{panel.enabled ? "Entitlement aktif; tampilkan kontrol hanya jika runtime flow aman." : panel.off}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}
