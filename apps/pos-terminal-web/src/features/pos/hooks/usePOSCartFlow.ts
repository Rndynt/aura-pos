import { cartToOrderPayload } from "../../pos-core";
import { getProductsById } from "../../pos-core";

export function usePOSCartFlow() {
  return { cartToOrderPayload, getProductsById };
}
