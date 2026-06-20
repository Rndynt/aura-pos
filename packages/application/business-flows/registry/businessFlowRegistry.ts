import type { BusinessFlowProfileDefinition, BusinessFlowProfileId, OrderActionId } from "@pos/domain/business-flows";
import { ORDER_ACTION_DEFINITIONS } from "@pos/domain/business-flows";
import type { CanPerformOrderActionInput } from "../policies/CanPerformOrderAction";
import { CanPerformOrderAction } from "../policies/CanPerformOrderAction";
import { BUSINESS_FLOW_PROFILES } from "./businessFlowProfiles";

export function getBusinessFlowProfile(profileId: BusinessFlowProfileId): BusinessFlowProfileDefinition | undefined {
  return BUSINESS_FLOW_PROFILES[profileId];
}

export function listBusinessFlowProfiles(): BusinessFlowProfileDefinition[] {
  return Object.values(BUSINESS_FLOW_PROFILES);
}

export function isActionSupported(profileId: BusinessFlowProfileId, action: OrderActionId): boolean {
  const profile = getBusinessFlowProfile(profileId);
  return Boolean(profile && [...profile.defaultActions, ...profile.optionalActions].includes(action));
}

export function resolveAllowedActions(input: Omit<CanPerformOrderActionInput, "action">): OrderActionId[] {
  return Object.keys(ORDER_ACTION_DEFINITIONS).filter((action) =>
    CanPerformOrderAction({ ...input, action: action as OrderActionId }).allowed,
  ) as OrderActionId[];
}
