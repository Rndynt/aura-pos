import { BUSINESS_FLOW_PROFILE_IDS, type BusinessFlowProfileId } from "@pos/domain/business-flows";

export type BusinessProfileSource = "business_type_mapping" | "core_fallback";

export type ResolveBusinessProfileInput = {
  businessType?: string | null;
  businessTypeCode?: string | null;
};

export type BusinessTypeMappingEntry = {
  businessTypeCode: string;
  businessFamily: BusinessFlowProfileId;
  notes: string;
};

const BUSINESS_TYPE_TO_PROFILE: Record<string, BusinessFlowProfileId> = {
  retail: BUSINESS_FLOW_PROFILE_IDS.retailStandard,
  retailminimarket: BUSINESS_FLOW_PROFILE_IDS.retailStandard,
  minimarket: BUSINESS_FLOW_PROFILE_IDS.retailStandard,
  store: BUSINESS_FLOW_PROFILE_IDS.retailStandard,
  caferestaurant: BUSINESS_FLOW_PROFILE_IDS.foodBeverage,
  restaurant: BUSINESS_FLOW_PROFILE_IDS.foodBeverage,
  cafe: BUSINESS_FLOW_PROFILE_IDS.foodBeverage,
  foodbeverage: BUSINESS_FLOW_PROFILE_IDS.foodBeverage,
  quickservice: BUSINESS_FLOW_PROFILE_IDS.foodBeverage,
  laundry: BUSINESS_FLOW_PROFILE_IDS.service,
  service: BUSINESS_FLOW_PROFILE_IDS.service,
  serviceappointment: BUSINESS_FLOW_PROFILE_IDS.service,
  appointment: BUSINESS_FLOW_PROFILE_IDS.service,
  salon: BUSINESS_FLOW_PROFILE_IDS.service,
  barber: BUSINESS_FLOW_PROFILE_IDS.service,
  spa: BUSINESS_FLOW_PROFILE_IDS.service,
  digitalppob: BUSINESS_FLOW_PROFILE_IDS.coreStandard,
  ppob: BUSINESS_FLOW_PROFILE_IDS.coreStandard,
  digital: BUSINESS_FLOW_PROFILE_IDS.coreStandard,
};

export const DISCOVERED_BUSINESS_TYPE_MAPPING: readonly BusinessTypeMappingEntry[] = [
  { businessTypeCode: "CAFE_RESTAURANT", businessFamily: "food_beverage", notes: "F&B baseline POS; table/kitchen/KDS are entitlement-gated capabilities." },
  { businessTypeCode: "RETAIL_MINIMARKET", businessFamily: "retail_standard", notes: "Retail baseline POS with no restaurant controls by default." },
  { businessTypeCode: "LAUNDRY", businessFamily: "service", notes: "Service baseline POS; queue/progress features are optional entitlements/future modules." },
  { businessTypeCode: "SERVICE_APPOINTMENT", businessFamily: "service", notes: "Service baseline POS; appointment progress is not required for checkout." },
  { businessTypeCode: "DIGITAL_PPOB", businessFamily: "core_standard", notes: "Core checkout fallback for digital/PPOB catalog sales." },
];

function normalizeBusinessType(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized.length > 0 ? normalized : null;
}

export function resolveBusinessProfileFromBusinessType(input: ResolveBusinessProfileInput): BusinessFlowProfileId {
  const candidates = [input.businessTypeCode, input.businessType];

  for (const candidate of candidates) {
    const normalized = normalizeBusinessType(candidate);
    if (normalized && BUSINESS_TYPE_TO_PROFILE[normalized]) {
      return BUSINESS_TYPE_TO_PROFILE[normalized];
    }
  }

  return BUSINESS_FLOW_PROFILE_IDS.coreStandard;
}

export function resolveBusinessProfileSource(input: ResolveBusinessProfileInput): BusinessProfileSource {
  const candidates = [input.businessTypeCode, input.businessType];
  return candidates.some((candidate) => {
    const normalized = normalizeBusinessType(candidate);
    return Boolean(normalized && BUSINESS_TYPE_TO_PROFILE[normalized]);
  })
    ? "business_type_mapping"
    : "core_fallback";
}
