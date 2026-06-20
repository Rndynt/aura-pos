import { RetailStandardPOSFlow } from "@/features/pos-flows/retail";

/**
 * Core checkout baseline shared by business families that do not yet need a
 * dedicated adapter. It intentionally exposes only the reusable POS baseline:
 * product/catalog, cart, full payment, and receipt.
 */
export function CoreStandardPOSFlow() {
  return <RetailStandardPOSFlow />;
}
