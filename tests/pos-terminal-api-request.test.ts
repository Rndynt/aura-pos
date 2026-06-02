import assert from "node:assert/strict";
import test from "node:test";
import { apiRequest } from "../apps/pos-terminal-web/src/lib/queryClient";
import { setActiveOutletId } from "../apps/pos-terminal-web/src/lib/outlet";
import { setActiveTenantId } from "../apps/pos-terminal-web/src/lib/tenant";

type FetchCall = {
  url: string;
  init: RequestInit;
};

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

test("conflict resolve apiRequest includes credentials and tenant-aware headers", async () => {
  const localStorage = new MemoryStorage();
  localStorage.setItem("aurapos.tenantContextToken", "ctx-token-123");
  localStorage.setItem("aurapos.terminalToken", "terminal-token-456");

  Object.defineProperty(globalThis, "window", {
    value: { localStorage },
    configurable: true,
  });

  setActiveTenantId("tenant_conflict_test");
  setActiveOutletId("outlet_conflict_test");

  const calls: FetchCall[] = [];
  Object.defineProperty(globalThis, "fetch", {
    value: async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
    configurable: true,
  });

  await apiRequest("PATCH", "/api/sync/conflicts/conflict_123/resolve", {
    resolution: "resolved",
    resolved_by: "owner",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/sync/conflicts/conflict_123/resolve");
  assert.equal(calls[0].init.method, "PATCH");
  assert.equal(calls[0].init.credentials, "include");
  assert.equal(calls[0].init.body, JSON.stringify({ resolution: "resolved", resolved_by: "owner" }));

  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers["Content-Type"], "application/json");
  assert.equal(headers["x-tenant-id"], "tenant_conflict_test");
  assert.equal(headers["x-tenant-context-token"], "ctx-token-123");
  assert.equal(headers["x-terminal-token"], "terminal-token-456");
  assert.equal(headers["x-outlet-id"], "outlet_conflict_test");
});
