# AuraPoS Conflict Resolution Guide

## What is a Sync Conflict

A sync conflict occurs when an offline transaction cannot be applied to the server without review because the server state has changed since the terminal went offline.

Conflicts are **not errors** — they are expected in an offline-first system. The goal is to:
1. Never silently drop a transaction.
2. Accept what can be accepted automatically.
3. Surface what needs human review clearly.

---

## Conflict Types

```typescript
// packages/offline/src/conflictTypes.ts
export const ConflictType = {
  PRODUCT_INACTIVE:          "PRODUCT_INACTIVE",
  PRODUCT_NOT_FOUND:         "PRODUCT_NOT_FOUND",
  PRICE_CHANGED:             "PRICE_CHANGED",
  STOCK_INSUFFICIENT:        "STOCK_INSUFFICIENT",
  ORDER_DUPLICATE:           "ORDER_DUPLICATE",
  PAYMENT_DUPLICATE:         "PAYMENT_DUPLICATE",
  TENANT_FEATURE_DISABLED:   "TENANT_FEATURE_DISABLED",
  ORDER_TYPE_DISABLED:       "ORDER_TYPE_DISABLED",
  TABLE_UNAVAILABLE:         "TABLE_UNAVAILABLE",
  TERMINAL_INACTIVE:         "TERMINAL_INACTIVE",
  SYNC_CONFLICT:             "SYNC_CONFLICT",  // generic fallback
} as const;
```

---

## Severity and Policy Matrix

| Conflict Type | Severity | Resolution Policy | Sync Outcome |
|--------------|----------|------------------|--------------|
| `PRODUCT_INACTIVE` | blocking | `discard` | Sync item marked `conflict`; order not created |
| `PRODUCT_NOT_FOUND` | blocking | `discard` | Sync item marked `conflict`; order not created |
| `PRICE_CHANGED` | warning | `audit_note` | Order created at offline price; conflict logged |
| `STOCK_INSUFFICIENT` | warning | `audit_note` | Order created; stock goes negative; conflict logged |
| `ORDER_DUPLICATE` | needs_review | `auto_accept` | Idempotency replay; existing order returned |
| `PAYMENT_DUPLICATE` | needs_review | `auto_accept` | Idempotency replay; existing payment returned |
| `TENANT_FEATURE_DISABLED` | blocking | `discard` | Sync item marked `conflict` |
| `ORDER_TYPE_DISABLED` | blocking | `discard` | Sync item marked `conflict` |
| `TABLE_UNAVAILABLE` | warning | `audit_note` | Order created; table conflict logged |
| `TERMINAL_INACTIVE` | blocking | `discard` | All items from that terminal rejected |
| `SYNC_CONFLICT` | needs_review | `manual_review` | Requires owner/manager action |

---

## Auto-Resolvable vs Manual

```typescript
import { isAutoResolvable } from "@pos/offline";

isAutoResolvable("PRICE_CHANGED")    // true  (audit_note)
isAutoResolvable("ORDER_DUPLICATE")  // true  (auto_accept)
isAutoResolvable("PRODUCT_INACTIVE") // false (discard — needs human review)
isAutoResolvable("SYNC_CONFLICT")    // false (manual_review)
```

`isAutoResolvable` returns `true` for `auto_accept` and `audit_note` policies. These conflicts are stored for visibility but do not block order processing.

---

## Backend Conflict Detection (`SyncOfflineOrder`)

The `SyncOfflineOrder` use case runs per-item during batch sync:

### Price Conflict Detection

```typescript
// Compare offline price with current server price
const product = await db.query.products.findFirst({ where: eq(products.id, item.product_id) });
const priceDelta = Math.abs(item.base_price - product.base_price);
if (priceDelta > 0) {
  // Store conflict with audit_note policy
  // Accept offline price; create the order
  warnings.push(`Price delta: ${priceDelta}`);
}
```

### Stock Conflict Detection

```typescript
if (product.stock_tracking_enabled && product.stock_qty < item.quantity) {
  // Store conflict with audit_note policy
  // Allow negative stock; create the order
  warnings.push(`Stock insufficient: ${product.stock_qty} < ${item.quantity}`);
}
```

### Product Inactive / Not Found

```typescript
if (!product || !product.is_active) {
  // Discard the order — do not create
  return { status: "conflict", error: "PRODUCT_INACTIVE" };
}
```

---

## Conflict Storage

### Server-side (`server_sync_conflicts` table)

```sql
server_sync_conflicts:
  id           text  PRIMARY KEY
  tenant_id    text  NOT NULL
  terminal_id  text
  local_order_id   text
  server_order_id  text
  conflict_type    text  NOT NULL
  message          text
  conflict_data    jsonb   -- original offline payload + server state snapshot
  resolution       text    -- pending | resolved | ignored | auto_resolved
  resolved_at      timestamp
  resolved_by      text
  created_at       timestamp
```

### Client-side (`sync_conflicts` in IndexedDB)

```typescript
type SyncConflict = {
  id: string;
  tenantId: string;
  localEntityId: string;
  conflictType: string;
  message: string;
  syncStatus: SyncStatus;
  createdAt: string;
};
```

---

## Conflict Resolution UI

The `sync-conflicts.tsx` page (`/sync-conflicts` route) provides:

- Summary cards: pending / blocking / total counts
- Filter by: resolution status, severity, conflict type
- Per-conflict actions:
  - **Resolve** — mark as manually resolved
  - **Abaikan (Ignore)** — acknowledge and dismiss
  - **Expand** — view full `conflict_data` JSON payload

Resolution is saved via `PATCH /api/sync/conflicts/:id/resolve`:

```json
{
  "resolution": "resolved",
  "resolved_by": "owner"
}
```

---

## Adding a New Conflict Type

1. Add to `ConflictType` constant in `packages/offline/src/conflictTypes.ts`
2. Add severity to `CONFLICT_SEVERITY` map
3. Add policy to `CONFLICT_RESOLVER_POLICY` map
4. Add Indonesian label to the `labels` map in `conflictLabel()`
5. Add detection logic in `packages/application/sync/SyncOfflineOrder.ts`
6. Add corresponding entry in `packages/application/sync/conflictTypes.ts` (backend mirror)

---

## Tenant-Configurable Policies (Planned)

Currently all policies are hard-coded in `conflictTypes.ts`. A future sprint will add per-tenant policy configuration:

```typescript
// Planned: tenant_conflict_policies table
{
  tenantId: string;
  conflictType: string;
  policy: ResolverPolicy;  // override default
}
```

This would allow a tenant to set `PRICE_CHANGED` to `manual_review` instead of `audit_note`, blocking the sale until an owner approves.
