# Backend SubmitPOSPayment Report

## 1. Summary

Implemented the backend-owned POS payment submission path around `SubmitPOSPayment`, the Drizzle transactional repository, and `POST /api/pos/payments/submit`. This batch also completed the interrupted Replit work by removing the old alias set, correcting migration filenames to project-style descriptive names, routing POS payment submission through the canonical backend endpoint, adding application/frontend tests, and documenting the remaining validation limitations honestly.

## 2. Root Cause Fixed

- Fresh-cart multi/split payment could still be sequenced by the frontend as create order first and then payment rows. The frontend core service now emits one canonical command to the backend submit endpoint.
- Invalid `order_type_id` could reach an order insert and show a database FK error. SubmitPOSPayment now validates order type before repository insertion through the order type port.
- Split bill frontend metadata was not sent as a backend-owned split lifecycle command. The frontend command now carries split bills with `clientBillId`, `splitNo`, `amountDue`, `amountPaid`, and status.
- Existing Replit changes included a hardcoded old alias set. It was removed; validation now accepts only canonical values and returns user-safe errors.

## 3. Backend SubmitPOSPayment Architecture

- `packages/application/payments/SubmitPOSPayment.ts` validates canonical payment method/flow values, required source/order fields, line counts, amounts, and order type through a port.
- `packages/application/payments/ports/SubmitPOSPaymentRepositoryPort.ts` keeps application orchestration independent from Drizzle.
- `packages/infrastructure/repositories/payments/DrizzleSubmitPOSPaymentRepository.ts` owns the single transaction for order creation/reuse, split persistence, payment rows, and parent order paid status updates.
- `apps/api/src/http/controllers/POSPaymentController.ts` handles HTTP DTO validation, entitlement checks, user-safe error mapping, and delegates to the use case.

## 4. API Endpoint and DTO

- Canonical endpoint: `POST /api/pos/payments/submit`.
- DTO values are canonical only:
  - Methods: `CASH`, `MANUAL_TRANSFER`, `MANUAL_QRIS`.
  - Flows: `FULL`, `DOWN_PAYMENT`, `MULTI_PAYMENT`, `SPLIT_BILL`.
  - Kinds: `FULL_PAYMENT`, `DOWN_PAYMENT`, `REMAINING_PAYMENT`, `MULTI_PAYMENT_LINE`, `SPLIT_BILL_LINE`.
- Invalid enum values are mapped to cashier-safe messages instead of Zod technical text.

## 5. Order Type Guard Behavior

- Provided `order_type_id` must exist, be active, and be enabled for the tenant through `tenant_order_types`.
- Missing/null `order_type_id` deterministically resolves to the only enabled active type if the tenant has exactly one.
- If multiple or zero enabled active order types exist, null remains null; no provided invalid value is silently replaced.
- Invalid values return: `Tipe pesanan tidak valid atau belum aktif untuk tenant ini. Muat ulang POS lalu coba lagi.`

## 6. Full Payment Flow

- Fresh-cart full payment submits one backend command.
- Repository creates/reuses the parent order in the same transaction as the payment row.
- Result clears the cart only when backend returns `shouldClearCart: true`.

## 7. DP Flow

- DP uses one payment line per submit.
- Application returns `PARTIAL` for incomplete settlement.
- Frontend respects `shouldClearCart: false`, so the cart/session is not cleared for partial results.

## 8. Multi Flow

- Multi payment supports up to two lines.
- Frontend no longer creates a parent order and loops through payment row calls for fresh-cart multi payment; it posts one canonical command.
- Repository inserts the payment rows inside the same transaction.

## 9. Split Bill Persisted Lifecycle

- Split payment sends selected bill and split metadata through the backend command.
- Repository persists/updates `order_bill_splits`, tracks amount paid, updates status, and ties payment rows to real split IDs when available.
- Parent order can remain partial/open while an individual bill is paid and other bill/unassigned amount remains unpaid.

## 10. Transaction / Idempotency Strategy

- Fresh-cart session identity uses `orders.idempotency_key = clientPaymentSessionId`.
- Payment line identity uses deterministic keys: `clientPaymentSessionId:flow:targetBillId|none:lineIndex:method:amount`.
- Retry reuses the existing parent order and skips duplicate payment line inserts for matching idempotency keys.

## 11. Frontend Command Submission Changes

- `posPaymentSubmissionService` now builds a backend `SubmitPOSPaymentRequest` and calls `submitCanonicalPayment` once.
- `useSubmitPOSPayment()` posts to `/api/pos/payments/submit` and invalidates order/open-order/catalog queries.
- Retail and restaurant active-payment flows use the single submit dependency instead of direct payment row persistence.

## 12. UI Partial-result Behavior

- The frontend result is now the backend result.
- `shouldClearCart` and `shouldPrintReceipt` are not inferred from local line totals.
- Partial results keep the session open unless the backend explicitly says otherwise.

## 13. User-safe Error Mapping

- `INVALID_ORDER_TYPE` → `Tipe pesanan tidak valid atau belum aktif untuk tenant ini. Muat ulang POS lalu coba lagi.`
- `PAYMENT_AMOUNT_EXCEEDS_REMAINING` → `Jumlah pembayaran melebihi sisa tagihan.`
- `INVALID_SPLIT_BILL` → `Bill yang dipilih tidak valid atau sudah lunas.`
- `PAYMENT_METHOD_INVALID` → `Metode pembayaran tidak valid.`
- `PAYMENT_FLOW_INVALID` → `Tipe pembayaran tidak valid.`
- Generic database/FK errors are mapped to safe retry text and not exposed to the cashier.

## 14. Files Changed

- `packages/application/payments/SubmitPOSPayment.ts`
- `packages/application/payments/__tests__/SubmitPOSPayment.test.ts`
- `packages/infrastructure/repositories/payments/DrizzleSubmitPOSPaymentRepository.ts`
- `apps/api/src/http/controllers/POSPaymentController.ts`
- `apps/api/src/http/routes/pos.ts`
- `apps/api/src/container.ts`
- `apps/pos-terminal-web/src/features/pos-core/services/posPaymentSubmissionService.ts`
- `apps/pos-terminal-web/src/features/pos-core/services/__tests__/posPaymentSubmissionService.test.ts`
- `apps/pos-terminal-web/src/features/pos-flows/retail/useRetailStandardPOSFlow.ts`
- `apps/pos-terminal-web/src/features/pos-flows/restaurant/useRestaurantTableServicePOSFlow.ts`
- `apps/pos-terminal-web/src/lib/api/hooks.ts`
- `migrations/0016_order_payment_flow_metadata.sql`
- `migrations/0017_order_bill_splits_client_bill_id.sql`
- `PLANS.md`
- `roadmap/business-flows/replit_codex_P9_3_backend_submit_pos_payment_prompt.md`

## 15. Tests Added/Updated

- Added `packages/application/payments/__tests__/SubmitPOSPayment.test.ts` for canonical use-case validation and order type guard behavior.
- Updated `apps/pos-terminal-web/src/features/pos-core/services/__tests__/posPaymentSubmissionService.test.ts` for backend command building and partial clear-cart behavior.

## 16. Validation Output

- `pnpm --filter @pos/domain type-check`: passed.
- `pnpm --filter @pos/application type-check`: passed.
- `pnpm --filter @pos/application test`: passed.
- `pnpm --filter @pos/api type-check`: passed.
- `pnpm --filter @pos/api test`: passed.
- `pnpm --filter @pos/terminal-web type-check`: passed.
- `pnpm --filter @pos/terminal-web test`: passed.
- `pnpm type-check`: passed across 10 workspace packages.
- `pnpm test`: passed across all configured workspace test packages.
- `pnpm build`: passed; Vite reported the existing large chunk warning only.

## 17. Grep Cleanup Output

- `rg -n "full_payment|partial_payment_dp|normalizePOSPaymentFlow|paymentDetails\?.flow.*unknown|shouldClearCart: true|recordPaymentLines" ...` returns only tests proving non-canonical old flow strings are rejected.
- `rg -n "createOrderMutation\.mutateAsync|recordPaymentMutation\.mutateAsync|createOrder\(|recordPayment\(" ...` returns draft/kitchen order creation paths only; payment submission no longer loops record-payment rows in pos-core or flow hooks.
- `rg -n "order_type_id.*insert|orderTypeId: order_type_id|orderTypeId:" ...` confirms SubmitPOSPayment order insert uses a guarded `orderData.order_type_id`; `/api/orders`, `/api/orders/:id`, and `/api/orders/create-and-pay` now resolve order type through the same tenant-aware guard before use-case execution.

## 18. Remaining Limitations

None for this execution batch. The earlier type-check blockers were fixed, older order/create-and-pay paths now use the same tenant-aware order type guard, and root type-check/test/build validation passed.

## 19. Next Recommended Phase

1. Add a dedicated integration-test harness for the payment repository if the project later standardizes real database integration tests.
2. Tune POS bundle chunking if the existing Vite large chunk warning becomes a release concern.
