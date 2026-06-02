import {
  cacheChannels,
  cacheKeys,
  deleteCacheKey,
  deleteCachePattern,
  publishEvent,
  subscribeEvent,
} from './distributedCache';

type InvalidationScope = 'tenant' | 'features' | 'modules' | 'outlets';

type InvalidationEvent = {
  type: 'cache_invalidation';
  scope: InvalidationScope;
  tenantId: string;
  keys?: string[];
  patterns?: string[];
  reason?: string;
};

let subscriptionStarted = false;

async function deleteKeysAndPatterns(keys: string[] = [], patterns: string[] = []): Promise<void> {
  await Promise.all(keys.map((key) => deleteCacheKey(key)));
  await Promise.all(patterns.map((pattern) => deleteCachePattern(pattern)));
}

export function startCacheInvalidationSubscriber(): void {
  if (subscriptionStarted) return;
  subscriptionStarted = true;

  void subscribeEvent(cacheChannels.invalidation, async (payload) => {
    if (payload.type !== 'cache_invalidation') return;
    await deleteKeysAndPatterns(payload.keys as string[] | undefined, payload.patterns as string[] | undefined);
  });
}

async function invalidate(event: InvalidationEvent): Promise<void> {
  await deleteKeysAndPatterns(event.keys, event.patterns);
  await publishEvent(cacheChannels.invalidation, event);
}

export async function invalidateTenantResolutionCache(
  tenantId: string,
  identifiers: string[] = [],
  reason = 'tenant_mutation',
): Promise<void> {
  const uniqueIdentifiers = Array.from(new Set([tenantId, ...identifiers].filter(Boolean)));
  await invalidate({
    type: 'cache_invalidation',
    scope: 'tenant',
    tenantId,
    keys: uniqueIdentifiers.map((identifier) => cacheKeys.tenant(identifier)),
    reason,
  });
}

export async function invalidateFeatureAccessCache(
  tenantId: string,
  featureCode?: string,
  reason = 'feature_mutation',
): Promise<void> {
  await invalidate({
    type: 'cache_invalidation',
    scope: 'features',
    tenantId,
    keys: featureCode ? [cacheKeys.feature(tenantId, featureCode)] : undefined,
    patterns: featureCode ? undefined : [cacheKeys.feature(tenantId, '*')],
    reason,
  });
}

export async function invalidateModuleAccessCache(
  tenantId: string,
  moduleKey?: string,
  reason = 'module_mutation',
): Promise<void> {
  await invalidate({
    type: 'cache_invalidation',
    scope: 'modules',
    tenantId,
    keys: moduleKey ? [cacheKeys.module(tenantId, moduleKey)] : undefined,
    patterns: moduleKey ? undefined : [cacheKeys.module(tenantId, '*')],
    reason,
  });
}

export async function invalidateOutletCache(
  tenantId: string,
  outletId?: string,
  reason = 'outlet_mutation',
): Promise<void> {
  await invalidate({
    type: 'cache_invalidation',
    scope: 'outlets',
    tenantId,
    keys: [cacheKeys.outlets(tenantId), ...(outletId ? [cacheKeys.outlet(tenantId, outletId)] : [])],
    patterns: outletId ? undefined : [cacheKeys.outlet(tenantId, '*')],
    reason,
  });
}

export async function invalidateTenantFeatureModuleAndOutletCaches(
  tenantId: string,
  reason = 'tenant_scope_mutation',
): Promise<void> {
  await Promise.all([
    invalidateFeatureAccessCache(tenantId, undefined, reason),
    invalidateModuleAccessCache(tenantId, undefined, reason),
    invalidateOutletCache(tenantId, undefined, reason),
  ]);
}
