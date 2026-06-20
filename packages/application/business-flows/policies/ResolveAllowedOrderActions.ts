import type { OrderActionId } from "@pos/domain/business-flows";
import { ORDER_ACTION_DEFINITIONS } from "@pos/domain/business-flows";
import type { CanPerformOrderActionInput } from "./CanPerformOrderAction";
import { CanPerformOrderAction } from "./CanPerformOrderAction";

export function ResolveAllowedOrderActions(input: Omit<CanPerformOrderActionInput, "action">): OrderActionId[] {
  return Object.keys(ORDER_ACTION_DEFINITIONS).filter((action) =>
    CanPerformOrderAction({ ...input, action: action as OrderActionId }).allowed,
  ) as OrderActionId[];
}
