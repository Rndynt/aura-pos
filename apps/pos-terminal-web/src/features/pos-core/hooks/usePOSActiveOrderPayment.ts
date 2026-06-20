import type { Dispatch, SetStateAction } from "react";
import { useToast } from "@/hooks/use-toast";
import { resolvePOSActiveOrderPaymentAmount } from "../services/posPaymentAmountService";
import type { POSLifecycleOrder } from "../services/posLifecycleService";

export type POSPendingOrderPayment = { orderId: string; totalAmount: number; orderNumber: string } | null;

export function usePOSActiveOrderPayment(input: {
  setPendingOrderForPayment: Dispatch<SetStateAction<POSPendingOrderPayment>>;
  openPaymentDialog: () => void;
}) {
  const { toast } = useToast();

  const payActiveOrder = (order: POSLifecycleOrder) => {
    const result = resolvePOSActiveOrderPaymentAmount(order);
    if (!result.ok) {
      toast({ title: "Pembayaran diblokir", description: result.reason, variant: "destructive" });
      return;
    }
    input.setPendingOrderForPayment({ orderId: order.id, totalAmount: result.amount, orderNumber: result.orderNumber });
    input.openPaymentDialog();
  };

  return { payActiveOrder };
}
