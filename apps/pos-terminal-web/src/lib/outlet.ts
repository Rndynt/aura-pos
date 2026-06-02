import { buildTenantAwareHeaders } from "@/lib/tenant";

const STORAGE_KEY = "aurapos.activeOutletId";

let activeOutletId: string | null = null;

export function resolveInitialOutletId() {
  if (typeof window === "undefined") return activeOutletId;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  activeOutletId = stored || null;
  return activeOutletId;
}

export function getActiveOutletId(): string | null {
  return activeOutletId;
}

export function setActiveOutletId(outletId: string) {
  activeOutletId = outletId;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, outletId);
  }
}

export function clearActiveOutletId() {
  activeOutletId = null;
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

/**
 * Build headers for API requests. Tenant authority comes from subdomain/session;
 * localStorage tenant data is only a display/cache hint and is not sent as a raw
 * tenant header unless a server-issued tenant context token is present.
 */
export function buildApiHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers = buildTenantAwareHeaders(extra);
  const outletId = getActiveOutletId();
  if (outletId) {
    headers["x-outlet-id"] = outletId;
  }
  return headers;
}
