import { cartItemsToKitchenTicketItems } from "../mappers/kitchenTicketPayloadMapper";

export function usePOSKitchenFlow() {
  return { cartItemsToKitchenTicketItems };
}
