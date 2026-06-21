# P9.2 Clean POS Payment Refactor Report

## 1. Summary
P9.2 refactors POS payment toward a single canonical payment language shared by domain, application, API DTOs, and POS core. Payment flow values are now uppercase canonical concepts (`FULL`, `DOWN_PAYMENT`, `MULTI_PAYMENT`, `SPLIT_BILL`) and line kinds are uppercase canonical row intents (`FULL_PAYMENT`, `DOWN_PAYMENT`, `REMAINING_PAYMENT`, `MULTI_PAYMENT_LINE`, `SPLIT_BILL_LINE`).

## 2. Root cause of P9/P9.1 architecture failure
The previous implementation mixed UI aliases, API compatibility strings, and persistence row values in the same frontend service. That made POS core normalize `full_payment`/`partial_payment_dp` beside `full`/`dp`, allowed fresh-cart multi/split to create an order before row submission without stable retry state, and forced business-flow hooks to pass ambiguous details.

## 3. Canonical payment contract
Canonical domain types were added under `packages/domain/payments`. POS commands now use built-in methods `CASH`, `MANUAL_TRANSFER`, and `MANUAL_QRIS`; flows use `FULL`, `DOWN_PAYMENT`, `MULTI_PAYMENT`, and `SPLIT_BILL`.

## 4. Removed old aliases / compatibility cleanup
POS core no longer exports or calls `normalizePOSPaymentFlow`, and the runtime POS submission service rejects non-canonical flow strings at command build time. API DTO validation now accepts canonical uppercase payment methods, flows, and kinds.

## 5. New module structure
- `packages/domain/payments/*`: canonical payment domain language and calculation helpers.
- `packages/application/orders/paymentFlow.ts`: application-facing re-export of canonical payment calculations/types.
- `apps/pos-terminal-web/src/features/pos-core/payment/paymentCommandMapper.ts`: UI boundary mapper from legacy cart method labels to canonical payment methods.
- `apps/pos-terminal-web/src/features/pos-core/services/posPaymentSubmissionService.ts`: canonical POS payment command builder and submitter.

## 6. Fresh cart Full/DP/Multi/Split flow
Full and DP fresh-cart payments still use the existing transaction-safe create-and-pay endpoint for one payment row. Multi and split fresh-cart flows create the parent order once, cache the `clientPaymentSessionId` to created order identity, then record canonical payment rows.

## 7. Saved/active order Full/DP/Multi/Split flow
Saved/active order flows skip fresh order creation and record canonical payment rows against the server order ID. Restaurant table-service remains active-order-only for payment, preserving pay-later service.

## 8. Split bill partial settlement behavior
Split bill validation checks only the selected bill when session bill state is available. Unassigned or other unpaid bill amounts are allowed to remain unpaid, so paying Bill A can leave the parent order partial/open.

## 9. Payment session / no duplicate parent order strategy
Every POS payment submit now carries a `clientPaymentSessionId`. The POS flow hooks keep the same session ID across retry until a clear-cart result. POS core also caches a fresh-cart session's created `orderId` after parent creation so retry reuses the parent order instead of creating another one.

## 10. Backend transaction/idempotency strategy
Existing full/DP create-and-pay remains transaction-safe for single-row payment. Multi/split still use create-order followed by row submission, but parent-order duplication is prevented at the POS session layer. Backend per-line idempotency remains a recommended next step.

## 11. UI failure/retry behavior
Technical enum validation is converted to a cashier-safe Indonesian message. Partial split/multi success returns `shouldClearCart=false`, preventing a partial selected-bill payment from clearing the cart/session as if the whole parent order was paid.

## 12. Files changed
See git diff for the complete patch. Major changes are in domain payments, POS payment submission, POS payment dialog, API DTO validation, application payment types, and payment tests.

## 13. Tests added/updated
Updated POS core payment flow/submission tests, application payment flow tests, and API payment/direct-bypass tests for canonical uppercase values and old-alias rejection.

## 14. Validation output
- `pnpm --filter @pos/terminal-web type-check`: pass
- `pnpm --filter @pos/terminal-web test`: pass
- `pnpm --filter @pos/domain type-check`: pass
- `pnpm --filter @pos/application type-check`: pass
- `pnpm --filter @pos/application test`: pass
- `pnpm --filter @pos/api type-check`: pass
- `pnpm --filter @pos/api test`: pass after updating canonical API test payloads

## 15. Grep cleanup output
Required grep shows old alias text only in a POS test that proves old lowercase flow aliases are rejected. `@/hooks/useCart` remains in business-flow hooks because those hooks own cart UI state, not POS core payment domain imports.

## 16. Remaining limitations
- Multi/split fresh-cart persistence is still not a single backend transaction with many payment rows.
- Backend payment-line idempotency is still limited; frontend/session prevents duplicate parent orders, but row-level deterministic idempotency should be added next.
- `PaymentMethodDialog` still has `// @ts-nocheck`; it now emits canonical payment details, but should be typed in the next cleanup.

## 17. Next recommended phase
Implement a backend `SubmitPOSPayment` use case/endpoint that creates or reuses the parent order and all payment rows in one database transaction with deterministic idempotency per payment line and persisted split bill lifecycle APIs.
