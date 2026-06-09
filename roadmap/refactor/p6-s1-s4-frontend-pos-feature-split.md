# P6 S1-S4 — Frontend POS Feature Split

Status: planned
Purpose: reduce `POSPage` responsibility and split POS frontend flow by feature.

## Goal

`apps/pos-terminal-web/src/pages/pos.tsx` should become a page-level UI orchestrator, not the owner of payment, KDS, CFD, printer, receipt, offline, and queue workflows.

## S1 — Create feature folder structure

Target structure:

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
```

Names may be adjusted, but responsibility separation must remain clear.

## S2 — Extract pure mappers first

Move safe pure logic first:

- cart to backend order payload
- order to cart state
- receipt payload mapping
- CFD item mapping if appropriate

Pure mappers must not call React hooks.

## S3 — Extract side-effect flows

Move side effects into hooks/services:

- payment dialog/confirm flow
- partial payment flow
- offline submit flow
- customer display updates
- KDS send/local kitchen ticket flow
- receipt print queue and Bluetooth print flow
- order queue SSE invalidation

## S4 — Reduce page responsibility

Final page responsibilities:

- compose layout
- connect high-level hooks
- pass handlers to components
- no direct long payment/KDS/CFD/printer/offline implementation blocks

## Hard rules

- Do not change POS UX behavior unless explicitly documented.
- Do not remove cash payment support.
- Do not remove partial payment support.
- Do not break offline order save/sync behavior.
- Do not break customer display messages.
- Do not break KDS/local kitchen ticket behavior.
- Do not move backend-specific infrastructure into frontend features.

## Validation commands

```bash
pnpm --filter @pos/terminal-web type-check
pnpm --filter @pos/terminal-web build
pnpm type-check
```

Manual smoke checklist:

```txt
1. add product to cart
2. select variants/options
3. full cash payment
4. partial payment if feature enabled
5. save draft/continue order
6. send to kitchen if feature enabled
7. offline submit behavior
8. receipt print queue behavior
9. customer display ordering/payment/completed messages
```

## Definition of done

- POS page is substantially smaller.
- Payment/KDS/CFD/printer/offline concerns are separated.
- UI behavior remains stable.
- Type-check and build pass or baseline failures are documented.

## Execution notes — P6 S1-S4

Status: implemented and validated

### Completed

- [x] Audited current POS page responsibilities.
- [x] Created `apps/pos-terminal-web/src/features/pos` structure.
- [x] Extracted pure mappers for order payload, order/cart helpers, receipt payload, CFD payloads, and kitchen-ticket item payloads.
- [x] Extracted POS API/client services for order fetch/status update, partial payment recording, and receipt print queue/Bluetooth print side effects.
- [x] Extracted customer display, order queue SSE invalidation, responsive drawer behavior, and feature-flow hook entry points under `features/pos/hooks`.
- [x] Extracted presentation sections/components for POS layout, product section, cart/mobile cart section, and order queue wrapper.
- [x] Kept `apps/pos-terminal-web/src/pages/pos.tsx` as a compatibility route entry that renders `features/pos/pages/POSPage`.
- [x] Did not change backend API, order workflows, payment backend, inventory, or DB schema.

### Validation

- `pnpm --filter @pos/terminal-web type-check`: pass
- `pnpm --filter @pos/terminal-web build`: pass with existing Vite/PostCSS/chunk-size warnings
- `pnpm type-check`: pass
- `git diff -- apps/api packages/application packages/infrastructure shared/schema.ts`: pass, no backend/application/infrastructure/schema diff
- `git diff --stat -- apps/pos-terminal-web/src/pages/pos.tsx apps/pos-terminal-web/src/features/pos`: pass, POS route entry reduced and POS feature files added

### Manual smoke

- POS load: not run (non-interactive environment)
- Add product to cart: not run (non-interactive environment)
- Variants/options: not run (non-interactive environment)
- Update quantity/remove item: not run (non-interactive environment)
- Full cash payment: not run (non-interactive environment)
- Partial payment: not run (non-interactive environment)
- Draft/continue order: not run (non-interactive environment)
- KDS/send to kitchen: not run (non-interactive environment)
- Order queue updates/invalidation: not run manually; type-check/build validated extracted SSE hook
- Offline submit/save: not run manually; type-check/build validated preserved offline submit/save imports and local queue calls
- Receipt print queue: not run manually; type-check/build validated extracted print service usage
- Customer display/CFD messages: not run manually; type-check/build validated preserved CFD payload paths and message types
- Responsive/mobile drawer: not run (non-interactive environment)

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

P6 S1-S4 is complete for this batch. Next safe phase is P7 only after user approval.
