# Replit/Codex Prompt P1 — Business Flow SOT & Order Action Policy Contract

Repository: `Rndynt/AuraPoS`

## Goal

Implement the first Source of Truth for POS business flows, business profiles, order actions, UI section semantics, and order action policy contracts.

P1 must not fix the runtime lifecycle bugs yet. P1 creates the stable SOT that P2 will use to fix draft/open/kitchen/payment behavior safely.

This phase follows:

```txt
roadmap/business-flows/main.md
roadmap/business-flows/P0_current_pos_flow_audit.md
```

P0 found that POS currently mixes retail checkout, server draft/open order, restaurant/kitchen, partial payment, and offline flow in one orchestration path. P1 must define the canonical business-flow vocabulary and policy matrix before P2 changes runtime behavior.

## Non-negotiable scope boundary

Allowed in P1:

```txt
- Add domain/application type definitions for business flows.
- Add a business-flow registry/SOT.
- Add an action policy evaluator that can classify allowed/disallowed actions.
- Add unit tests for the registry and policy evaluator.
- Add documentation/report for the SOT.
- Wire exports only if needed for type-check.
```

Forbidden in P1:

```txt
- Do not refactor POSPage runtime behavior.
- Do not change CombinedDraftSheet runtime behavior.
- Do not change order controller behavior.
- Do not change database schema/migrations.
- Do not change entitlement runtime behavior.
- Do not change payment/create-and-pay runtime behavior.
- Do not rename existing UI buttons/routes/components.
- Do not implement P2 lifecycle fixes.
```

P1 must be behavior-neutral except new pure modules/tests/docs.

## Required architecture direction

Follow clean architecture.

Domain/application business-flow SOT must not import:

```txt
Drizzle
shared/schema
Express/request/response
React
browser APIs/localStorage
apps/api
apps/pos-terminal-web
infrastructure repositories
```

Allowed dependencies:

```txt
packages/domain business-flow types may be pure TypeScript only.
packages/application business-flow policy may import domain types and existing entitlement constants/types only if they are clean and framework-agnostic.
```

If current package paths are different, create the closest matching structure without breaking existing imports.

## Required target files

Create these files or equivalent paths if repo structure requires adjustment:

```txt
packages/domain/business-flows/businessFlowTypes.ts
packages/domain/business-flows/businessFlowActions.ts
packages/domain/business-flows/businessFlowProfiles.ts
packages/domain/business-flows/orderLifecycleTypes.ts
packages/domain/business-flows/index.ts

packages/application/business-flows/registry/businessFlowRegistry.ts
packages/application/business-flows/policies/CanPerformOrderAction.ts
packages/application/business-flows/policies/ResolveAllowedOrderActions.ts
packages/application/business-flows/index.ts

roadmap/business-flows/P1_business_flow_sot_report.md
```

Tests should be added near the existing test convention. Use existing repo test style. Suggested paths:

```txt
packages/application/business-flows/__tests__/businessFlowRegistry.test.ts
packages/application/business-flows/__tests__/orderActionPolicy.test.ts
```

If the package currently uses another test folder pattern, follow that pattern.

## Canonical business profiles

Define these initial business profiles:

```txt
retail_standard
restaurant_table_service
cafe_counter
quick_service
service_business_later
```

Meaning:

### retail_standard

Default flow:

```txt
Cart -> Pay -> Paid/Completed
```

This profile is for minimarket, toko biasa, retail, and direct cashier checkout.

Default allowed concepts:

```txt
CREATE_AND_PAY
SAVE_DRAFT optional
CONTINUE_DRAFT
UPDATE_DRAFT_ITEMS
CANCEL_DRAFT
REFUND_PAYMENT according to payment policy
VOID_PAYMENT according to payment policy
```

Not default concepts:

```txt
Kitchen/KDS
Table service
Preparing/ready/served workflow
Order queue dependency
Pay-later active restaurant order
```

### restaurant_table_service

Default flow:

```txt
Table/Cart -> Send to Kitchen -> Active Kitchen Order -> Served -> Pay
```

Default allowed concepts:

```txt
SAVE_DRAFT
CONTINUE_DRAFT
UPDATE_DRAFT_ITEMS
SEND_TO_KITCHEN
PAY_ACTIVE_ORDER
ADD_ITEM_TO_ACTIVE_ORDER
VOID_ITEM_WITH_REASON
CANCEL_ACTIVE_ORDER_WITH_REASON
SPLIT_BILL if entitlement active
PARTIAL_PAYMENT if entitlement active
```

Rules:

```txt
Kitchen-fired items cannot be freely edited through normal cart.
Kitchen active order cannot be treated as draft.
Cancellation/void requires reason and permission/policy.
Payment must be possible without loading active kitchen order into editable cart.
```

### cafe_counter

Default flow:

```txt
Cart -> Pay -> Preparation/Kitchen Ticket -> Completed
```

This is pay-first counter service. It can reuse preparation/kitchen ticket infrastructure, but it is not table-service restaurant flow.

Default allowed concepts:

```txt
CREATE_AND_PAY
CREATE_PREPARATION_TICKET_AFTER_PAYMENT
SAVE_DRAFT optional
CONTINUE_DRAFT
REFUND_PAYMENT according to policy
VOID_PAYMENT according to policy
```

No table requirement by default.

### quick_service

Default flow:

```txt
Cart -> Pay -> Fulfillment Queue/Preparation -> Complete
```

This is similar to cafe counter, but not necessarily kitchen/bar-specific.

Default allowed concepts:

```txt
CREATE_AND_PAY
QUEUE_AFTER_PAYMENT optional
REFUND_PAYMENT according to policy
VOID_PAYMENT according to policy
```

### service_business_later

Placeholder only. Do not implement full service workflow in P1.

Default intended future flow:

```txt
Service Order -> DP/Unpaid -> In Progress -> Done -> Final Payment
```

P1 only defines it as a reserved profile with minimal metadata and disabled-by-default complex actions.

## Canonical lifecycle vocabulary

Define pure types/enums for lifecycle vocabulary:

```txt
cart
local_draft
server_draft
active_order
active_kitchen_order
paid_completed
cancelled
```

Also define lower-level status dimensions if useful:

```txt
OrderOperationalStatus:
- draft
- confirmed
- preparing
- ready
- served
- completed
- cancelled

PaymentStatus:
- unpaid
- partial
- paid
- refunded
- voided

FulfillmentStatus:
- not_required
- not_started
- pending
- preparing
- ready
- served
- completed
- cancelled
```

Do not replace existing production order status yet. P1 defines SOT and mapping helpers only.

## Required order actions

Define canonical action ids:

```txt
CREATE_AND_PAY
SAVE_DRAFT
CONTINUE_DRAFT
UPDATE_DRAFT_ITEMS
CANCEL_DRAFT
SEND_TO_KITCHEN
PAY_ACTIVE_ORDER
ADD_ITEM_TO_ACTIVE_ORDER
CREATE_PREPARATION_TICKET_AFTER_PAYMENT
VOID_ITEM
CANCEL_ACTIVE_ORDER
REFUND_PAYMENT
VOID_PAYMENT
SPLIT_BILL
PARTIAL_PAYMENT
VIEW_ACTIVE_ORDER
VIEW_DRAFT
VIEW_LOCAL_DRAFT
DELETE_LOCAL_DRAFT
```

Each action definition must include metadata:

```txt
id
label
category
isCore
isBusinessSpecific
requiredEntitlementCodes optional
requiresReason optional
requiresPermission optional
unsafeWithoutPolicy optional
```

Use stable string constants, not ad-hoc strings scattered around files.

## Entitlement relationship

P1 must only define requirement metadata. Do not enforce runtime entitlement changes yet.

Initial entitlement mapping:

```txt
SEND_TO_KITCHEN -> restaurant_kitchen_ops
SPLIT_BILL -> payments_split_payment or payments_split_bill depending existing SOT naming
PARTIAL_PAYMENT -> payments_partial_payment
CREATE_AND_PAY -> no commercial entitlement; core POS payment action, still requires auth/RBAC at API layer
PAY_ACTIVE_ORDER -> no order_queue entitlement; core payment of existing unpaid order, subject to auth/RBAC
VIEW_ACTIVE_ORDER -> orders_queue only if used for queue display; payment lifecycle must not require orders_queue
```

If existing entitlement names differ, document the exact mapping in the P1 report and avoid inventing duplicate codes.

Important: `orders_queue` must be treated as display/queue capability, not as a prerequisite for paying an active order.

## Required policy evaluator

Implement a pure policy function/use case:

```ts
CanPerformOrderAction(input): OrderActionPolicyResult
```

Input shape should include at least:

```txt
businessProfile
entitlements: string[]
action
orderOperationalStatus optional
paymentStatus optional
fulfillmentStatus optional
hasKitchenTicket optional
hasFiredKitchenItems optional
isLocalDraft optional
actorPermissions optional
```

Output shape:

```txt
allowed: boolean
reasonCode optional
message optional
requiredEntitlements optional
requiredPermissions optional
```

Suggested reason codes:

```txt
UNKNOWN_PROFILE
UNKNOWN_ACTION
MISSING_ENTITLEMENT
ORDER_NOT_DRAFT
ORDER_ALREADY_PAID
ORDER_CANCELLED
KITCHEN_ORDER_LOCKED
FIRED_ITEMS_LOCKED
ACTIVE_ORDER_REQUIRES_REASON
ACTION_NOT_SUPPORTED_BY_PROFILE
LOCAL_DRAFT_ONLY
```

Policy rules required in P1:

```txt
CREATE_AND_PAY:
- allowed for retail_standard, cafe_counter, quick_service.
- allowed for restaurant_table_service if profile supports pay-first variant metadata.

SAVE_DRAFT:
- allowed for retail_standard, restaurant_table_service, cafe_counter.

CONTINUE_DRAFT / UPDATE_DRAFT_ITEMS:
- allowed only when orderOperationalStatus is draft OR isLocalDraft is true.
- denied when orderOperationalStatus is confirmed/preparing/ready/served/completed/cancelled.
- denied when hasKitchenTicket or hasFiredKitchenItems is true.

SEND_TO_KITCHEN:
- only supported for restaurant_table_service by default.
- requires restaurant_kitchen_ops entitlement.
- denied if order is paid_completed/cancelled.

PAY_ACTIVE_ORDER:
- allowed for restaurant_table_service active unpaid/partial order.
- allowed for active orders where paymentStatus is unpaid or partial.
- denied when paymentStatus is paid/refunded/voided.
- must not require orders_queue.

ADD_ITEM_TO_ACTIVE_ORDER:
- supported by restaurant_table_service only.
- must be separate from UPDATE_DRAFT_ITEMS.
- may require explicit profile support.

CANCEL_DRAFT:
- allowed for server/local draft if not active/kitchen.

CANCEL_ACTIVE_ORDER:
- denied unless supported by profile and requires reason/permission metadata.

DELETE_LOCAL_DRAFT:
- allowed only for local draft.

REFUND_PAYMENT / VOID_PAYMENT:
- profile-agnostic financial operation; allowed only if payment policy metadata says supported. In P1, define metadata only; do not change runtime.
```

## Required registry

Implement a registry that can resolve profile definition by id:

```ts
getBusinessFlowProfile(profileId)
listBusinessFlowProfiles()
resolveAllowedActions(input)
isActionSupported(profileId, action)
```

Each profile must include:

```txt
id
label
description
defaultFlowSummary
uiSections
defaultActions
optionalActions
businessSpecificActions
coreActions
notes
```

Suggested UI section ids:

```txt
PRODUCT_GRID
CART
PAYMENT
SERVER_DRAFTS
LOCAL_DRAFTS
ACTIVE_ORDERS
KITCHEN_QUEUE
TABLES
RECEIPTS
```

P1 only defines metadata. Do not wire it into POS runtime yet.

## Required docs/report

Create:

```txt
roadmap/business-flows/P1_business_flow_sot_report.md
```

Report must include:

```txt
1. Summary
2. Files added/changed
3. Business profile registry table
4. Canonical actions table
5. Lifecycle vocabulary table
6. Entitlement relationship table
7. Order action policy matrix
8. P0 findings addressed by SOT
9. What is intentionally not fixed until P2
10. Validation output
11. Remaining questions / UNKNOWN_NEEDS_CONFIRMATION
```

## Required tests

Add tests that prove:

```txt
- all required profiles are registered.
- retail_standard supports CREATE_AND_PAY and does not support SEND_TO_KITCHEN by default.
- restaurant_table_service supports SEND_TO_KITCHEN only with restaurant_kitchen_ops entitlement.
- UPDATE_DRAFT_ITEMS is allowed for draft and denied for confirmed/preparing/ready/served.
- UPDATE_DRAFT_ITEMS is denied when hasKitchenTicket or hasFiredKitchenItems is true.
- PAY_ACTIVE_ORDER is allowed for active unpaid/partial order and does not require orders_queue.
- DELETE_LOCAL_DRAFT is allowed only for local draft.
- SPLIT_BILL requires existing split-payment entitlement code(s).
- PARTIAL_PAYMENT requires payments_partial_payment.
```

Do not use database-backed tests for P1. These should be pure unit tests.

## Validation commands

Run what is relevant to changed packages. Prefer:

```bash
pnpm --filter @pos/domain type-check
pnpm --filter @pos/application type-check
pnpm --filter @pos/application test
pnpm type-check
```

If exact scripts differ, run the closest available commands and document results.

## Completion checklist

- [x] Business profile ids defined.
- [x] Order action ids defined.
- [x] Lifecycle vocabulary defined.
- [x] Business flow registry implemented.
- [x] Policy evaluator implemented.
- [x] Entitlement relationship metadata defined.
- [x] Pure unit tests added.
- [x] Report created.
- [x] No runtime POS behavior changed.
- [x] No schema/migration changes.
- [x] No UI/controller behavior changes.

## Commit

```txt
docs/business-flows: define POS business flow SOT
```

or if tests/code are included:

```txt
feat(business-flows): add POS business flow SOT
```
