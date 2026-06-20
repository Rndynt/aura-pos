# Replit/Codex Prompt P4 — Retail Standard POS Adapter

Repository: `Rndynt/AuraPoS`

## Goal

Implement the first business-flow adapter: `retail_standard`.

P4 must create a safe retail POS runtime path that consumes the reusable `pos-core` modules extracted in P3 and applies the retail-standard flow rules from the P1 SOT.

Retail standard means:

```txt
Cart -> Bayar -> paid/completed -> clear cart -> receipt
```

Retail standard must not behave like restaurant/open-order/kitchen/pay-later flow.

This phase must preserve all P2/P2.1 lifecycle protections and P3 pos-core extraction boundaries.

## Phase dependencies

Read these first:

```txt
roadmap/business-flows/main.md
roadmap/business-flows/P0_current_pos_flow_audit.md
roadmap/business-flows/P1_business_flow_sot_report.md
roadmap/business-flows/P2_pos_lifecycle_runtime_fix_report.md
roadmap/business-flows/P2_1_lifecycle_hardening_patch_report.md
roadmap/business-flows/P3_pos_core_extraction_report.md
packages/domain/business-flows/**
packages/application/business-flows/**
apps/pos-terminal-web/src/features/pos-core/**
apps/pos-terminal-web/src/features/pos/pages/POSPage.tsx
```

## Non-negotiable scope boundary

Allowed in P4:

```txt
- Create a retail-standard POS flow adapter/component using pos-core.
- Add a minimal business-profile resolver for the POS page if reliable profile data already exists.
- Route only retail_standard tenants through the retail adapter if safe.
- Keep all non-retail/unknown profiles on the current generic POS runtime.
- Hide restaurant/table/kitchen/pay-later UI from retail_standard flow.
- Enforce retail cart -> payment -> paid/closed behavior.
- Keep server/local draft behavior only if explicit and retail-safe.
- Add retail-specific tests and report.
```

Forbidden in P4:

```txt
- Do not implement restaurant_table_service adapter yet.
- Do not implement cafe_counter/quick_service adapter yet.
- Do not implement service_business_later.
- Do not remove the current generic POS fallback.
- Do not rewrite backend payment engine.
- Do not introduce schema/migration unless absolutely unavoidable.
- Do not hardcode plan names.
- Do not make orders_queue required for payment lifecycle.
- Do not expose kitchen/table/pay-later behaviors in retail_standard.
- Do not break offline/local draft behavior.
- Do not remove P2/P2.1 backend edit locks.
```

P4 is a targeted retail adapter, not a full business-flow routing system.

## Retail-standard rules

For `retail_standard`, these must be true:

```txt
1. Fresh cart payment uses core create-and-pay/offline submit path.
2. Successful full payment clears cart and does not reappear as Draft Server/Pesanan Aktif.
3. Retail does not show Send to Kitchen.
4. Retail does not show Kitchen Queue/KDS-specific UI.
5. Retail does not show table-service flow as default.
6. Retail does not show pay-later active order as default.
7. Retail does not require orders_queue for payment.
8. Retail server draft is optional and explicit, not accidental after payment.
9. Retail local draft remains offline/local only and safe.
10. Retail active-order section should be hidden or empty unless legacy data exists; it must not become normal retail workflow.
```

## Required target structure

Create retail flow files under:

```txt
apps/pos-terminal-web/src/features/pos-flows/retail/
  RetailStandardPOSFlow.tsx
  useRetailStandardPOSFlow.ts
  retailStandardFlowPolicy.ts
  index.ts
```

If `pos-flows` folder does not exist, create it.

Optional shared flow root if needed:

```txt
apps/pos-terminal-web/src/features/pos-flows/root/
  POSFlowRoot.tsx
  useResolvedPOSBusinessProfile.ts
```

Only add root routing if it is safe and minimal. Otherwise leave a clear TODO and keep `RetailStandardPOSFlow` exported/ready.

## Required integration strategy

### Preferred safe approach

Use current POS route/page as root orchestrator and introduce a profile gate:

```txt
if businessProfile === 'retail_standard': render RetailStandardPOSFlow
else: render current generic POSPage behavior
```

But only do this if tenant business profile is reliably available from existing tenant profile/context/API.

If business profile is not reliable yet:

```txt
- Implement RetailStandardPOSFlow and tests.
- Do not route production traffic to it by default.
- Add report section explaining missing businessProfile source and exact next patch needed.
```

Do not guess profile from plan tier.

Do not infer retail from subscription plan name.

Do not infer retail by absence of kitchen entitlement.

Profile must come from explicit business profile/type data or documented fallback.

## RetailStandardPOSFlow responsibilities

The retail adapter should compose pos-core modules and only own retail flow decisions.

It may use:

```txt
@/features/pos-core/components/*
@/features/pos-core/hooks/*
@/features/pos-core/services/*
@/features/pos-core/mappers/*
@/features/pos-core
```

It should not duplicate:

```txt
cart payload mapping
receipt payload mapping
CFD payload mapping
printer logic
active payment amount calculation
order lifecycle classification
stock guard
offline submit logic
```

Those must stay in `pos-core`.

## Retail UI behavior

### Must show

```txt
Product grid
Cart panel
Payment dialog
Receipt behavior
Local draft support if existing retail UI already supports it
Optional explicit server draft only if existing feature is retained safely
```

### Must not show by default

```txt
Send to Kitchen
Kitchen ticket button
KDS/kitchen queue
Restaurant table-service controls
Pay-later active order as primary workflow
Active order queue as normal retail workflow
Split-by-table/service restaurant behavior
```

### Draft behavior

Retail draft behavior is allowed only as explicit draft:

```txt
Cart -> Simpan Draft -> Draft Server -> Lanjut -> Bayar -> paid/closed
```

Do not allow:

```txt
Paid retail order -> Draft Server
Paid retail order -> Pesanan Aktif
Retail checkout -> accidental unpaid active order
```

If server draft is retained in retail adapter, it must use lifecycle DTO fields from P2.1 and must not classify by `paymentStatus !== paid`.

## Payment behavior

### Fresh full payment

Retail fresh payment must remain:

```txt
Cart -> Payment dialog -> create-and-pay/offline submit -> paid/completed enough for POS -> cart clear -> receipt/CFD update
```

Required proof:

```txt
- The resulting paid order is excluded from Draft Server/Pesanan Aktif.
- Payment mutation does not require orders_queue.
- No kitchen/table requirement is introduced.
```

### Continued retail draft payment

Retail continued server draft payment must remain P2 behavior:

```txt
Draft Server -> Lanjut -> cart edit -> Bayar -> update draft -> record payment -> clear cart -> removed from Draft Server
```

### Active order payment

Retail adapter should not create new active pay-later order flow.

If legacy active unpaid orders exist and appear from server:

```txt
- show only safe payment/detail actions if required for data recovery
- do not allow edit/delete through retail cart
- do not promote it as primary retail workflow
```

## Retail business profile and SOT usage

Use P1 constants where possible:

```txt
business profile: retail_standard
actions:
- CREATE_AND_PAY
- SAVE_DRAFT
- CONTINUE_DRAFT
- UPDATE_DRAFT_ITEMS
- CANCEL_DRAFT
- VIEW_DRAFT
- VIEW_LOCAL_DRAFT
- DELETE_LOCAL_DRAFT
- REFUND_PAYMENT metadata only
- VOID_PAYMENT metadata only
```

Do not add retail-specific ad-hoc action strings.

## Entitlement behavior

Retail-standard payment must not require:

```txt
orders_queue
restaurant_kitchen_ops
restaurant table feature
KDS entitlement
```

Retail may still honor existing payment add-ons:

```txt
payments_partial_payment only if UI exposes DP/partial in retail, otherwise hide it
payments_multi_payment if existing PaymentMethodDialog supports it and entitlement active
payments_split_bill/payments_split_payment should not expose restaurant split table behavior by default
```

For P4, safest rule:

```txt
Retail full payment is always available through core POS auth/RBAC.
Retail DP/partial/split behavior is not made primary unless already safely supported by PaymentMethodDialog and entitlement.
```

## Required code changes

### 1. Create retail flow adapter

Create:

```txt
apps/pos-terminal-web/src/features/pos-flows/retail/RetailStandardPOSFlow.tsx
apps/pos-terminal-web/src/features/pos-flows/retail/useRetailStandardPOSFlow.ts
apps/pos-terminal-web/src/features/pos-flows/retail/retailStandardFlowPolicy.ts
apps/pos-terminal-web/src/features/pos-flows/retail/index.ts
```

The hook should assemble retail-safe state/actions from pos-core and current API hooks.

The component should compose existing layout/core components, not duplicate UI logic.

### 2. Add retail policy helper

`retailStandardFlowPolicy.ts` should define retail-specific booleans:

```txt
showKitchenActions = false
showTableServiceActions = false
showActiveOrderQueueByDefault = false
allowFreshCreateAndPay = true
allowServerDraft = true if existing draft behavior is retained
allowLocalDraft = true
allowPayLaterActiveOrderCreation = false
```

If this overlaps with P1 SOT, use P1 action/profile constants instead of duplicate strings.

### 3. POS route integration

Patch current POS route/page carefully.

Option A if businessProfile reliable:

```txt
POSPage or POSFlowRoot resolves businessProfile.
retail_standard -> RetailStandardPOSFlow.
unknown/non-retail -> current generic POS behavior.
```

Option B if not reliable:

```txt
Export RetailStandardPOSFlow and leave current POSPage generic path unchanged.
Document exact missing profile source in report.
```

Do not force all tenants into retail flow.

### 4. Hide retail-incompatible UI

Within retail flow:

```txt
- no Send to Kitchen button
- no kitchen ticket creation path
- no table-service status queue as default
- no active kitchen actions
```

This can be done by not rendering controls or by passing retail policy to core wrappers.

### 5. Keep lifecycle protections

Retail adapter must still use:

```txt
server lifecycle DTO fields
isEditableDraft
isActiveOrder
isKitchenLocked
allowedActions
remaining amount resolver
backend edit locks
```

Do not reintroduce old `paymentStatus !== paid` draft filtering.

## Tests required

Add tests where existing harness supports it.

### Pure policy tests

```txt
retailStandardFlowPolicy:
- showKitchenActions false
- showTableServiceActions false
- allowFreshCreateAndPay true
- allowPayLaterActiveOrderCreation false
- allowLocalDraft true
- server draft behavior explicit
```

### Hook/service tests if feasible

```txt
Retail flow:
- full payment path uses create-and-pay/offline submit, not create server open order
- retail profile does not request kitchen action
- retail active legacy order can pay/detail but not edit/delete
```

### Component tests if harness exists

```txt
RetailStandardPOSFlow:
- does not render Send to Kitchen
- does not render Kitchen Queue/KDS controls
- renders product/cart/payment core sections
- renders draft lifecycle sheet only for drafts/local drafts
```

If component harness does not exist, document manual verification and add pure policy tests at minimum.

## Manual smoke checklist

Document in P4 report:

```txt
1. Retail fresh payment:
   Product -> Cart -> Bayar -> payment success -> cart clear -> receipt/CFD works -> not in Draft Server/Pesanan Aktif.

2. Retail server draft:
   Cart -> Simpan Draft -> Draft Server -> Lanjut -> Bayar -> paid -> removed from Draft Server.

3. Retail local draft:
   Offline/local draft -> Lanjut -> Cart -> Bayar/delete local still works.

4. Retail incompatible controls:
   Retail flow does not show Send to Kitchen, KDS, kitchen queue, table service controls, or pay-later active creation.

5. Legacy active unpaid order:
   If present, it cannot be edited/deleted through retail cart; payment/detail only.

6. Entitlement check:
   Payment works without orders_queue and without restaurant_kitchen_ops.
```

Run browser smoke if environment supports it. If not, clearly state not run.

## Validation commands

Run relevant commands:

```bash
pnpm --filter @pos/terminal-web test
pnpm --filter @pos/domain type-check
pnpm --filter @pos/application type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/terminal-web type-check
pnpm --filter @pos/application test
pnpm --filter @pos/api test
pnpm type-check
```

If some scripts differ, run the closest available commands and document exact output.

## Required report

Create:

```txt
roadmap/business-flows/P4_retail_standard_adapter_report.md
```

Report must include:

```txt
1. Summary
2. Files changed
3. Retail adapter structure
4. Business profile routing decision
5. Retail UI behavior matrix
6. Retail payment behavior proof
7. Draft/local draft behavior proof
8. Entitlement behavior proof
9. Tests and validation output
10. Manual smoke result or not-run statement
11. Remaining risks deferred to P5/P6/P7
12. Recommended next phase
```

## Completion checklist

- [x] RetailStandardPOSFlow created.
- [x] useRetailStandardPOSFlow created.
- [x] retailStandardFlowPolicy created.
- [x] Retail flow consumes pos-core modules, not duplicated core logic.
- [x] Retail flow hides kitchen/table/pay-later default controls.
- [x] Fresh retail payment stays create-and-pay/offline submit.
- [x] Retail paid orders do not appear in Draft Server/Pesanan Aktif.
- [x] Retail server draft remains explicit and safe.
- [x] Retail active/kitchen legacy rows cannot edit/delete through cart.
- [x] Payment does not require orders_queue.
- [ ] Unknown/non-retail profiles remain on current generic POS fallback. Partial: retail adapter is exported but not routed because explicit reliable `businessProfile` source is not yet available; existing generic POS remains current production route.
- [x] No schema/migration change.
- [x] No backend payment behavior change.
- [x] Tests/validation documented.
- [x] P4 report created.

## Commit

```txt
feat(pos): add retail standard POS flow adapter
```
