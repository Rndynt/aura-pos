import { OrderQueue } from "@/components/kitchen-display/OrderQueue";
import { OrderQueuePanel } from "@/components/pos/OrderQueuePanel";

export function OrderQueueSection({ mode = "panel", ...props }: any) {
  return mode === "kds" ? <OrderQueue {...props} /> : <OrderQueuePanel {...props} />;
}
