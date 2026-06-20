import { BUSINESS_FLOW_PROFILE_IDS, type BusinessFlowProfileId } from "@pos/domain/business-flows";

export type BusinessProfileSource = "business_type_mapping" | "unknown";

export type ResolveBusinessProfileInput = {
  businessType?: string | null;
  businessTypeCode?: string | null;
};

const BUSINESS_TYPE_TO_PROFILE: Record<string, BusinessFlowProfileId> = {
  retail: BUSINESS_FLOW_PROFILE_IDS.retailStandard,
  retailminimarket: BUSINESS_FLOW_PROFILE_IDS.retailStandard,
  minimarket: BUSINESS_FLOW_PROFILE_IDS.retailStandard,
  store: BUSINESS_FLOW_PROFILE_IDS.retailStandard,
  caferestaurant: BUSINESS_FLOW_PROFILE_IDS.restaurantTableService,
  restaurant: BUSINESS_FLOW_PROFILE_IDS.restaurantTableService,
  cafe: BUSINESS_FLOW_PROFILE_IDS.cafeCounter,
  quickservice: BUSINESS_FLOW_PROFILE_IDS.quickService,
  laundry: BUSINESS_FLOW_PROFILE_IDS.serviceBusinessLater,
  serviceappointment: BUSINESS_FLOW_PROFILE_IDS.serviceBusinessLater,
};

function normalizeBusinessType(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized.length > 0 ? normalized : null;
}

export function resolveBusinessProfileFromBusinessType(input: ResolveBusinessProfileInput): BusinessFlowProfileId | null {
  const candidates = [input.businessTypeCode, input.businessType];

  for (const candidate of candidates) {
    const normalized = normalizeBusinessType(candidate);
    if (normalized && BUSINESS_TYPE_TO_PROFILE[normalized]) {
      return BUSINESS_TYPE_TO_PROFILE[normalized];
    }
  }

  return null;
}

export function resolveBusinessProfileSource(input: ResolveBusinessProfileInput): BusinessProfileSource {
  return resolveBusinessProfileFromBusinessType(input) ? "business_type_mapping" : "unknown";
}
