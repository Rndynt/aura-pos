# Replit/Codex Prompt P3 — Extract Reusable POS Core Without Business-Flow Split

Repository: `Rndynt/AuraPoS`

## Goal

Extract the current POS runtime into a reusable POS core layer while preserving behavior from P2/P2.1.

P3 is **not** the retail/restaurant/cafe business-flow split yet. P3 prepares the codebase so P4/P5/P6 can create separate flow adapters without duplicating cart, payment, receipt, order lifecycle, offline, printer, and product-grid logic.

P3 must keep the current POS page behavior working while moving reusable concerns into stable modules.

This phase follows:

```txt
roadmap/business-flows/main.md
roadmap/business-flows/P0_current_pos_flow_audit.md
roadmap/business-flows/P1_business_flow_sot_report.md
roadmap/business-flows/P2_pos_lifecycle_runtime_fix_report.md
roadmap/business-flows/P2_1_lifecycle_hardening_patch_report.md
packages/domain/business-flows/**
packages/application/business-flows/**
```

## Why P3 exists

P0/P1/P2/P2.1 fixed lifecycle safety and introduced business-flow vocabulary, but POS runtime is still too centralized.

Current problem:

```txt
POSPage still orchestrates too many concerns:
- product add and stock guard
- cart state
- order type selection
- payment dialog
- draft/server active order interactions
- kitchen ticket sending
- offline order submit
- CFD/customer display
- receipt printing
- order queue invalidation
- lifecycle classification
```

P3 extracts reusable POS core so later phases can build:

```txt
P4 retail_standard
P5 restaurant_table_service
P6 cafe_counter / quick_service
```

without copying the same logic.

## Non-negotiable scope boundary

Allowed in P3:

```txt
- Extract reusable frontend POS core components/hooks/services.
- Extract reusable POS mappers and side-effect services into clear folders.
- Create a stable POS core facade/hook that current POSPage can consume.
- Add compatibility re-exports if moving files would break imports.
- Add tests for extracted pure helpers/mappers where feasible.
- Update docs/report.
```

Forbidden in P3:

```txt
- Do not split POSRootPage into RetailPOSFlow/RestaurantPOSFlow/CafeCounterPOSFlow yet.
- Do not change backend order/payment behavior.
- Do not change database schema/migrations.
- Do not change entitlement semantics.
- Do not change P2/P2.1 lifecycle rules.
- Do not hardcode plan names.
- Do not make orders_queue required for payment lifecycle.
- Do not rewrite payment engine or NorthFlow integration.
- Do not remove offline/local draft behavior.
- Do not rename public routes.
```

P3 is a behavior-preserving refactor. If behavior must change, stop and document it as a P4/P5/P6 requirement instead.

## Required files to inspect first

Inspect these before editing:

```txt
roadmap/business-flows/P2_1_lifecycle_hardening_patch_report.md
apps/pos-terminal-web/src/features/pos/pages/POSPage.tsx
apps/pos-terminal-web/src/features/pos/components/POSLayout.tsx
apps/pos-terminal-web/src/features/pos/components/ProductSection.tsx
apps/pos-terminal-web/src/features/pos/components/CartSection.tsx
apps/pos-terminal-web/src/components/pos/CombinedDraftSheet.tsx
apps/pos-terminal-web/src/components/pos/PaymentMethodDialog.tsx
apps/pos-terminal-web/src/components/pos/ProductOptionsDialog.tsx
apps/pos-terminal-web/src/hooks/useCart.ts
apps/pos-terminal-web/src/hooks/useOfflineOrderSubmit.ts
apps/pos-terminal-web/src/features/pos/services/orderLifecycle.ts
apps/pos-terminal-web/src/features/pos/services/posOrderService.ts
apps/pos-terminal-web/src/features/pos/services/posPrinterService.ts
apps/pos-terminal-web/src/features/pos/mappers/cartToOrderPayload.ts
apps/pos-terminal-web/src/features/pos/mappers/orderToCart.ts
apps/pos-terminal-web/src/features/pos/mappers/receiptPayloadMapper.ts
apps/pos-terminal-web/src/features/pos/mappers/cfdPayloadMapper.ts
apps/pos-terminal-web/src/features/pos/mappers/kitchenTicketPayloadMapper.ts
apps/pos-terminal-web/src/features/pos/hooks/usePOSCustomerDisplayFlow.ts
apps/pos-terminal-web/src/features/pos/hooks/usePOSOrderQueueFlow.ts
apps/pos-terminal-web/src/features/pos/hooks/usePOSResponsiveFlow.ts
apps/pos-terminal-web/src/lib/api/hooks.ts
apps/pos-terminal-web/src/lib/api/tableHooks.ts
```

Use `rg` if paths differ.

## Target folder shape

Create a reusable POS core area under the frontend app.

Preferred target:

```txt
apps/pos-terminal-web/src/features/pos-core/
  components/
    POSProductGrid.tsx
    POSCartPanel.tsx
    POSPaymentDialog.tsx
    POSOrderLifecycleSheet.tsx
    POSReceiptActions.tsx
  hooks/
    usePOSCartState.ts
    usePOSStockGuard.ts
    usePOSPaymentController.ts
    usePOSDraftController.ts
    usePOSActiveOrderPayment.ts
    usePOSReceiptController.ts
    usePOSOfflineSubmit.ts
    usePOSCustomerDisplayController.ts
    usePOSPrinterController.ts
  services/
    posLifecycleService.ts
    posOrderApiService.ts
    posPrinterService.ts
    posPaymentAmountService.ts
  mappers/
    cartToOrderPayload.ts
    orderToCart.ts
    receiptPayloadMapper.ts
    cfdPayloadMapper.ts
    kitchenTicketPayloadMapper.ts
  index.ts
```

If moving everything at once is too risky, create the `pos-core` folder and migrate in slices with compatibility exports.

Compatibility rule:

```txt
Existing imports must keep working unless all references are updated safely.
If a file is moved, leave a small re-export shim at the old path when needed.
```

## Extraction priorities

### Priority 1 — Pure services/mappers first

Move or centralize pure logic first because it is safest:

```txt
orderLifecycle.ts -> pos-core/services/posLifecycleService.ts
payment amount helpers -> pos-core/services/posPaymentAmountService.ts
cartToOrderPayload.ts -> pos-core/mappers/cartToOrderPayload.ts
orderToCart.ts -> pos-core/mappers/orderToCart.ts
receiptPayloadMapper.ts -> pos-core/mappers/receiptPayloadMapper.ts
cfdPayloadMapper.ts -> pos-core/mappers/cfdPayloadMapper.ts
kitchenTicketPayloadMapper.ts -> pos-core/mappers/kitchenTicketPayloadMapper.ts
```

Rules:

```txt
- Keep exported function names stable where possible.
- Add tests for pure helpers if existing test harness supports it.
- Do not change mapping behavior.
```

### Priority 2 — Payment amount and active-order payment controller

Extract active-order payment amount calculation and payment flow from POSPage into reusable helpers/hooks.

Required helper behavior:

```txt
remainingAmount = remaining_amount/remainingAmount if present, else max(total/total_amount - paidAmount/paid_amount, 0)
```

Rules:

```txt
- Never submit NaN.
- Never submit zero or negative amount.
- Partial active order pays remaining only.
- Unpaid active order pays full total.
- Paid order blocks payment.
```

Suggested files:

```txt
apps/pos-terminal-web/src/features/pos-core/services/posPaymentAmountService.ts
apps/pos-terminal-web/src/features/pos-core/hooks/usePOSActiveOrderPayment.ts
```

### Priority 3 — Stock guard extraction

Extract stock guard logic from POSPage into a hook/service:

```txt
usePOSStockGuard
```

It should handle:

```txt
- tracked vs non-tracked products
- product unavailable
- outlet availableQuantity fallback to stock_qty
- add quantity validation
- update quantity validation
- user-facing reason string
```

Behavior must stay identical.

### Priority 4 — Receipt/printer extraction

Extract receipt and printer orchestration:

```txt
usePOSReceiptController
usePOSPrinterController
POSReceiptActions optional
```

Must keep:

```txt
- paired printer check
- enqueue print job
- print now
- mark print failed
- no browser print auto-trigger unless existing behavior already does it
```

### Priority 5 — CFD/customer display extraction

Keep current CFD behavior but move orchestration behind a reusable controller/hook:

```txt
usePOSCustomerDisplayController
```

It should preserve:

```txt
- cart state display
- payment method display
- completed payment display
- inPaymentFlowRef behavior so cart-change effect does not override payment/completed CFD state
```

### Priority 6 — Order lifecycle sheet wrapper

Do not rewrite the sheet UI heavily, but make it a reusable POS core lifecycle component:

```txt
POSOrderLifecycleSheet
```

It can wrap or re-export current `CombinedDraftSheet` for now.

Minimum goal:

```txt
Current POSPage should not directly own draft/active-order row classification details.
```

### Priority 7 — POSPage slimming

After extracting helpers/hooks, slim `POSPage.tsx`.

P3 target:

```txt
POSPage remains the route/page orchestrator,
but business-agnostic POS core logic moves into pos-core hooks/services/components.
```

Do not chase perfect file size if it risks regressions. The priority is clear boundaries.

## What must remain reusable POS core

The extracted core should be reusable by future flows:

```txt
retail_standard
restaurant_table_service
cafe_counter
quick_service
```

Core reusable responsibilities:

```txt
- product grid/product selection
- cart state and payload mapping
- order type selection plumbing
- payment dialog orchestration
- active order payment amount calculation
- server draft resume/payment plumbing
- local draft resume/delete plumbing
- receipt payload and print orchestration
- customer display payload orchestration
- stock guard
- offline submit wrapper
- lifecycle classification based on server DTO fields
```

Core must not encode business-specific default flow decisions such as:

```txt
restaurant must pay-later
retail must hide kitchen forever
cafe must create kitchen ticket after payment
service business uses DP/in-progress lifecycle
```

Those decisions are for P4/P5/P6 adapters.

## Import boundary rules

Frontend `pos-core` may import:

```txt
@/components/ui/*
@/lib/api/hooks where needed for frontend API hooks
@/hooks/use-toast
@/context/TenantContext
@pos/domain types
@pos/offline where offline controller needs it
existing frontend services
```

Frontend `pos-core` must not import:

```txt
apps/api
packages/infrastructure
shared/schema
Drizzle
Express
server-only files
```

If you need domain/application business-flow types, import from clean package exports only.

## Required behavior preservation checklist

After P3, these must still work exactly as after P2.1:

```txt
1. Fresh cart payment opens payment dialog and submits create-and-pay/offline flow.
2. Server Draft -> Lanjut -> Bayar updates draft first then records payment.
3. Active order row/detail -> Bayar records payment on existing order using remaining amount.
4. Active/kitchen orders do not enter editable cart.
5. Active/kitchen rows do not show draft trash delete.
6. Local draft rows still resume and delete locally.
7. Send to Kitchen still works when restaurant_kitchen_ops is active.
8. Partial/DP flow still uses existing partial entitlement and create-and-pay DP path.
9. Multi/split payment flags are preserved in PaymentMethodDialog.
10. Receipt and CFD behavior is preserved.
11. Stock guard remains outlet-aware.
12. No new orders_queue requirement is introduced for payment lifecycle.
```

## Tests required

Add tests for extracted pure helpers. Suggested tests:

```txt
posPaymentAmountService:
- unpaid active order returns total
- partial active order returns remaining_amount if present
- partial active order falls back to total - paidAmount
- paid order returns blocked/zero invalid state
- invalid numeric fields are rejected

posLifecycleService:
- server flags are preferred
- fallback still classifies draft/active/kitchen/local/paid correctly

cartToOrderPayload / receipt mapper tests if existing pattern supports it.
```

Do not add heavy browser tests unless a harness already exists.

If component tests are available, add:

```txt
CombinedDraftSheet/POSOrderLifecycleSheet:
- true draft shows Lanjut/trash
- active order shows Bayar/Detail
- local draft still works
```

## Manual smoke checklist

Document manual smoke in report:

```txt
1. Retail fresh payment still succeeds.
2. Server draft resume then payment still succeeds.
3. Active order payment from row/detail still succeeds using remaining amount.
4. Stale active continueOrderId still blocks editable cart.
5. Send to Kitchen still creates active order/kitchen ticket.
6. Local draft resume/delete still works.
7. Receipt print/queue behavior still works.
8. CFD payment/completed screens still update correctly if customer_display is enabled.
```

Run browser smoke if environment supports it. If not, clearly state not run.

## Required docs/report

Create:

```txt
roadmap/business-flows/P3_pos_core_extraction_report.md
```

Report must include:

```txt
1. Summary
2. Files moved/created/changed
3. Extracted core modules table
4. POSPage slimming summary
5. Compatibility re-exports/shims if any
6. Behavior preservation matrix
7. Tests and validation output
8. Manual smoke result or not-run statement
9. Remaining risks deferred to P4/P5/P6
10. Recommended next phase
```

## Validation commands

Run relevant commands:

```bash
pnpm --filter @pos/domain type-check
pnpm --filter @pos/application type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/terminal-web type-check
pnpm --filter @pos/application test
pnpm --filter @pos/api test
pnpm type-check
```

If frontend-specific tests exist, run them too. If scripts differ, run nearest available and document exact output.

## Completion checklist

- [ ] `pos-core` folder created.
- [ ] Pure POS lifecycle/payment amount/mappers moved or centralized.
- [ ] POSPage imports reusable core modules instead of owning all logic inline.
- [ ] Stock guard extracted.
- [ ] Receipt/printer orchestration extracted or wrapped.
- [ ] CFD/customer display orchestration extracted or wrapped.
- [ ] Draft/active lifecycle sheet wrapper created or current sheet safely re-exported.
- [ ] P2.1 behavior preserved.
- [ ] No schema/migration change.
- [ ] No business-flow adapter split yet.
- [ ] Tests/validation documented.
- [ ] P3 report created.

## Commit

```txt
refactor(pos): extract reusable POS core
```
