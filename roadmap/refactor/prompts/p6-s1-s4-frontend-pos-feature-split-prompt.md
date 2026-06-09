# AuraPoS Refactor — P6 S1-S4 Frontend POS Feature Split Agent Prompt

You are working in the `Rndynt/AuraPoS` repository.

This prompt is the updated P6 prompt to use after P2, P3, P4, and P5 have been implemented.

## Objective

Execute **P6 S1-S4 — Frontend POS Feature Split** safely.

The goal is to reduce responsibility inside:

```txt
apps/pos-terminal-web/src/pages/pos.tsx
```

`pos.tsx` should become a page-level UI orchestrator, not the owner of cart, payment, partial payment, KDS, CFD, customer display, printer, receipt, offline, and order queue workflow details.

P6 is a frontend behavior-preserving refactor. It is not a feature phase.

## Read first

Read these files before editing:

```txt
roadmap/refactor/main.md
roadmap/refactor/execution-protocol.md
roadmap/refactor/p6-s1-s4-frontend-pos-feature-split.md
roadmap/refactor/p5-s1-s3-realtime-cfd-module-split.md
roadmap/refactor/p4-s1-s3-thin-controllers.md
roadmap/refactor/p3-s1-s3-unit-of-work-transaction-boundary.md

apps/pos-terminal-web/src/pages/pos.tsx
apps/pos-terminal-web/package.json
```

Search current POS frontend dependencies before editing:

```bash
rg -n "Payment|payment|partial|KDS|kitchen|CFD|customer.?display|printer|receipt|offline|queue|draft|cart|OrderQueue|useCart" apps/pos-terminal-web/src
```

## Strict scope

Work only on P6.

Do not start P7.

Do not touch backend API behavior.

Do not edit `apps/api/src/routes.ts` or `apps/api/src/realtime/cfd` unless a frontend import/build issue absolutely requires a tiny type-only adjustment. Prefer no backend changes.

Do not edit P4 order workflow services.

Do not edit P3 transaction boundary code.

Do not edit payment backend, partial payment backend, RecordPayment, CreateAndPayOrder, SyncOfflineOrder, inventory policy, stock movement, DB schema, or migrations.

Do not change public API endpoints.

Do not change API request/response contracts.

Do not remove cash payment support.

Do not remove standard POS payment behavior.

Do not remove partial payment support.

Do not break offline order save/sync behavior.

Do not break KDS/local kitchen ticket behavior.

Do not break customer display / CFD messages.

Do not break receipt printer or print queue behavior.

Do not move backend-specific infrastructure into frontend features.

Do not reintroduce Northflow/embedded payment code.

## P5 behavior that must be preserved

P5 extracted backend CFD/realtime logic into `apps/api/src/realtime/cfd` and preserved:

```txt
POST /api/cfd/session-token
POST /api/cfd/update
WS /ws/cfd
```

P6 may reorganize frontend customer display/CFD client code, but it must keep frontend behavior compatible with those backend contracts.

Do not change CFD endpoint paths, WebSocket path, token handling, update payload shape, or customer display message semantics.

## P4 behavior that must be preserved

P4 moved order confirm/cancel inventory workflow to application services and kept order controller behavior stable.

P6 is frontend-only and must not change backend order workflow semantics.

## Target structure

Create or normalize this frontend module structure:

```txt
apps/pos-terminal-web/src/features/pos/
  pages/POSPage.tsx
  components/POSLayout.tsx
  components/ProductSection.tsx
  components/CartSection.tsx
  components/OrderQueueSection.tsx
  hooks/usePOSCartFlow.ts
  hooks/usePOSPaymentFlow.ts
  hooks/usePOSKitchenFlow.ts
  hooks/usePOSCustomerDisplayFlow.ts
  hooks/usePOSReceiptFlow.ts
  hooks/usePOSOfflineFlow.ts
  services/posOrderService.ts
  services/posPaymentService.ts
  services/posPrinterService.ts
  mappers/cartToOrderPayload.ts
  mappers/orderToCart.ts
  mappers/receiptPayloadMapper.ts
  index.ts
```

Equivalent names are acceptable if responsibilities remain clear.

Keep a compatibility wrapper if routing currently imports `apps/pos-terminal-web/src/pages/pos.tsx`. For example, `pages/pos.tsx` may re-export or render `features/pos/pages/POSPage` so existing routes stay stable.

## Extraction order

Do the refactor in this order:

1. Extract pure mappers first.
2. Extract API/client services second.
3. Extract feature hooks third.
4. Extract presentation components fourth.
5. Reduce `pages/pos.tsx` last.

Do not do a big-bang rewrite of the POS page.

## S1 — Feature folder structure

Create `apps/pos-terminal-web/src/features/pos` with clear subfolders:

```txt
pages/
components/
hooks/
services/
mappers/
```

Only move POS terminal feature code here. Do not move admin pages or unrelated frontend modules.

## S2 — Pure mappers first

Move pure logic into mapper files where possible:

```txt
cart to backend order payload
order to cart state
receipt payload mapping
CFD item/message mapping if currently embedded and safe to extract
```

Mapper rules:

```txt
- no React hooks
- no DOM APIs
- no network calls
- no mutation of external state
- deterministic input/output
```

## S3 — Side-effect flows

Move side effects into hooks/services:

```txt
payment dialog/confirm flow
cash/full payment flow
partial payment flow
offline submit flow
customer display / CFD update flow
KDS send/local kitchen ticket flow
receipt print queue and Bluetooth print flow
order queue invalidation/SSE handling
```

Hook/service rule:

```txt
hooks own React state/effects
services own API calls / external side effects
components own rendering
mappers own pure transformation
```

## S4 — Reduce page responsibility

Final page responsibilities:

```txt
- compose layout
- connect high-level hooks
- pass handlers/state to components
- no long embedded payment/KDS/CFD/printer/offline implementation blocks
```

The page may still coordinate high-level flows, but detailed implementation must live in hooks/services/components/mappers.

## Required behavior preservation

Preserve the current POS behavior for:

```txt
1. add product to cart
2. select variants/options
3. quantity changes
4. discounts if currently supported
5. full cash payment
6. standard payment/tender flow
7. partial payment flow if feature enabled
8. save draft / continue order
9. send to kitchen if feature enabled
10. local kitchen ticket behavior
11. order queue update/invalidation
12. offline submit/save/sync behavior
13. receipt printing and print queue behavior
14. customer display/CFD ordering, payment, and completed messages
15. tenant/outlet context usage
16. feature flag behavior
17. existing UI layout and responsive behavior unless explicitly documented
```

Do not change UX intentionally unless required to preserve existing behavior after extraction.

## Import rules

Frontend POS feature code may import frontend APIs/hooks/domain types/offline package as currently allowed.

Do not import backend infrastructure, Drizzle, server routes, Node-only modules, or DB schema directly into frontend code.

Avoid circular imports between `features/pos` and old `pages/pos.tsx`.

## Validation

Run:

```bash
pnpm --filter @pos/terminal-web type-check
pnpm --filter @pos/terminal-web build
pnpm type-check
```

If build/type-check has a pre-existing baseline issue, document it precisely. Do not hide it.

If the backend DB-backed `DATABASE_URL` test issue appears from workspace checks, document it as environment-limited and unrelated to P6. Do not delete or weaken that test.

## Manual smoke checklist

Add this checklist to the P6 roadmap execution notes and mark what was manually verified or not available:

```txt
1. load POS page
2. add product to cart
3. select variants/options
4. update quantity/remove item
5. full cash payment
6. partial payment if feature enabled
7. save draft / continue order
8. send to kitchen if feature enabled
9. order queue updates/invalidation
10. offline submit/save behavior
11. receipt print queue behavior
12. customer display ordering/payment/completed messages
13. responsive/mobile drawer behavior
```

## Required audits before commit

Confirm no backend or schema changes:

```bash
git diff -- apps/api packages/application packages/infrastructure shared/schema.ts
```

Expected for P6:

```txt
No backend application/infrastructure/schema changes, except documentation-only files if any.
```

Confirm POS page got smaller and responsibilities moved:

```bash
git diff --stat -- apps/pos-terminal-web/src/pages/pos.tsx apps/pos-terminal-web/src/features/pos
```

## Documentation update

Update:

```txt
roadmap/refactor/p6-s1-s4-frontend-pos-feature-split.md
```

Add execution notes with:

```md
## Execution notes — P6 S1-S4

Status: implemented and validated / implemented with documented baseline blocker / blocked

### Completed

- [x] Audited current POS page responsibilities.
- [x] Created `apps/pos-terminal-web/src/features/pos` structure.
- [x] Extracted pure mappers.
- [x] Extracted POS API/client services where appropriate.
- [x] Extracted payment/offline/KDS/CFD/receipt/order queue flows into hooks/services where appropriate.
- [x] Extracted presentation sections/components.
- [x] Kept `pages/pos.tsx` as page-level compatibility entry/orchestrator.
- [x] Did not change backend API, order workflows, payment backend, inventory, or DB schema.

### Validation

- `pnpm --filter @pos/terminal-web type-check`: pass/fail
- `pnpm --filter @pos/terminal-web build`: pass/fail
- `pnpm type-check`: pass/fail

### Manual smoke

- POS load: pass/fail/not run
- Add product to cart: pass/fail/not run
- Variants/options: pass/fail/not run
- Full cash payment: pass/fail/not run
- Partial payment: pass/fail/not run or not available
- Draft/continue order: pass/fail/not run
- KDS/send to kitchen: pass/fail/not run or not available
- Offline submit/save: pass/fail/not run
- Receipt print queue: pass/fail/not run
- Customer display/CFD messages: pass/fail/not run
- Responsive/mobile drawer: pass/fail/not run

### Behavior preservation

- POS UX intentionally changed: no
- Cash payment behavior changed: no
- Standard payment behavior changed: no
- Partial payment behavior changed: no
- Offline behavior changed: no
- KDS behavior changed: no
- Customer display/CFD behavior changed: no
- Receipt printer behavior changed: no
- Backend API changed: no
- DB schema changed: no
- P4 order workflow changed: no
- P5 CFD backend changed: no

### Continuation

P6 is complete. Next safe phase is P7 only after user approval.
```

## Commit

Use commit message:

```bash
git commit -m "refactor(pos): split POS frontend feature flows"
```

Then push the branch.

## If validation fails

Do not start P7.

Do not hide the failure.

Do not weaken existing behavior.

If a fix is needed, keep it inside P6 frontend feature split scope.

If there is a pre-existing baseline build/type-check issue, document exact command and error in the P6 roadmap.

## Final report required from agent

Report:

```txt
P6 status:
Commit SHA:
Files changed:
POS feature files added/moved:
pos.tsx final role:
Commands run:
Build/type-check result:
Manual smoke result:
Backend touched: no/yes with reason
DB schema changed: no
Cash/standard/partial payment preserved: yes/no
Offline/KDS/CFD/printer preserved: yes/no
P4 order workflows preserved: yes/no
P5 CFD backend preserved: yes/no
Whether P7 was started: no
```
