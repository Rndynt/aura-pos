import { ENTITLEMENT_CATALOG, type BusinessTypeCode, type EntitlementCode, type OfferCode, type PlanCode } from './entitlementCatalog';

export type TenantEntitlementGrantStatus = 'active' | 'expired' | 'cancelled';
export type TenantEntitlementGrantSource = 'purchase' | 'manual_grant' | 'trial';

export type TenantEntitlementGrant = {
  entitlementCode: EntitlementCode | string;
  status: TenantEntitlementGrantStatus;
  expiresAt?: Date | string | null;
  source?: TenantEntitlementGrantSource;
};

export type GetActiveTenantEntitlementGrantsInput = {
  grants?: TenantEntitlementGrant[];
  loadGrants?: () => Promise<TenantEntitlementGrant[]>;
};

export type EffectiveEntitlementInput = GetActiveTenantEntitlementGrantsInput & {
  planCode: PlanCode;
  businessType?: BusinessTypeCode;
};

export type EntitlementCheckInput = EffectiveEntitlementInput & {
  entitlementCode: EntitlementCode;
};

export type CanPurchaseOfferInput = {
  offerCode: OfferCode;
  planCode: PlanCode;
};

export class EntitlementRequiredError extends Error {
  constructor(public readonly entitlementCode: EntitlementCode) {
    super(`Entitlement '${entitlementCode}' is required.`);
    this.name = 'EntitlementRequiredError';
  }
}

export function getPlanIncludedEntitlements(planCode: PlanCode): EntitlementCode[] {
  const selectedPlan = ENTITLEMENT_CATALOG.plans[planCode];
  const entitlements = new Set<EntitlementCode>();

  for (const plan of Object.values(ENTITLEMENT_CATALOG.plans)) {
    if (plan.sortOrder <= selectedPlan.sortOrder) {
      for (const code of plan.included) {
        entitlements.add(code as EntitlementCode);
      }
    }
  }

  return [...entitlements];
}

export function getBusinessTypeDefaultEntitlements(businessType: BusinessTypeCode): EntitlementCode[] {
  return [...ENTITLEMENT_CATALOG.businessTypes[businessType].defaultEntitlements] as EntitlementCode[];
}

export async function getActiveTenantEntitlementGrants(
  input: GetActiveTenantEntitlementGrantsInput,
): Promise<EntitlementCode[]> {
  const now = new Date();
  const grants = input.grants ?? (input.loadGrants ? await input.loadGrants() : []);
  const active = new Set<EntitlementCode>();

  for (const grant of grants) {
    if (grant.status !== 'active') continue;
    if (!(grant.entitlementCode in ENTITLEMENT_CATALOG.entitlements)) continue;
    if (grant.expiresAt && new Date(grant.expiresAt) <= now) continue;
    active.add(grant.entitlementCode as EntitlementCode);
  }

  return [...active];
}

export async function getEffectiveEntitlements(input: EffectiveEntitlementInput): Promise<Set<EntitlementCode>> {
  const effective = new Set<EntitlementCode>(getPlanIncludedEntitlements(input.planCode));

  if (input.businessType) {
    for (const code of getBusinessTypeDefaultEntitlements(input.businessType)) {
      effective.add(code);
    }
  }

  for (const code of await getActiveTenantEntitlementGrants(input)) {
    effective.add(code);
  }

  return effective;
}

export async function hasEntitlement(input: EntitlementCheckInput): Promise<boolean> {
  return (await getEffectiveEntitlements(input)).has(input.entitlementCode);
}

export async function requireEntitlement(input: EntitlementCheckInput): Promise<void> {
  if (!(await hasEntitlement(input))) {
    throw new EntitlementRequiredError(input.entitlementCode);
  }
}

export function canPurchaseOffer(input: CanPurchaseOfferInput): boolean {
  const offer = ENTITLEMENT_CATALOG.offers[input.offerCode];
  const tenantPlan = ENTITLEMENT_CATALOG.plans[input.planCode];
  const requiredPlan = ENTITLEMENT_CATALOG.plans[offer.requiredPlan];
  return tenantPlan.sortOrder >= requiredPlan.sortOrder;
}
