import { CURRENT_TENANT_ID } from "@pos/core/tenant";

const STORAGE_KEY = "aurapos.activeTenantId";
const TENANT_CONTEXT_TOKEN_STORAGE_KEY = "aurapos.tenantContextToken";
const TERMINAL_TOKEN_STORAGE_KEY = "aurapos.terminalToken";

let activeTenantId = CURRENT_TENANT_ID;


function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function readStoredTenantId(): string | null {
  if (!hasWindow()) return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

function writeStoredTenantId(nextTenantId: string): void {
  if (hasWindow()) {
    window.localStorage.setItem(STORAGE_KEY, nextTenantId);
  }
}

function readStoredToken(key: string): string | null {
  if (!hasWindow()) return null;
  const value = window.localStorage.getItem(key)?.trim();
  return value || null;
}

export function resolveInitialTenantId() {
  const stored = readStoredTenantId();
  activeTenantId = stored || CURRENT_TENANT_ID;
  return activeTenantId;
}

export function getActiveTenantId() {
  return activeTenantId;
}

export function setActiveTenantId(nextTenantId: string) {
  activeTenantId = nextTenantId;
  writeStoredTenantId(nextTenantId);
}

export function clearActiveTenantCache() {
  activeTenantId = CURRENT_TENANT_ID;

  if (hasWindow()) {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

/**
 * Build frontend request headers without treating localStorage as tenant authority.
 *
 * Normal POS API calls rely on the tenant subdomain or authenticated session cookie.
 * Raw `x-tenant-id` is only attached when paired with a server-issued/signed tenant
 * context token for dev/offline clients that cannot use session/subdomain routing.
 */
export function buildTenantAwareHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra ?? {}) };
  const tenantContextToken = readStoredToken(TENANT_CONTEXT_TOKEN_STORAGE_KEY);
  const terminalToken = readStoredToken(TERMINAL_TOKEN_STORAGE_KEY);
  const hasServerIssuedFallback = Boolean(tenantContextToken || terminalToken);

  if (hasServerIssuedFallback && activeTenantId) {
    headers["x-tenant-id"] = activeTenantId;
    if (tenantContextToken) headers["x-tenant-context-token"] = tenantContextToken;
    if (terminalToken) headers["x-terminal-token"] = terminalToken;
  }

  return headers;
}
