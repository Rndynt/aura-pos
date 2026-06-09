import { cartToOrderPayload } from "../mappers/cartToOrderPayload";
import { getProductsById } from "../mappers/orderToCart";

export function usePOSCartFlow() {
  return { cartToOrderPayload, getProductsById };
}
