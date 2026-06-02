# AuraPoS Conflict Resolution Guide

## What is a Sync Conflict

A sync conflict occurs when an offline transaction cannot be applied to the server without modification because the server state has changed since the terminal went offline.

Conflicts are **not errors** — they are expected in an offline-first system. The goal is:
1. Never silently drop a transaction.
2. Accept what can be accepted automatically (with a warning note).
3. Surface what needs human review clearly.
4. Provide a complete audit trail of what happened and why.

---

## Conflict Types

```typescript
// packages/offline/src/conflictTypes.ts
export const ConflictType = {
  PRODUCT_INACTIVE:        "PRODUCT_INACTIVE",        // Product deactivated while terminal was offline
  PRODUCT_NOT_FOUND:       "PRODUCT_NOT_FOUND",       // Product deleted from catalog
  PRICE_CHANGED:           "PRICE_CHANGED",           // Price changed between sale and sync
  STOCK_INSUFFICIENT:      "STOCK_INSUFFICIENT",      // Stock went to zero/negative before sync
  ORDER_DUPLICATE:         "ORDER_DUPLICATE",         // Idempotency replay (not a real conflict)
  PAYMENT_DUPLICATE:       "PAYMENT_DUPLICATE",       // Payment idempotency replay
  TENANT_FEATURE_DISABLED: "TENANT_FEATURE_DISABLED", // Feature disabled while terminal offline
  ORDER_TYPE_DISABLED:     "ORDER_TYPE_DISABLED",     // Order type removed/disabled
  TABLE_UNAVAILABLE:       "TABLE_UNAVAILABLE",       // Table claimed by another terminal/order
  TERMINAL_INACTIVE:       "TERMINAL_INACTIVE",       // Terminal deactivated by admin
  SYNC_CONFLICT:           "SYNC_CONFLICT",           // Generic fallback
} as const;
```

---

## Severity and Policy Matrix

| Conflict Type | Severity | Default Policy | Sync Outcome |
|--------------|----------|----------------|--------------|
| `PRODUCT_INACTIVE` | `blocking` | `discard` | Order NOT created; cashier must re-sell with active product |
| `PRODUCT_NOT_FOUND` | `blocking` | `discard` | Order NOT created |
| `PRICE_CHANGED` | `warning` | `audit_note` | Order CREATED at offline price; conflict logged for review |
| `STOCK_INSUFFICIENT` | `warning` | `audit_note` | Order CREATED; stock goes negative; conflict logged |
| `ORDER_DUPLICATE` | `needs_review` | `auto_accept` | Existing order returned (idempotency replay); no new order |
| `PAYMENT_DUPLICATE` | `needs_review` | `auto_accept` | Existing payment returned; no new payment |
| `TENANT_FEATURE_DISABLED` | `blocking` | `discard` | Order NOT created |
| `ORDER_TYPE_DISABLED` | `blocking` | `discard` | Order NOT created |
| `TABLE_UNAVAILABLE` | `warning` | `audit_note` | Order CREATED; table conflict logged |
| `TERMINAL_INACTIVE` | `blocking` | `discard` | ALL items from this terminal rejected |
| `SYNC_CONFLICT` | `needs_review` | `manual_review` | Requires owner/manager action |

---

## Policy Definitions

| Policy | Meaning |
|--------|---------|
| `auto_accept` | Automatically accepted; conflict logged only for visibility. No human action needed. |
| `audit_note` | Order is accepted; conflict stored for review. Owner can acknowledge or investigate. |
| `manual_review` | Order processing is blocked; human decision required before proceeding. |
| `discard` | Order cannot be created. Stored as blocking conflict. Owner must handle the customer manually. |

---

## Client-Side Helpers

```typescript
import { ConflictType, getSeverity, getPolicy, isAutoResolvable, conflictLabel } from "@pos/offline";

// Severity check
getSeverity("PRICE_CHANGED")          // "warning"
getSeverity("PRODUCT_INACTIVE")       // "blocking"
getSeverity("ORDER_DUPLICATE")        // "needs_review"

// Policy check
getPolicy("PRICE_CHANGED")            // "audit_note"
getPolicy("PRODUCT_INACTIVE")         // "discard"
getPolicy("ORDER_DUPLICATE")          // "auto_accept"
getPolicy("SYNC_CONFLICT")            // "manual_review"

// Auto-resolvable (audit_note + auto_accept = true, others = false)
isAutoResolvable("PRICE_CHANGED")     // true
isAutoResolvable("ORDER_DUPLICATE")   // true
isAutoResolvable("PRODUCT_INACTIVE")  // false
isAutoResolvable("SYNC_CONFLICT")     // false

// Indonesian label (used in UI)
conflictLabel("PRICE_CHANGED")        // "Harga Berubah"
conflictLabel("PRODUCT_INACTIVE")     // "Produk Tidak Aktif"
conflictLabel("STOCK_INSUFFICIENT")   // "Stok Tidak Cukup"
conflictLabel("TABLE_UNAVAILABLE")    // "Meja Tidak Tersedia"
```

---

## Backend Conflict Detection (`SyncOfflineOrder`)

The `SyncOfflineOrder` use case in `packages/application/sync/` runs per-item during batch sync.

### Terminal Check (blocking)

```typescript
const terminal = await db.query.terminals.findFirst({
  where: and(eq(terminals.tenantId, tenantId), eq(terminals.terminalCode, terminalId)),
});
if (!terminal || !terminal.isActive) {
  return { status: "conflict", error: `TERMINAL_INACTIVE: Terminal ${terminalId} is inactive` };
}
```

### Product Active Check (blocking)

```typescript
const product = await db.query.products.findFirst({
  where: and(eq(products.tenantId, tenantId), eq(products.id, item.product_id)),
});
if (!product) {
  // Store conflict, discard order
  return { status: "conflict", error: `PRODUCT_NOT_FOUND: ${item.product_id}` };
}
if (!product.is_active) {
  return { status: "conflict", error: `PRODUCT_INACTIVE: ${product.name}` };
}
```

### Price Change Detection (warning)

```typescript
const priceDelta = Math.abs(item.base_price - product.base_price);
if (priceDelta > 0) {
  // Still create the order at the OFFLINE price
  // But log the conflict for audit
  await db.insert(serverSyncConflicts).values({
    conflictType: "PRICE_CHANGED",
    resolution: "auto_resolved",
    conflictData: {
      product_id: product.id,
      offline_price: item.base_price,
      current_price: product.base_price,
      delta: priceDelta,
    },
  });
  warnings.push(`Price delta on ${product.name}: ${priceDelta}`);
}
// Order proceeds normally
```

### Stock Check (warning)

```typescript
if (product.stock_tracking_enabled) {
  const totalQuantity = order.items
    .filter(i => i.product_id === product.id)
    .reduce((sum, i) => sum + i.quantity, 0);

  if (product.stock_qty < totalQuantity) {
    // Still create the order — offline_sale must not be silently dropped
    // Stock can go negative; flag for review
    await db.insert(serverSyncConflicts).values({
      conflictType: "STOCK_INSUFFICIENT",
      resolution: "auto_resolved",
      conflictData: {
        product_id: product.id,
        available_stock: product.stock_qty,
        requested_quantity: totalQuantity,
      },
    });
    warnings.push(`Insufficient stock for ${product.name}`);
  }
}
```

### Idempotency Replay (auto_accept)

```typescript
const existing = await db.query.orders.findFirst({
  where: and(
    eq(orders.tenantId, tenantId),
    eq(orders.idempotencyKey, order.idempotency_key),
  ),
});
if (existing) {
  return {
    status: "replayed",
    server_order_id: existing.id,
    server_order_number: existing.orderNumber,
  };
}
// No conflict stored — replay is normal expected behaviour
```

---

## Conflict Storage

### Server-side: `server_sync_conflicts` table

```typescript
// Schema (shared/schema.ts)
serverSyncConflicts = pgTable("server_sync_conflicts", {
  id:             text("id").primaryKey(),
  tenantId:       text("tenant_id").notNull(),
  terminalId:     text("terminal_id"),
  localOrderId:   text("local_order_id"),
  serverOrderId:  text("server_order_id"),
  conflictType:   text("conflict_type").notNull(),
  message:        text("message"),
  conflictData:   jsonb("conflict_data"),           // full payload snapshot
  resolution:     text("resolution").default("pending"),
  resolvedAt:     timestamp("resolved_at"),
  resolvedBy:     text("resolved_by"),
  createdAt:      timestamp("created_at").defaultNow(),
});
```

Resolution values: `"pending"` | `"resolved"` | `"ignored"` | `"auto_resolved"`

### Client-side: `sync_conflicts` in IndexedDB

```typescript
type SyncConflict = {
  id: string;
  tenantId: string;
  localEntityId: string;  // local_order_id or other local ID
  conflictType: string;
  message: string;
  syncStatus: SyncStatus;
  createdAt: string;
};
```

---

## Conflict Resolution UI

The `sync-conflicts.tsx` page (`/sync-conflicts` route) provides owner/manager tools to review and resolve conflicts.

### Summary Cards
- **Belum Ditangani** (pending) — total unresolved conflicts
- **Blocking** — conflicts that prevented order creation
- **Total** — all conflicts (including auto-resolved)

### Filter Options
- By resolution status: Semua / Belum Ditangani / Auto Resolved / Resolved / Diabaikan
- By severity: Semua / Blocking / Perlu Review / Peringatan
- By conflict type (dynamic, based on actual conflicts)

### Per-Conflict Actions

| Action | HTTP | Effect |
|--------|------|--------|
| Resolve | `PATCH /api/sync/conflicts/:id/resolve` `{ resolution: "resolved" }` | Marks as manually resolved; sets `resolved_at` and `resolved_by` |
| Abaikan (Ignore) | `PATCH /api/sync/conflicts/:id/resolve` `{ resolution: "ignored" }` | Dismisses; order was already processed as best effort |
| Expand | (client-side) | Shows full `conflict_data` JSON for debugging |

Conflict resolution mutations in the POS terminal use the shared `apiRequest` helper. The helper sends `credentials: "include"` and builds headers with `buildApiHeaders()`, so tenant context tokens, terminal tokens, and the active outlet header are attached when the terminal has those contexts available.

### Conflict Detail Example (PRICE_CHANGED)
```json
{
  "conflictType": "PRICE_CHANGED",
  "message": "Price delta on Kopi Susu: 2000",
  "conflictData": {
    "product_id": "prod_001",
    "offline_price": 25000,
    "current_price": 27000,
    "delta": 2000,
    "order_number": "OFF-XY9Z8W-20260524-0001"
  },
  "resolution": "auto_resolved"
}
```

---

## Notification Flow (SyncStatusWidget)

When the frontend detects `syncStatus === "conflict"` on any local order or outbox item:

1. `SyncStatusWidget` badge turns red
2. Conflict count is shown: e.g. "1 konflik"
3. Badge is clickable → navigates to `/sync-conflicts`

This ensures cashiers immediately see when a sync conflict needs attention, without interrupting the current transaction flow.

---

## Adding a New Conflict Type

1. **`packages/offline/src/conflictTypes.ts` (frontend)**
   ```typescript
   export const ConflictType = {
     // ... existing
     NEW_CONFLICT: "NEW_CONFLICT",
   } as const;

   const CONFLICT_SEVERITY: Record<string, ConflictSeverity> = {
     // ... existing
     NEW_CONFLICT: "warning",  // or "blocking" or "needs_review"
   };

   const CONFLICT_RESOLVER_POLICY: Record<string, ResolverPolicy> = {
     // ... existing
     NEW_CONFLICT: "audit_note",  // or "discard", "auto_accept", "manual_review"
   };

   // conflictLabel function — add Indonesian label:
   case "NEW_CONFLICT": return "Label Baru";
   ```

2. **`packages/application/sync/conflictTypes.ts` (backend mirror)** — add the same type

3. **`packages/application/sync/SyncOfflineOrder.ts`** — add detection logic

4. **`apps/pos-terminal-web/src/pages/sync-conflicts.tsx`** — no changes needed (uses `conflictLabel()` dynamically)

---

## Tenant-Configurable Policies (Planned Sprint 7)

Currently all policies are hard-coded in `conflictTypes.ts`. A future sprint will add per-tenant policy configuration via `tenant_conflict_policies` table:

```typescript
// Planned schema
tenantConflictPolicies = pgTable("tenant_conflict_policies", {
  id:           text("id").primaryKey(),
  tenantId:     text("tenant_id").notNull(),
  conflictType: text("conflict_type").notNull(),
  policy:       text("policy").notNull(),  // override default policy
  updatedAt:    timestamp("updated_at").defaultNow(),
});
```

This would allow a tenant to change `PRICE_CHANGED` from `audit_note` to `manual_review`, blocking the order until an owner explicitly approves it.

---

## Conflict Rate Monitoring (Planned Sprint 9)

Track per-tenant conflict rates for production health monitoring:

```sql
-- Daily conflict rate by type
SELECT
  conflict_type,
  COUNT(*) as count,
  DATE(created_at) as date
FROM server_sync_conflicts
WHERE tenant_id = $1
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY conflict_type, DATE(created_at)
ORDER BY date DESC, count DESC;
```

Alert threshold: if `blocking` conflicts exceed 5% of total synced orders on any day, notify the tenant admin.
