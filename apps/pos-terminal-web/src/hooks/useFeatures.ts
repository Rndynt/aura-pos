import { useTenantFeatures } from "@/lib/api/hooks";
import { useTenant } from "@/context/TenantContext";
import { FEATURE_REQUIRED_PLAN, PLAN_RANK } from "@/lib/featureCatalog";

export function useFeatures() {
  const { data, isLoading, error } = useTenantFeatures();
  const { planTier } = useTenant();

  const features = data?.features || [];

  const hasFeature = (code: string): boolean => {
    if (isLoading) return false;

    // Plan-tier ceiling derived from featureCatalog — no hardcoded lists here.
    if (planTier) {
      const required = FEATURE_REQUIRED_PLAN[code];
      if (required && PLAN_RANK[planTier] < PLAN_RANK[required]) return false;
    }

    return features.some(f => f.feature_code === code && f.is_active !== false);
  };

  return {
    features,
    loading: isLoading,
    error,
    hasFeature,
  };
}
