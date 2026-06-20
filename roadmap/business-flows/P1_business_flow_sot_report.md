# P1 Business Flow SOT Report

## 1. Summary

P1 adds a behavior-neutral Source of Truth (SOT) for AuraPoS business flows. The implementation defines canonical business profile ids, order action ids, lifecycle vocabulary, profile registry metadata, and a pure order-action policy evaluator. It intentionally does **not** wire these contracts into POS runtime pages, API controllers, database schema, or payment/create-and-pay flows.

## 2. Files Added/Changed

- Added `packages/domain/business-flows/businessFlowTypes.ts` for business profile and UI section contracts.
- Added `packages/domain/business-flows/businessFlowActions.ts` for stable canonical action ids and action metadata.
- Added `packages/domain/business-flows/businessFlowProfiles.ts` for profile id constants.
- Added `packages/domain/business-flows/orderLifecycleTypes.ts` for canonical lifecycle/status vocabulary.
- Added `packages/domain/business-flows/index.ts` and exported the module from `packages/domain/index.ts`.
- Added `packages/application/business-flows/registry/businessFlowProfiles.ts` for registry data.
- Added `packages/application/business-flows/registry/businessFlowRegistry.ts` for profile/action lookup helpers.
- Added `packages/application/business-flows/policies/CanPerformOrderAction.ts` for the pure policy evaluator.
- Added `packages/application/business-flows/policies/ResolveAllowedOrderActions.ts` for bulk allowed-action resolution.
- Added `packages/application/business-flows/index.ts` and package exports.
- Added pure tests in `packages/application/business-flows/__tests__/`.
- Updated this roadmap checklist after validation.

## 3. Business Profile Registry Table

| Profile | Default Flow | Default Runtime Meaning in P1 |
| --- | --- | --- |
| `retail_standard` | Cart -> Pay -> Paid/Completed | Direct cashier checkout. No kitchen/table/pay-later active-order default. |
| `restaurant_table_service` | Table/Cart -> Send to Kitchen -> Active Kitchen Order -> Served -> Pay | Table-service metadata with kitchen-fired item lock semantics. |
| `cafe_counter` | Cart -> Pay -> Preparation/Kitchen Ticket -> Completed | Pay-first counter service with optional preparation ticket metadata. |
| `quick_service` | Cart -> Pay -> Fulfillment Queue/Preparation -> Complete | Fast pay-first checkout with optional queue/preparation metadata. |
| `service_business_later` | Service Order -> DP/Unpaid -> In Progress -> Done -> Final Payment | Reserved placeholder only; complex workflow not enabled by default. |

## 4. Canonical Actions Table

The SOT defines these stable action ids: `CREATE_AND_PAY`, `SAVE_DRAFT`, `CONTINUE_DRAFT`, `UPDATE_DRAFT_ITEMS`, `CANCEL_DRAFT`, `SEND_TO_KITCHEN`, `PAY_ACTIVE_ORDER`, `ADD_ITEM_TO_ACTIVE_ORDER`, `CREATE_PREPARATION_TICKET_AFTER_PAYMENT`, `VOID_ITEM`, `CANCEL_ACTIVE_ORDER`, `REFUND_PAYMENT`, `VOID_PAYMENT`, `SPLIT_BILL`, `PARTIAL_PAYMENT`, `VIEW_ACTIVE_ORDER`, `VIEW_DRAFT`, `VIEW_LOCAL_DRAFT`, and `DELETE_LOCAL_DRAFT`.

Each action has metadata for label, category, core/business-specific classification, entitlement requirements, reason/permission requirements where applicable, and unsafe-without-policy markers.

## 5. Lifecycle Vocabulary Table

| Vocabulary | Values |
| --- | --- |
| Canonical lifecycle state | `cart`, `local_draft`, `server_draft`, `active_order`, `active_kitchen_order`, `paid_completed`, `cancelled` |
| Operational status | `draft`, `confirmed`, `preparing`, `ready`, `served`, `completed`, `cancelled` |
| Payment status | `unpaid`, `partial`, `paid`, `refunded`, `voided` |
| Fulfillment status | `not_required`, `not_started`, `pending`, `preparing`, `ready`, `served`, `completed`, `cancelled` |

P1 does not replace existing production order status fields. These are clean vocabulary contracts for P2 mapping and runtime fixes.

## 6. Entitlement Relationship Table

| Action | Entitlement Metadata | Note |
| --- | --- | --- |
| `SEND_TO_KITCHEN` | `restaurant_kitchen_ops` | Existing catalog code reused. |
| `SPLIT_BILL` | `payments_split_bill` | Existing catalog uses `payments_split_bill`; no duplicate split-payment code added. |
| `PARTIAL_PAYMENT` | `payments_partial_payment` | Existing catalog code reused. |
| `CREATE_AND_PAY` | none | Core POS payment action; auth/RBAC remains an API/runtime concern outside P1. |
| `PAY_ACTIVE_ORDER` | none | Must not require `orders_queue`; paying active unpaid/partial order is payment lifecycle, not queue display. |
| `VIEW_ACTIVE_ORDER` | none in P1 metadata | `orders_queue` can gate queue display later, but must not gate payment lifecycle. |

## 7. Order Action Policy Matrix

| Rule Area | P1 Policy |
| --- | --- |
| Profile/action support | Denies unsupported profile actions with `ACTION_NOT_SUPPORTED_BY_PROFILE`. |
| Entitlements | Denies actions with missing entitlement metadata using `MISSING_ENTITLEMENT`. |
| Draft edits | `CONTINUE_DRAFT` and `UPDATE_DRAFT_ITEMS` require operational `draft` or `isLocalDraft`. |
| Confirmed/prep/ready/served edits | Draft item updates are denied for confirmed, preparing, ready, served, completed, and cancelled orders. |
| Kitchen lock | Draft/cart item updates are denied when `hasKitchenTicket` or `hasFiredKitchenItems` is true. |
| Kitchen send | `SEND_TO_KITCHEN` is restaurant table-service by default and requires `restaurant_kitchen_ops`. |
| Active payment | `PAY_ACTIVE_ORDER` is allowed for unpaid or partial active orders and does not require `orders_queue`. |
| Local draft delete | `DELETE_LOCAL_DRAFT` is allowed only when `isLocalDraft` is true. |
| Active cancellation | `CANCEL_ACTIVE_ORDER` remains denied by pure policy with reason/permission metadata pending runtime reason policy in P2. |
| Refund/void | Metadata exists; runtime financial policy is intentionally not changed in P1. |

## 8. P0 Findings Addressed by SOT

- The previous mixed vocabulary is separated into profile-specific action contracts.
- Draft actions are separated from active-order actions.
- Kitchen-fired item edits are represented as explicit policy denials rather than implicit cart behavior.
- `PAY_ACTIVE_ORDER` is separated from queue display entitlements so payment lifecycle is not coupled to `orders_queue`.
- Retail pay-first, restaurant pay-later, cafe counter, quick service, and future service-later flows now have explicit SOT metadata.

## 9. What Is Intentionally Not Fixed Until P2

- POSPage runtime orchestration remains unchanged.
- CombinedDraftSheet runtime behavior remains unchanged.
- API order controller behavior remains unchanged.
- Database schema/migrations remain unchanged.
- Entitlement runtime enforcement remains unchanged.
- Payment/create-and-pay runtime behavior remains unchanged.
- Existing UI button, route, and component names remain unchanged.

## 10. Validation Output

- `pnpm --filter @pos/domain type-check`: passed.
- `pnpm --filter @pos/application type-check`: passed.
- `pnpm exec tsx packages/application/business-flows/__tests__/businessFlowRegistry.test.ts`: passed.
- `pnpm exec tsx packages/application/business-flows/__tests__/orderActionPolicy.test.ts`: passed.

## 11. Remaining Questions / UNKNOWN_NEEDS_CONFIRMATION

- `SPLIT_BILL` maps to existing `payments_split_bill`; no `payments_split_payment` entitlement exists in the current catalog.
- P2 should decide whether `restaurant_table_service` supports a pay-first variant and when `supportsPayFirstVariant` may be enabled.
- P2 should define the runtime reason capture and permission/RBAC contract for `VOID_ITEM`, `CANCEL_ACTIVE_ORDER`, `REFUND_PAYMENT`, and `VOID_PAYMENT`.
- P2 should map current production order/payment/fulfillment fields to the P1 vocabulary before changing lifecycle behavior.
