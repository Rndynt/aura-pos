# P8 Backend Action Policy Guard Report

Date: 2026-06-20

## 1. Summary

P8 adds backend enforcement for POS/order actions using the existing business-flow policy layer. The implementation focuses on preventing direct API/use-case bypasses for normal draft updates, active/kitchen order edits, payment entitlement/lifecycle checks, and active order cancellation without an explicit reason.

Implemented:

- Added a reusable application helper, `assertCanPerformOrderAction`, that wraps `CanPerformOrderAction` and throws typed readable business errors.
- Routed `UpdateOrder` lifecycle checks through the policy helper while preserving P2/P2.1 lock behavior and error codes.
- Added backend policy context resolution in `OrdersController` from tenant business type and effective entitlements.
- Guarded `POST /api/orders/:id/payments` for full/active payment and partial-payment entitlement via policy.
- Guarded `POST /api/orders/:id/cancel` so active orders require an explicit cancellation reason and policy action.
- Included existing pure order-action policy tests in the `@pos/application` test script.

Not implemented in this batch:

- Express/controller-level API bypass tests are still recommended as the next batch.
- Browser/manual smoke remains deferred as allowed by the P8 prompt.
- No refund/void engine was invented because this is outside the allowed scope.

## 2. Guard points added

| Guard point | File | Enforcement |
| --- | --- | --- |
| `UpdateOrder` use case | `packages/application/orders/UpdateOrder.ts` | Calls `assertCanPerformOrderAction` with `UPDATE_DRAFT_ITEMS`; rejects non-draft, kitchen-ticket, and fired-item edits. |
| `PATCH /api/orders/:id` | `apps/api/src/http/controllers/OrdersController.ts` | Existing use-case errors are mapped to readable HTTP `409` responses. |
| `POST /api/orders/:id/payments` | `apps/api/src/http/controllers/OrdersController.ts` | Resolves tenant profile/entitlements, checks `PAY_ACTIVE_ORDER` for full payment and `PARTIAL_PAYMENT` for DP/partial flow. |
| `POST /api/orders/:id/cancel` | `apps/api/src/http/controllers/OrdersController.ts` | Requires reason for non-draft orders; checks `CANCEL_DRAFT` or `CANCEL_ACTIVE_ORDER` policy before workflow execution. |
| Policy helper | `packages/application/business-flows/policies/AssertCanPerformOrderAction.ts` | Standardizes readable policy error codes and status codes. |

## 3. Backend route/use-case audit table

| Route/use case | Status before P8 | P8 result | Notes |
| --- | --- | --- | --- |
| `PATCH /api/orders/:id` / `UpdateOrder` | Lifecycle locks existed directly in use case. | Centralized through business-flow policy helper, preserving `ORDER_NOT_EDITABLE`, `KITCHEN_ORDER_LOCKED`, `FIRED_ITEMS_LOCKED`. | Guard remains tenant-scoped via `findById(orderId, tenantId)`. |
| `POST /api/orders/:id/payments` / `RecordPayment` | Partial payment checked a raw entitlement; full payment had no business-flow action guard. | Adds `PAY_ACTIVE_ORDER`/`PARTIAL_PAYMENT` policy guard. | Full payment does not require `orders_queue`; policy tests explicitly cover this. |
| `POST /api/orders/:id/cancel` / `CancelOrderWorkflow` | Cancellation was route-role protected and state-validated, but active reason was optional at controller layer. | Draft cancel remains allowed; active cancel now requires reason and policy action. | Real fine-grained permission source can be integrated later. |
| `PATCH /api/orders/:id/status` | Existing transition use cases enforce status transition rules. | Audited; no P8 change. | Kitchen mode remains fulfillment-only; POS mode remains financial/status transition path. |
| `POST /api/orders/:id/kitchen-ticket` | Existing entitlement route guard and confirm workflow. | Audited; no P8 change. | Existing route entitlement/RBAC still applies. |
| Refund/void routes | No POS order refund/void route found in `apps/api/src/http/routes/orders.ts`. | Documented as not exposed in orders routes. | Do not invent engine in P8. |
| Delete/trash server order route | No `DELETE /api/orders/:id` route found in `apps/api/src/http/routes/orders.ts`. | Documented as not exposed. | Local draft delete is frontend/offline local-only. |

## 4. Policy/context adapter design

The API adapter resolves policy context per tenant request:

1. Load tenant entitlement context via `loadTenantEntitlementContext(tenantId)`.
2. Load effective entitlement map via `getEffectiveEntitlementMap(tenantId)`.
3. Resolve `businessProfile` with `resolveBusinessProfileFromBusinessType({ businessType, businessTypeCode })`.
4. Pass only enabled entitlement codes to `assertCanPerformOrderAction`.
5. Pass order lifecycle fields from the tenant-scoped order lookup before mutation.

Safe fallback behavior:

- If tenant entitlement context is missing, profile resolution falls back through the existing resolver to `core_standard`.
- Tenant-owned order lookup remains scoped by `tenantId` and optional outlet ownership before policy checks.
- Missing profile does not grant unsafe lifecycle mutations because lifecycle state is still evaluated by policy.

## 5. Error code/response matrix

| Policy condition | API code | HTTP status | User-readable intent |
| --- | --- | --- | --- |
| Unknown/unsupported action | `ORDER_ACTION_NOT_ALLOWED` | `409` | Action is not valid for current business flow. |
| Non-draft update through draft edit | `ORDER_NOT_EDITABLE` | `409` | Active orders cannot be edited through normal cart update. |
| Kitchen ticket lock | `KITCHEN_ORDER_LOCKED` | `409` | Kitchen orders are locked from draft/cart edit. |
| Fired/preparing/ready item lock | `FIRED_ITEMS_LOCKED` | `409` | Fired kitchen items cannot be mutated through draft update. |
| Payment lifecycle not payable | `PAYMENT_NOT_ALLOWED` | `409` | Payment cannot be recorded for this lifecycle/payment state. |
| Partial payment entitlement missing | `PARTIAL_PAYMENT_ENTITLEMENT_REQUIRED` | `403` | Partial payment requires `payments_partial_payment`. |
| Split bill entitlement missing | `SPLIT_BILL_ENTITLEMENT_REQUIRED` | `403` | Split bill requires `payments_split_bill`. |
| Active cancel without reason/policy | `ORDER_CANCEL_REASON_REQUIRED` | `400`/`409` | Active cancellation must be explicit and reasoned. |

## 6. Tests added/updated

- Updated `packages/application/package.json` so `pnpm --filter @pos/application test` runs the existing `business-flows/__tests__/orderActionPolicy.test.ts` policy coverage.
- Existing policy tests cover:
  - `UPDATE_DRAFT_ITEMS` allowed for draft and rejected for active statuses.
  - `KITCHEN_ORDER_LOCKED` and `FIRED_ITEMS_LOCKED` policy reasons.
  - `PAY_ACTIVE_ORDER` allowed for active unpaid/partial orders without `orders_queue`.
  - `PARTIAL_PAYMENT` and `SPLIT_BILL` entitlement gates.
- Existing `UpdateOrder.lifecycleLocks.test.ts` covers use-case update bypass rejection for active, kitchen-locked, fired-item, and paid draft states.

Recommended next test additions:

- API/controller direct bypass tests for `PATCH /api/orders/:id` active/kitchen order.
- API/controller direct bypass tests for full payment without `orders_queue`.
- API/controller direct bypass tests for partial payment without entitlement.
- API/controller direct bypass tests for active cancel without reason.

## 7. Validation output

Commands run in this batch:

```bash
pnpm --filter @pos/application type-check
pnpm --filter @pos/api type-check
```

Results:

- `@pos/application` type-check: passed.
- `@pos/api` type-check: passed.

Additional commands run after the initial report draft:

```bash
pnpm --filter @pos/domain type-check
pnpm --filter @pos/application test
pnpm --filter @pos/api test
pnpm type-check
rg -n "orders_queue.*full payment|orders_queue.*recordPayment|recordPayment.*orders_queue|plan.*businessProfile|restaurant_table_service.*businessType|businessType.*restaurant_table_service|GenericPOSPage|features/pos/services|features/pos/mappers" apps packages shared || true
```

Results:

- `@pos/domain` type-check: passed.
- `@pos/application` tests: passed.
- `@pos/api` tests: passed after updating the record-payment idempotency controller test mock to include the tenant-scoped order lookup now required by the backend guard.
- Root `pnpm type-check`: passed all 10 Turbo package tasks.
- Cleanup grep: no matches.

## 8. Cleanup grep findings

Cleanup grep run:

```bash
rg -n "orders_queue.*full payment|orders_queue.*recordPayment|recordPayment.*orders_queue|plan.*businessProfile|restaurant_table_service.*businessType|businessType.*restaurant_table_service|GenericPOSPage|features/pos/services|features/pos/mappers" apps packages shared
```

Observed P8 result: no matches, which means:

- no full payment dependency on `orders_queue`;
- no business type mapped to paid workflow profiles;
- no `GenericPOSPage` or old frontend compatibility shims;
- backend guard uses policy/application layer, not frontend-only checks.

## 9. Manual/browser smoke deferred note

Browser smoke was not run in P8. This remains a deferred release-gate task, consistent with the P8 prompt. P8 changed backend/application enforcement only and did not touch frontend UI runtime behavior.

## 10. Remaining risks and next recommended phase

Remaining risks:

1. Active cancel permission currently relies on route role plus policy input; it should be wired to a concrete authenticated permission claim/source when the RBAC permission model exposes one.
2. API/controller-level tests should be added to prove direct HTTP bypass behavior end-to-end.
3. Frontend error handling may need copy mapping for the new readable backend codes.
4. Refund/void routes are not implemented under order routes; if added later, they must use the same policy helper and explicit reason/permission model.

Next recommended phase:

- P8.1: Add API direct-bypass test harness and tighten RBAC permission mapping for active cancellation/refund/void policy inputs.
