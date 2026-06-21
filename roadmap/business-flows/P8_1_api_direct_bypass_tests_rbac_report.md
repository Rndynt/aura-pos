# P8.1 API Direct-Bypass Tests + RBAC Permission Mapping Report

Date: 2026-06-21

## 1. Summary

P8.1 adds API/controller-level regression coverage proving that backend order-action policy guards cannot be bypassed by direct calls to order update, payment, and cancellation endpoints.

Implemented:

- Added controller-level direct-bypass tests for `PATCH /api/orders/:id`, `POST /api/orders/:id/payments`, and `POST /api/orders/:id/cancel`.
- Mapped active-order cancellation policy input from the authenticated POS role context instead of granting `orders:cancel_active` whenever a cancellation reason is present.
- Conservatively maps `owner`, `manager`, and `platform-admin` to `orders:cancel_active`; `cashier` remains route-eligible for draft cancel/payment work but is rejected by policy for active cancellation.
- Added active cancellation as a supported policy action for F&B/service active-order profiles so the permission gate can allow manager/owner actions instead of failing before permission evaluation.
- Added an API-controller test override seam for policy base/entitlement resolution to keep direct-bypass tests deterministic without reaching a real tenant entitlement database.

Not implemented:

- No refund, void, or delete/trash order routes were added because this phase is test hardening and permission mapping only.
- No database schema or payment/refund/void engine changes were made.

## 2. API/controller test harness used

The new tests use the existing API test convention:

- `node:test` and `assert`.
- A tiny Express app per case.
- Direct mounting of exported controller handlers.
- A test-scoped fake `container.orderRepository` and fake use-case executors.
- The shared API error middleware shape used by other controller tests: `{ code, message }`.

Test file:

```txt
apps/api/src/__tests__/order-action-direct-bypass.test.ts
```

## 3. Direct-bypass test matrix and result

| Area | Case | Expected | Result |
| --- | --- | --- | --- |
| PATCH/update | Active confirmed order | `409 ORDER_NOT_EDITABLE` | Passed |
| PATCH/update | Kitchen-locked order | `409 KITCHEN_ORDER_LOCKED` | Passed |
| PATCH/update | Fired/preparing/ready kitchen item lock | `409 FIRED_ITEMS_LOCKED` | Passed |
| PATCH/update | Editable draft order | `200 success` | Passed |
| recordPayment | Full cash payment on payable order without `orders_queue` | `201 success` | Passed |
| recordPayment | Partial payment without `payments_partial_payment` | `403 PARTIAL_PAYMENT_ENTITLEMENT_REQUIRED` | Passed |
| recordPayment | Partial payment with `payments_partial_payment` | `201 success` | Passed |
| recordPayment | Cancelled/not-payable order | `409 PAYMENT_NOT_ALLOWED` | Passed |
| cancelOrder | Draft cancel | `200 success` | Passed |
| cancelOrder | Active cancel without reason | `400 ORDER_CANCEL_REASON_REQUIRED` | Passed |
| cancelOrder | Active cancel with reason as cashier | `409 ORDER_ACTION_NOT_ALLOWED` | Passed |
| cancelOrder | Active cancel with reason as manager | `200 success` | Passed |

These tests mount controllers directly, so they prove the backend/controller path blocks direct calls even if frontend controls are hidden or bypassed.

## 4. RBAC/permission source audit

Current authenticated request context exposes role-level information, not a fine-grained permission-claim list:

- `req.posRole` is attached by RBAC middleware from Better Auth session + user DB role.
- `req.authTenantUser.role` may be attached by tenant middleware for authenticated tenant-scoped requests.
- The RBAC middleware currently defines a role hierarchy and route guards, but no persisted or session-level permission claim array.

Conclusion: P8.1 cannot map from true fine-grained permission claims because they do not exist at controller level yet. A conservative role-to-permission adapter was added for the specific active-cancel policy input.

## 5. Active cancel permission mapping result

The controller now maps active cancellation permissions as follows:

| Source role | Mapped permission | Result for active cancel with reason |
| --- | --- | --- |
| `owner` | `orders:cancel_active` | Allowed by policy |
| `manager` | `orders:cancel_active` | Allowed by policy |
| `platform-admin` | `orders:cancel_active` | Allowed by policy |
| `cashier` | none | Rejected by policy |
| `kitchen` / `viewer` / missing role | none | Rejected by policy |

This replaces the previous unsafe behavior where any non-empty cancellation reason supplied `orders:cancel_active` to the policy helper.

## 6. Refund/void/delete route audit result

Audited file:

```txt
apps/api/src/http/routes/orders.ts
```

Findings:

| Route/action | Exposed? | P8.1 result |
| --- | --- | --- |
| `DELETE /api/orders/:id` | No | Not exposed; no route invented. |
| Refund order route | No order refund route found in orders router | Not exposed; no refund engine invented. |
| Void order/payment route | No order void route found in orders router | Not exposed; no void engine invented. |
| Trash server order route | No server-side trash/delete route found | Not exposed; local draft delete remains frontend/offline concept. |

## 7. Error response matrix

| Condition | Machine code | HTTP status verified |
| --- | --- | --- |
| Active order draft/cart update | `ORDER_NOT_EDITABLE` | `409` |
| Kitchen-ticket lock | `KITCHEN_ORDER_LOCKED` | `409` |
| Fired kitchen item lock | `FIRED_ITEMS_LOCKED` | `409` |
| Cancelled/not-payable payment | `PAYMENT_NOT_ALLOWED` | `409` |
| Partial payment missing entitlement | `PARTIAL_PAYMENT_ENTITLEMENT_REQUIRED` | `403` |
| Active cancellation without reason | `ORDER_CANCEL_REASON_REQUIRED` | `400` |
| Active cancellation without mapped permission | `ORDER_ACTION_NOT_ALLOWED` | `409` |

## 8. Validation output

Commands run:

```bash
pnpm --filter @pos/application type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/application test
pnpm --filter @pos/api test
pnpm type-check
rg -n "orders_queue.*full payment|orders_queue.*recordPayment|recordPayment.*orders_queue|plan.*businessProfile|restaurant_table_service.*businessType|businessType.*restaurant_table_service|GenericPOSPage|features/pos/services|features/pos/mappers" apps packages shared || true
```

Results:

- `@pos/application` type-check: passed.
- `@pos/api` type-check: passed.
- `@pos/application` tests: passed.
- `@pos/api` tests: passed, including the new P8.1 direct-bypass suite.
- Root `pnpm type-check`: passed all 10 Turbo package tasks.
- Cleanup grep: no matches.

Note: an initial chained validation command returned non-zero after successful type/tests because the final cleanup `rg` intentionally found no matches and was run without `|| true`. The cleanup grep was rerun with `|| true` and produced no matches.

## 9. Cleanup grep findings

Cleanup grep found no matches, confirming:

- no full payment dependency on `orders_queue`;
- no `recordPayment` dependency on `orders_queue`;
- no business type mapped back to paid workflow profile mode;
- no `GenericPOSPage` or old frontend compatibility shim references in active source.

## 10. Remaining risks

1. RBAC still exposes coarse roles, not first-class persisted permission claims. The P8.1 mapping is conservative but should eventually be replaced by explicit permission claims.
2. Refund/void/delete route coverage remains “not exposed.” If those routes are introduced later, they must be policy-guarded and tested in the same direct-bypass style.
3. The controller-level test override seam is intentionally narrow for deterministic tests; full HTTP integration tests with real RBAC sessions would provide an additional release gate.
4. Frontend copy/mapping for some policy codes may still need UX review, though no frontend behavior was changed in this phase.

## 11. Next recommended phase

P8.2 should add real permission-claim infrastructure or a documented role-permission registry that can be shared by RBAC middleware, order-action policy input mapping, and future refund/void/delete actions.
