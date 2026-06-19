import { useEffect, type MutableRefObject } from "react";
import { toCFDItem, useCustomerDisplaySender } from "@/hooks/useCustomerDisplay";
import { buildOrderingCFDPayload } from "../mappers/cfdPayloadMapper";

export function usePOSCustomerDisplayFlow(input: {
  cart: any;
  tenantName: string;
  inPaymentFlowRef: MutableRefObject<boolean>;
  enabled?: boolean;
}) {
  const { send } = useCustomerDisplaySender(input.enabled ?? false);

  useEffect(() => {
    if (input.inPaymentFlowRef.current) return;
    if (input.cart.items.length === 0) {
      send({ type: "idle", tenantName: input.tenantName });
    } else {
      send(buildOrderingCFDPayload({
        tenantName: input.tenantName,
        orderNumber: input.cart.orderNumber || "",
        items: input.cart.items.map(toCFDItem),
        subtotal: input.cart.subtotal,
        tax: input.cart.tax,
        serviceCharge: input.cart.serviceCharge,
        total: input.cart.total,
        customerName: input.cart.customerName || undefined,
        tableNumber: input.cart.tableNumber || undefined,
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.cart.items, input.cart.total, input.cart.orderNumber, input.tenantName]);

  return { sendToCFD: send };
}
