# P9.1 Centralized POS Payment Submission Report

Date: 2026-06-21
Source prompt: `roadmap/business-flows/P9.1 — Centralized POS Payment Submission`

## 1. Summary

P9.1 centralizes POS cashier payment submission in `pos-core` so Retail, Food & Beverage, Service, and Restaurant no longer own payment-flow normalization, line normalization, split-id filtering, or payment-row recording loops.

Implemented in this batch:

- Added `posPaymentSubmissionService` as the shared POS payment submission layer.
- Centralized normalization for legacy and canonical payment flow values.
- Centralized payment line normalization, max-line caps, cash change calculation, split UUID/session metadata handling, and user-safe payment error mapping.
- Refactored Retail and Restaurant business-flow hooks to delegate persistence to the shared layer.
- Verified Food & Beverage and Service inherit the shared Retail path through their existing base-flow composition.
- Added API-side defense so `create-and-pay` rejects `multi` and `split` instead of persisting one invalid row.
- Added focused shared-layer tests and included them in the terminal-web test script.

## 2. Root cause

P9 introduced payment-flow metadata and UI behavior, but payment submission rules still lived in business-flow hooks. Retail owned detail normalization, create-order-before-payment branching, payment-row loops, split UUID filtering, and submit result messages. Restaurant had a separate active-order loop with different split metadata naming.

That scattered ownership allowed runtime payload drift, including sending a `split` flow to a backend path that expected legacy values in one observed cashier error. Even when the backend had since been widened to accept canonical values, the architecture still allowed another flow hook to regress.

## 3. Why a retail-only patch was insufficient

Retail is only one business-flow adapter. Food & Beverage and Service compose the Retail hook, while Restaurant owns a different active-order payment path. A retail-only hotfix would not remove duplicated rules from Restaurant, would not create a single place to cap multi/split lines, and would not provide one place to map raw API validation into cashier-safe messages.

## 4. Shared payment submission design

The new shared service lives at:

- `apps/pos-terminal-web/src/features/pos-core/services/posPaymentSubmissionService.ts`

It exposes:

- `normalizePOSPaymentFlow`
- `normalizePOSPaymentLines`
- `submitPOSPayment`
- `toUserSafePaymentError`
- shared submission/result/input/dependency types

Dependency injection is explicit. Business-flow hooks pass `createOrder`, `recordPayment`, and optionally `createAndPay` functions, while the shared layer owns flow-specific submit rules.

## 5. Files changed

- `apps/pos-terminal-web/src/features/pos-core/services/posPaymentSubmissionService.ts`
- `apps/pos-terminal-web/src/features/pos-core/services/__tests__/posPaymentSubmissionService.test.ts`
- `apps/pos-terminal-web/src/features/pos-core/index.ts`
- `apps/pos-terminal-web/src/features/pos-flows/retail/useRetailStandardPOSFlow.ts`
- `apps/pos-terminal-web/src/features/pos-flows/restaurant/useRestaurantTableServicePOSFlow.ts`
- `apps/pos-terminal-web/package.json`
- `apps/pos-terminal-web/src/lib/api/hooks.ts`
- `apps/pos-terminal-web/src/hooks/api/useOrders.ts`
- `apps/api/src/http/controllers/OrdersController.ts`
- `roadmap/business-flows/P9.1 — Centralized POS Payment Submission`
- `roadmap/business-flows/main.md`
- `PLANS.md`

## 6. Flow-hook refactor summary

Retail now collects cart/order context, sends CFD/receipt side effects around the result, and delegates all payment persistence to `submitPOSPayment`.

Restaurant keeps restaurant-specific behavior: fresh-cart payment is still blocked in favor of kitchen/service flow, but active-order payment delegates to `submitPOSPayment`.

Food & Beverage and Service already compose `useRetailStandardPOSFlow`, so after Retail delegates to the shared service, those flows use the same centralized payment submission path.

## 7. Fresh cart behavior

| Flow | P9.1 behavior |
| --- | --- |
| Full | Uses `createAndPay` dependency with `payment_flow=full` and one payment row. |
| DP | Uses `createAndPay` dependency with `payment_flow=dp`, one down-payment row, and partial result messaging when below total. |
| Multi | Uses `createOrder` first, then records up to two `payment_flow=multi` / `payment_kind=multi_line` rows. Never uses create-and-pay. |
| Split | Uses `createOrder` first, then records up to four `payment_flow=split` / `payment_kind=split_line` rows. Never uses create-and-pay. |

## 8. Saved / active order behavior

| Flow | P9.1 behavior |
| --- | --- |
| Full | Calls `recordPayment` once with `payment_flow=full` and `payment_kind=full_payment`. |
| DP | Calls `recordPayment` once with `payment_flow=dp`; kind is `down_payment` or `remaining_payment` based on submitted amount versus total context. |
| Multi | Calls `recordPayment` once per normalized line, capped at two lines, without create-and-pay. |
| Split | Calls `recordPayment` once per normalized split line, capped at four lines, without create-and-pay. |

## 9. API payload normalization matrix

| UI / legacy input | Shared normalized flow | Endpoint behavior |
| --- | --- | --- |
| `full_payment` | `full` | Create-and-pay allowed for fresh cart; record-payment for saved/active order. |
| `partial_payment_dp` | `dp` | Create-and-pay allowed for fresh cart; record-payment for saved/active order. |
| `full` | `full` | Same as above. |
| `dp` | `dp` | Same as above. |
| `multi` | `multi` | Fresh cart creates order first, then record-payment rows. Backend create-and-pay now rejects this flow defensively. |
| `split` | `split` | Fresh cart creates order first, then record-payment rows. Backend create-and-pay now rejects this flow defensively. |
| missing flow | `full`, unless `partialAmount` implies `dp` | Shared defaulting only. |

Payment methods remain compatible with the current backend enum (`cash`, `card`, `ewallet`, `other`). Existing cashier-facing manual transfer/QRIS mapping from P9 is preserved.

## 10. User-facing copy cleanup

The shared layer maps raw enum/Zod validation-like errors to:

> Pembayaran gagal dicatat. Silakan coba lagi.

Runtime source grep found no cashier source copy containing internal phase/dev terms or the raw legacy enum phrase after cleanup.

## 11. Tests added / updated

Added:

- `apps/pos-terminal-web/src/features/pos-core/services/__tests__/posPaymentSubmissionService.test.ts`

Updated:

- `apps/pos-terminal-web/package.json` test script now runs the new shared submission suite.

The new suite covers:

- legacy flow normalization;
- canonical flow normalization;
- fresh full/DP create-and-pay path;
- fresh multi/split create-order then record-payment rows;
- saved multi/split avoiding create-and-pay;
- multi and split caps;
- non-UUID split id into metadata only;
- user-safe technical error mapping.

## 12. Validation output

- `pnpm --filter @pos/terminal-web type-check` — pass
- `pnpm --filter @pos/terminal-web test` — pass
- `pnpm --filter @pos/application type-check` — pass
- `pnpm --filter @pos/application test` — pass
- `pnpm --filter @pos/api type-check` — pass
- `pnpm --filter @pos/api test` — pass, 181 tests
- `pnpm type-check` — pass, 10/10 Turbo tasks

## 13. Grep cleanup findings

Command:

```bash
rg -n "handlePaymentMethodConfirm|recordPaymentLines|normalizePaymentDetails|payment_flow: details.flow|recordPaymentMutation\.mutateAsync" apps/pos-terminal-web/src/features/pos-flows || true
```

Findings:

- `recordPaymentLines`, `normalizePaymentDetails`, `payment_flow: details.flow`, and direct `recordPaymentMutation.mutateAsync` loops are gone from business-flow hooks.
- `handlePaymentMethodConfirm` remains as the UI event handler name and delegates to shared submission.
- `recordPaymentMutation.mutateAsync` appears only as a dependency function reference, not as an in-hook payment row loop.

Command:

```bash
rg -n "create-and-pay.*payment_flow.*split|create-and-pay.*payment_flow.*multi|payment_flow.*split|payment_flow.*multi" apps/pos-terminal-web/src apps/api/src || true
```

Findings:

- Matches are enum/type/test declarations and allowed API validation values.
- No frontend fresh-cart create-and-pay path sends `multi` or `split`.
- Backend now rejects `multi`/`split` in create-and-pay before the use case executes.

Command:

```bash
rg -n "P9|P9.1|roadmap|persisten aman|Invalid enum value|full_payment \| partial_payment_dp" apps/pos-terminal-web/src || true
```

Result: no matches.

Command:

```bash
rg -n "orders_queue.*full payment|orders_queue.*recordPayment|recordPayment.*orders_queue|restaurant_table_service.*businessType|businessType.*restaurant_table_service|GenericPOSPage|features/pos/services|features/pos/mappers" apps packages shared || true
```

Result: no matches.

## 14. Remaining limitations

- Fresh-cart multi/split is centralized but still not backend-atomic across order creation plus multiple payment rows; if a later row fails, the order can exist with partial payment state. This is safer than a fake single-row multi/split settlement, but a future backend use case should make it atomic.
- Split table lifecycle remains shallow. The shared layer correctly avoids sending UI-only split IDs as UUIDs and stores them in metadata, but a dedicated split context API is still needed for durable `order_bill_splits` lifecycle updates.
- `PaymentMethodDialog` still uses `// @ts-nocheck` and an effectively fourth `paymentDetails` callback argument. The shared service now formalizes the shape downstream, but a future UI cleanup should type the dialog props directly.

## 15. Next recommended phase

P9.2 should add an atomic backend use case for `create order + multiple payment rows`, plus dedicated tenant-aware split context APIs that create/list/update `order_bill_splits` and update split status in the same transaction as split payment rows.
