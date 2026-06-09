import { getLocalDraftItems } from "../mappers/orderToCart";

export function usePOSOfflineFlow() {
  return { getLocalDraftItems };
}
