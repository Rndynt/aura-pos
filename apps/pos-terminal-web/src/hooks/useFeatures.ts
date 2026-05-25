import { useTenantFeatures } from "@/lib/api/hooks";

export function useFeatures() {
  const { data, isLoading, error } = useTenantFeatures();

  const features = data?.features || [];

  const hasFeature = (code: string): boolean => {
    if (isLoading) return false;
    return features.some(f => f.feature_code === code);
  };

  return {
    features,
    loading: isLoading,
    error,
    hasFeature,
  };
}
