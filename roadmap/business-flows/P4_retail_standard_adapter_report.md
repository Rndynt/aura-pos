# P4 Retail Standard POS Adapter Report

Date: 2026-06-20
Scope source: `roadmap/business-flows/replit_codex_P4_retail_standard_adapter_prompt.md`

## 1. Summary

P4 created the first retail-standard POS flow adapter under `apps/pos-terminal-web/src/features/pos-flows/retail`.

The adapter is intentionally retail-safe:

- product grid + cart + payment dialog remain available;
- fresh full payment continues through the POS core create-and-pay/offline submit path;
- server draft remains explicit through `Simpan Draft -> Draft Server -> Lanjut -> Bayar`;
- local draft resume remains local/offline-safe;
- kitchen actions, table-service controls, split-by-table behavior, pay-later creation, and active order queue display are disabled by policy/default composition;
- legacy active unpaid orders can still be paid/detail-viewed through the lifecycle sheet path, but they are not loaded into the editable retail cart.

Production POS routing was **not enabled by default** in this batch. The current codebase has tenant/business-type data, but the POS runtime does not yet expose a reliable explicit `businessProfile === "retail_standard"` source. P4 forbids guessing from plan names, absence of kitchen entitlement, or ad-hoc frontend inference. Therefore the adapter is exported and tested, while the existing generic POS route remains the fallback for all live traffic until the explicit profile resolver/API contract is added.

## 2. Files changed

- `apps/pos-terminal-web/src/features/pos-flows/retail/RetailStandardPOSFlow.tsx` — retail adapter component composing existing POS layout, product/cart sections, lifecycle sheet, product options, and POS core payment dialog.
- `apps/pos-terminal-web/src/features/pos-flows/retail/useRetailStandardPOSFlow.ts` — retail-specific orchestration hook using POS core mappers/controllers and existing API hooks without kitchen/table/pay-later creation paths.
- `apps/pos-terminal-web/src/features/pos-flows/retail/retailStandardFlowPolicy.ts` — retail flow policy booleans and supported/blocked action lists.
- `apps/pos-terminal-web/src/features/pos-flows/retail/index.ts` — public retail flow exports.
- `apps/pos-terminal-web/src/features/pos-flows/retail/__tests__/retailStandardFlowPolicy.test.ts` — pure policy tests.
- `apps/pos-terminal-web/package.json` — includes the retail policy test in the terminal web test script.
- `apps/pos-terminal-web/src/features/pos/pages/POSPage.tsx` — repaired duplicate declarations found during P4 validation so the existing generic fallback continues to type-check.
- `PLANS.md` — records this execution batch.
- `roadmap/business-flows/replit_codex_P4_retail_standard_adapter_prompt.md` — completion checklist updated honestly.
- `roadmap/business-flows/P4_retail_standard_adapter_report.md` — this report.

## 3. Retail adapter structure

Created target structure:

```txt
apps/pos-terminal-web/src/features/pos-flows/retail/
  RetailStandardPOSFlow.tsx
  useRetailStandardPOSFlow.ts
  retailStandardFlowPolicy.ts
  index.ts
  __tests__/retailStandardFlowPolicy.test.ts
```

The adapter consumes POS core modules for:

- cart-to-order payload mapping;
- payment/receipt/CFD payload mapping;
- order lifecycle checks (`isTrueServerDraft`);
- POS offline submit/create-and-pay path;
- receipt queue/print orchestration;
- customer display controller;
- stock guard;
- active legacy order payment amount setup.

It does not add schema, migrations, backend payment behavior, or a new backend route.

## 4. Business profile routing decision

Routing decision: **adapter exported, not routed to production by default**.

Reason:

- Existing registration and tenant data use business-type codes such as `RETAIL_MINIMARKET`.
- P1/P4 target runtime routing expects business-flow profile IDs such as `retail_standard`.
- The POS page currently does not have a reliable explicit `businessProfile` field from an API/context contract.
- P4 explicitly forbids guessing profile from plan tier, missing kitchen entitlement, or undocumented inference.

Exact next patch needed:

1. Add a backend/API or tenant-profile response field that explicitly returns the business-flow profile, for example `businessProfile: "retail_standard"`.
2. Document the canonical mapping/source in business-flow docs.
3. Add a minimal POS root gate:

```txt
if businessProfile === "retail_standard" render RetailStandardPOSFlow
else render current generic POSPage behavior
```

Unknown and non-retail tenants must continue to use the generic POS fallback.

## 5. Retail UI behavior matrix

| UI/behavior | P4 retail adapter status | Proof |
| --- | --- | --- |
| Product grid | Shown | Uses existing `ProductSection` with products and add-to-cart action. |
| Cart panel | Shown | Uses existing `CartSection`/`MobileCartSection` with retail cart props. |
| Payment dialog | Shown | Uses `POSPaymentDialog`. |
| Receipt behavior | Preserved | Uses POS core receipt payload and queue/print controller. |
| Local draft support | Preserved | Uses offline local draft resume helper. |
| Explicit server draft | Preserved | Save draft uses create/update order only from explicit button. |
| Send to Kitchen | Hidden/disabled | Retail policy `showKitchenActions=false`; cart props pass `hasKitchen=false` and no kitchen handler. |
| Kitchen ticket button | Hidden/disabled | Same as above. |
| KDS/kitchen queue | Hidden by default | Product section receives no orders/status handler. |
| Table-service controls | Hidden | Retail cart props omit table setter/table number; policy disables table-service actions. |
| Pay-later active order creation | Disabled | No retail handler creates unpaid active pay-later orders. |
| Active order queue as normal workflow | Hidden by default | Product section receives empty order list. |
| Legacy active order recovery | Payment/detail only through lifecycle sheet | Adapter wires `onPayActiveOrder` but does not load active rows into editable cart. |

## 6. Retail payment behavior proof

Fresh retail full payment stays:

```txt
Cart -> Payment dialog -> usePOSOfflineSubmit -> create-and-pay/offline submit -> paid enough for POS -> cart clear -> receipt/CFD
```

The adapter:

- calls `submitOrder` from `usePOSOfflineSubmit` for fresh full payments;
- does not call `useCreateOrder` in the fresh payment path;
- does not call kitchen ticket creation;
- does not require `orders_queue`;
- clears cart and closes payment/mobile state on success;
- queues receipt payload through POS core receipt controller.

Continued server draft payment stays:

```txt
Draft Server -> Lanjut -> cart edit -> update draft -> record payment -> clear cart -> /pos
```

The adapter verifies continued rows with `isTrueServerDraft` before loading them to cart. Non-draft active/kitchen rows are rejected from the editable cart path.

## 7. Draft/local draft behavior proof

Server draft behavior is explicit:

- only the `Simpan Draft` button calls create/update order without payment;
- paid fresh checkout does not create a separate draft order path;
- continued server draft payment updates then records payment and clears cart.

Local draft behavior remains local/offline-safe:

- network failure during save draft can save through `saveLocalDraftOrder`;
- local draft resume loads local items into the cart;
- local draft behavior does not create server pay-later workflow by itself.

## 8. Entitlement behavior proof

Retail full payment does **not** require these entitlements:

- `orders_queue`
- `restaurant_kitchen_ops`
- restaurant table-service feature/KDS entitlement

Retail adapter-specific settings:

- `hasPartialPayment = false` for P4 safety, so DP/partial is not primary retail behavior.
- `hasSplitBill = false`, so restaurant split behavior is not exposed by default.
- `hasMultiPayment` can still follow existing `payments_multi_payment` support in the core payment dialog.
- Customer display/receipt behavior can use existing feature checks without deciding the retail workflow.

## 9. Tests and validation output

Automated checks run in this batch:

```bash
pnpm --filter @pos/terminal-web test
pnpm --filter @pos/terminal-web type-check
```

Results:

- `pnpm --filter @pos/terminal-web test`: passed.
- `pnpm --filter @pos/terminal-web type-check`: passed.
- `pnpm --filter @pos/domain type-check`: passed.
- `pnpm --filter @pos/application type-check`: passed.
- `pnpm --filter @pos/api type-check`: passed.
- `pnpm --filter @pos/application test`: passed.
- `pnpm --filter @pos/api test`: passed.
- `pnpm type-check`: passed.

The test command now covers:

- POS payment amount service tests;
- POS lifecycle service tests;
- retail standard flow policy tests.

Additional prompt-required validation was also run and passed:

```bash
pnpm --filter @pos/domain type-check
pnpm --filter @pos/application type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/application test
pnpm --filter @pos/api test
pnpm type-check
```

## 10. Manual smoke result

Browser/manual smoke was **not run** in this terminal-only batch.

Manual smoke checklist to execute in browser after route gating is enabled or by mounting the retail adapter in a test route:

1. Retail fresh payment: Product -> Cart -> Bayar -> payment success -> cart clear -> receipt/CFD works -> not in Draft Server/Pesanan Aktif.
2. Retail server draft: Cart -> Simpan Draft -> Draft Server -> Lanjut -> Bayar -> paid -> removed from Draft Server.
3. Retail local draft: Offline/local draft -> Lanjut -> Cart -> Bayar/delete local still works.
4. Retail incompatible controls: no Send to Kitchen, KDS, kitchen queue, table service controls, pay-later active creation, or split-by-table controls.
5. Legacy active unpaid order: cannot be edited/deleted through retail cart; payment/detail only.
6. Entitlement check: full payment works without `orders_queue` and without `restaurant_kitchen_ops`.

## 11. Remaining risks deferred to P5/P6/P7

- Explicit business-flow profile source is still missing from the POS runtime, so route gating is deferred.
- Component/browser test harness is not configured for retail adapter UI assertions.
- The lifecycle sheet is reused for legacy active-order recovery; future phases may split draft-only vs recovery-only retail sheets for a cleaner UX.
- `RETAIL_MINIMARKET` to `retail_standard` mapping should be centralized server-side or in a documented application policy, not ad-hoc inside the frontend route.
- Future phases should define adapters for restaurant/cafe/quick-service without weakening P2/P2.1 lifecycle locks.

## 12. Recommended next phase

Recommended next phase: **business profile resolver + safe POS flow root gate**.

Deliverables:

1. Add explicit `businessProfile` to tenant/profile API output.
2. Document and test the canonical business type -> business-flow profile mapping.
3. Add `POSFlowRoot` or minimal POSPage gate.
4. Route only `retail_standard` to `RetailStandardPOSFlow`; keep unknown/non-retail on generic POS.
5. Run browser smoke and full validation suite.

## Completion checklist

- [x] RetailStandardPOSFlow created.
- [x] useRetailStandardPOSFlow created.
- [x] retailStandardFlowPolicy created.
- [x] Retail flow consumes pos-core modules, not duplicated core logic.
- [x] Retail flow hides kitchen/table/pay-later default controls.
- [x] Fresh retail payment stays create-and-pay/offline submit.
- [x] Retail paid orders do not appear in Draft Server/Pesanan Aktif via P2.1 lifecycle filtering; P4 does not reintroduce unpaid filtering.
- [x] Retail server draft remains explicit and safe.
- [x] Retail active/kitchen legacy rows cannot edit/delete through cart.
- [x] Payment does not require orders_queue.
- [ ] Unknown/non-retail profiles remain on current generic POS fallback by default because retail adapter is not routed yet; explicit profile gate still required.
- [x] No schema/migration change.
- [x] No backend payment behavior change.
- [x] Tests/validation documented.
- [x] P4 report created.
