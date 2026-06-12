import { offlineDb } from "./db";

const META_KEY_TENANT = "tenant_cached_at";

function nowIso() {
  return new Date().toISOString();
}

export async function saveCachedOrderTypes(tenantId: string, orderTypes: unknown[]): Promise<void> {
  const now = nowIso();
  const rows = (orderTypes as Array<Record<string, unknown>>).map((ot) => ({
    id: String(ot.id ?? ""),
    tenantId,
    name: String(ot.name ?? ""),
    syncStatus: "synced",
    updatedAt: now,
    rawData: ot,
  }));
  await offlineDb.local_order_types.bulkPut(rows as any);
}

export async function getCachedOrderTypes(tenantId: string): Promise<unknown[]> {
  const rows = await offlineDb.local_order_types.where("tenantId").equals(tenantId).toArray();
  return rows.map((r: any) => r.rawData ?? {
    id: r.id,
    name: r.name,
    isActive: true,
  });
}

export async function saveCachedFeatures(tenantId: string, features: unknown[]): Promise<void> {
  const now = nowIso();
  const rows = (features as Array<Record<string, unknown>>).map((f) => ({
    id: String(f.id ?? ""),
    tenantId,
    code: String(f.feature_code ?? f.code ?? ""),
    enabled: Boolean(f.is_active ?? f.enabled ?? false),
    syncStatus: "synced",
    updatedAt: now,
    rawData: f,
  }));
  await offlineDb.local_features.bulkPut(rows as any);
}

export async function getCachedFeatures(tenantId: string): Promise<unknown[]> {
  const rows = await offlineDb.local_features.where("tenantId").equals(tenantId).toArray();
  return rows.map((r: any) => r.rawData ?? {
    id: r.id,
    feature_code: r.code,
    is_active: r.enabled,
    config: {},
  });
}

export async function updateTenantCachedAt(tenantId: string): Promise<void> {
  const key = `${META_KEY_TENANT}:${tenantId}`;
  const now = nowIso();
  await offlineDb.sync_meta.put({ key, value: now, updatedAt: now });
}

export async function getTenantCachedAt(tenantId: string): Promise<string | null> {
  const key = `${META_KEY_TENANT}:${tenantId}`;
  const row = await offlineDb.sync_meta.get(key);
  return row?.value ?? null;
}

export function isTenantCacheStale(cachedAt: string | null, maxAgeMs = 24 * 60 * 60 * 1000): boolean {
  if (!cachedAt) return true;
  return Date.now() - new Date(cachedAt).getTime() > maxAgeMs;
}

// ── Effective entitlement map cache (offline-first) ──────────────────────────

const META_KEY_ENTITLEMENTS = "tenant_entitlements_map";

export async function saveCachedEntitlements(
  tenantId: string,
  entitlements: Record<string, boolean>,
): Promise<void> {
  const key = `${META_KEY_ENTITLEMENTS}:${tenantId}`;
  const now = nowIso();
  await offlineDb.sync_meta.put({ key, value: JSON.stringify(entitlements), updatedAt: now });
}

export async function getCachedEntitlements(tenantId: string): Promise<Record<string, boolean> | null> {
  const key = `${META_KEY_ENTITLEMENTS}:${tenantId}`;
  const row = await offlineDb.sync_meta.get(key);
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as Record<string, boolean>;
  } catch {
    return null;
  }
}
