# Replit/Codex Prompt P0 — Current POS Flow Audit & Freeze

Repository: `Rndynt/AuraPoS`

## Goal

Perform a deep audit of the current POS flow before any business-flow refactor is executed.

This phase is **audit only**. Do not refactor code. Do not change runtime behavior. Do not rename routes/components. Do not patch bugs unless explicitly requested in a later phase.

The purpose of P0 is to freeze the current state, identify mixed business-flow logic, and produce a precise report that will be used for P1 Business Flow SOT and P2 POS lifecycle fix.

## Why this audit is required

AuraPoS currently mixes different business flows in the same POS page/state flow:

- retail checkout;
- cafe/counter checkout;
- restaurant table service;
- kitchen/KDS flow;
- draft/open order flow;
- order queue display;
- payment flow;
- offline/local draft flow.

This creates unsafe behavior, such as active kitchen orders being treated like editable drafts and standard retail orders entering draft/open-order loops.

## Audit scope

Audit these areas:

```txt
apps/pos-terminal-web/src/features/pos/pages/POSPage.tsx
apps/pos-terminal-web/src/components/pos/CombinedDraftSheet.tsx
apps/pos-terminal-web/src/components/pos/DraftOrdersSheet.tsx
apps/pos-terminal-web/src/components/pos/ProductArea.tsx
apps/pos-terminal-web/src/components/pos/ProductCardV2.tsx
apps/pos-terminal-web/src/hooks/useOfflineOrderSubmit.ts
apps/pos-terminal-web/src/lib/api/hooks.ts
apps/pos-terminal-web/src/lib/api/tableHooks.ts
apps/api/src/http/controllers/OrdersController.ts
apps/api/src/http/routes/orders*.ts
packages/application/orders/**
packages/application/payments/**
packages/application/entitlements/**
packages/application/business-flows/** if already exists
packages/infrastructure/repositories/orders/**
packages/infrastructure/db/schema/orders.schema.ts
shared/schema.ts if order schema still lives there
```

If file paths differ, find the equivalent files with `rg`.

## Required searches

Run and record important results:

```bash
rg -n "CombinedDraftSheet|DraftOrdersSheet|continueOrderId|handleUpdateContinueOrder|handleCharge|Send to Kitchen|sendToKitchen|kitchen|KDS" apps packages shared
rg -n "paymentStatus|order.status|confirmed|preparing|ready|served|draft|completed|cancelled" apps packages shared
rg -n "orders_queue|restaurant_kitchen_ops|requireTenantEntitlement|can\(|entitlement" apps packages shared
rg -n "create-and-pay|recordPayment|useCreateAndPay|useRecordPayment|cancelOrder|updateOrder" apps packages shared
rg -n "local draft|LocalDraft|deleteLocalDraftOrder|listLocalDraftOrders|createLocalOrder" apps packages shared
```

## Questions the audit must answer

### POS entry points

Document every user action in POS:

```txt
Bayar
Simpan Draft / Draft
Lanjut
Hapus
Send to Kitchen
Tambah item
Cancel/Void
Split bill
Partial payment
Open order / active order actions
Offline/local draft actions
```

For each action, answer:

```txt
Which UI component owns it?
Which API endpoint/use case does it call?
Which order status/payment status does it create or modify?
Which entitlement gates it?
Is it retail-only, restaurant-only, cafe-counter, or shared core?
```

### Current order lifecycle

Map all current order states and payment states:

```txt
Cart
Local Draft
Server Draft
Confirmed
Preparing
Ready
Served
Completed/Paid
Cancelled
Partial/unpaid/paid
```

Document current transitions, even if wrong.

### Draft vs active order

Answer explicitly:

```txt
What is currently treated as draft?
What should be true server draft?
Which unpaid orders are actually active orders?
Which orders are kitchen orders?
Which orders are safe to edit?
Which orders are safe to delete/cancel from cashier UI?
```

### Kitchen safety

Audit kitchen behavior:

```txt
What happens after Send to Kitchen?
Does the order become confirmed/preparing/ready/served?
Is a kitchen ticket created?
Can the order still be loaded into cart?
Can it still be deleted via trash?
Can fired kitchen items be edited?
Can active kitchen orders be paid without cart edit?
```

### Standard POS safety

Audit non-kitchen/non-order-queue flow:

```txt
Can tenant without restaurant_kitchen_ops and without orders_queue do Cart -> Bayar -> paid/completed?
Does it enter draft/open order unexpectedly?
Does continued draft payment actually pay, or only update the order?
```

### Entitlement boundaries

Document which entitlement is currently used for:

```txt
standard payment
order queue display
send to kitchen
KDS/kitchen ticket
split bill
partial payment
draft/open order
cancel/void/refund
```

Identify any hardcoded plan names or entitlement bypass.

## Output report

Create this file:

```txt
roadmap/business-flows/P0_current_pos_flow_audit.md
```

The report must include:

```txt
1. Executive summary
2. Current POS action map
3. Current order lifecycle map
4. Current entitlement map
5. Current UI component ownership map
6. Current backend endpoint/use-case ownership map
7. Retail standard flow findings
8. Restaurant/kitchen flow findings
9. Cafe/counter flow findings if present
10. Draft/local draft/open order findings
11. Critical bugs and unsafe behavior
12. Refactor risk register
13. Recommended P1 SOT requirements
14. Recommended P2 lifecycle fix requirements
15. Files that must not be touched yet
```

## Required classification

Classify each finding as:

```txt
BUG_FATAL
BUG_CONFUSING_UX
ARCHITECTURE_LEAK
ENTITLEMENT_RISK
SAFE_SHARED_CORE
BUSINESS_FLOW_SPECIFIC
UNKNOWN_NEEDS_CONFIRMATION
```

## Restrictions

Do not implement code changes in P0.

Allowed changes:

```txt
roadmap/business-flows/P0_current_pos_flow_audit.md
```

Optional allowed if useful:

```txt
roadmap/business-flows/P0_flow_diagrams.md
```

Forbidden in P0:

```txt
runtime code changes
schema changes
migration changes
UI component changes
API behavior changes
entitlement logic changes
renaming components/routes
fixing POS bugs directly
```

## Validation

Since this is audit-only, no full test run is required unless easy. But the report must mention:

```txt
No runtime code changed in P0.
Audit completed from static code inspection.
No behavior changed.
```

## Completion checklist

- [x] POS action map completed.
- [x] Order lifecycle map completed.
- [x] Entitlement map completed.
- [x] UI ownership map completed.
- [x] Backend ownership map completed.
- [x] Draft/open/kitchen problem documented.
- [x] Standard retail flow problem documented.
- [x] Restaurant/kitchen safety risks documented.
- [x] P1 SOT requirements listed.
- [x] P2 lifecycle fix requirements listed.
- [x] No runtime code changed.

## Commit

```txt
docs(business-flows): audit current POS flow
```
