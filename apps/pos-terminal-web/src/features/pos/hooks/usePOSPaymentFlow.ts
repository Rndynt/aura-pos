import { recordPOSPartialPayment } from "../services/posPaymentService";

export function usePOSPaymentFlow() {
  return { recordPOSPartialPayment };
}
