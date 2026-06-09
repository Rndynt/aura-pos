import { useEffect } from "react";
import { queryClient } from "@/lib/queryClient";
import { getActiveTenantId } from "@/lib/tenant";

export function usePOSOrderQueueInvalidation() {
  useEffect(() => {
    const tenantId = getActiveTenantId();
    const eventSource = new EventSource(`/api/orders/queue/stream?tenant_id=${encodeURIComponent(tenantId)}`, { withCredentials: true });
    const onUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/open"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
    };

    eventSource.addEventListener("order_queue_updated", onUpdate as EventListener);

    return () => {
      eventSource.removeEventListener("order_queue_updated", onUpdate as EventListener);
      eventSource.close();
    };
  }, []);
}
