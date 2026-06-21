# AuraPoS Business Flow Refactor Roadmap

Repository: `Rndynt/AuraPoS`

## 1. Purpose

Refactor AuraPoS POS flow so different business types do not share one confused workflow.

Current POS code mixes retail, cafe, restaurant, kitchen, draft, order queue, open order, and payment behavior in the same page and state flow. This causes unsafe behavior such as:

- retail orders entering draft/open-order style flow;
- kitchen orders being treated as editable drafts;
- unpaid active orders being mixed with true drafts;
- payment flow depending on UI concepts that should be optional;
- business-specific logic leaking into generic POS core.

The target architecture is:

```txt
One reusable POS core
Multiple business-flow adapters
Clear UI per business profile
Backend policy guard for allowed actions
No hardcoded plan gates
No mixed database/business/UI logic
```

This is a large refactor. It must be executed carefully in phases. Do not attempt to rewrite the whole POS in one patch.

## 2. Core Principle

Business profile and entitlement are different concepts.

```txt
businessProfile = determines workflow / business operation model
entitlement     = determines enabled features inside that workflow
```

Examples:

```txt
retail_standard:
  flow = cart -> pay -> completed
  optional = stock, receipt, discount, simple draft

restaurant_table_service:
  flow = table/cart -> send kitchen -> active order -> served -> pay
  optional = table layout, kitchen, order queue, split bill, partial payment

cafe_counter:
  flow = cart -> pay -> preparation ticket
  optional = bar/kitchen ticket after payment
```

Do not use plan names such as Starter/Growth/Pro to decide business flow. Plans and entitlements can unlock features, but the tenant business profile decides which workflow is active.

## 3. Non-Negotiable Architecture Rules

Follow clean architecture and separation of concerns.

### Domain layer

Allowed:

- pure business types;
- value objects;
- status/action enums;
- invariant rules that do not depend on database or UI.

Forbidden:

- database imports;
- HTTP/request objects;
- React/UI logic;
- entitlement API calls;
- tenant repository calls.

### Application layer

Allowed:

- use cases;
- ports/interfaces;
- orchestration;
- business-flow policy evaluation;
- action authorization using injected entitlement/business-profile data.

Forbidden:

- Drizzle/database imports;
- React/UI logic;
- direct fetch/HTTP calls;
- direct localStorage/browser APIs.

### Infrastructure layer

Allowed:

- Drizzle repositories;
- database schema;
- adapter implementations for application ports;
- migrations.

Forbidden:

- UI state decisions;
- hardcoded business-flow decisions;
- entitlement decision logic beyond persistence/querying.

### API layer

Allowed:

- request validation;
- auth/tenant/outlet context extraction;
- entitlement guard;
- business-profile lookup;
- call application use case;
- map response/error.

Forbidden:

- large business workflows directly inside route/controller;
- database queries when a repository/use case should own it;
- hardcoded plan names.

### Frontend layer

Allowed:

- business-flow-specific UI composition;
- hooks calling API;
- view state;
- responsive components;
- user-facing copy.

Forbidden:

- backend business rules as the only protection;
- database assumptions;
- plan hardcoding;
- one giant POS page containing every possible business workflow.

## 4. Target Folder Structure

The final structure should evolve toward this shape. Do not create all folders at once if not needed, but every phase must move in this direction.

```txt
packages/domain/
  orders/
    orderTypes.ts
    orderLifecycle.ts
    orderActions.ts
    orderPolicies.ts
  payments/
    paymentTypes.ts
    paymentStatus.ts
  business-flows/
    businessFlowTypes.ts
    businessFlowActions.ts
    businessFlowProfiles.ts
  inventory/
  catalog/

packages/application/
  pos-core/
    createOrder.ts
    createAndPay.ts
    recordPayment.ts
    cancelOrder.ts
    calculateCart.ts
    deductInventory.ts
  business-flows/
    ports/
      BusinessProfileRepositoryPort.ts
      EntitlementReaderPort.ts
      OrderActionPolicyPort.ts
    registry/
      businessFlowRegistry.ts
      retailStandardFlow.ts
      restaurantTableServiceFlow.ts
      cafeCounterFlow.ts
    use-cases/
      GetBusinessFlowProfile.ts
      ResolveAllowedOrderActions.ts
      CanPerformOrderAction.ts
      ExecuteBusinessFlowAction.ts
  orders/
  payments/
  inventory/
  catalog/

packages/infrastructure/
  repositories/
    business-flows/
      DrizzleBusinessProfileRepository.ts
    orders/
    payments/
    inventory/
  db/schema/
    businessProfiles.schema.ts
    orders.schema.ts
    payments.schema.ts

apps/api/src/http/routes/
  pos-core.routes.ts
  business-flow.routes.ts
  retail-pos.routes.ts        # only if needed later
  restaurant-pos.routes.ts    # only if needed later

apps/pos-terminal-web/src/features/
  pos-core/
    components/
      ProductGrid.tsx
      CartPanel.tsx
      PaymentDialog.tsx
      OrderSummary.tsx
      ReceiptActions.tsx
    hooks/
      useCart.ts
      usePaymentFlow.ts
      useStockGuard.ts
  pos-flows/
    root/
      POSRootPage.tsx
      useBusinessFlowProfile.ts
    retail/
      RetailPOSFlow.tsx
    restaurant/
      RestaurantPOSFlow.tsx
    cafe-counter/
      CafeCounterPOSFlow.tsx
    shared/
      ActiveOrderList.tsx
      DraftOrderList.tsx
      OrderActionButtons.tsx
```

## 5. Reusable Core vs Business-Specific Flow

### Reusable POS core

These must be reusable across business types:

```txt
Catalog/product loading
Cart management
Pricing/tax/service charge calculation
Discounts
Create order
Create and pay
Record payment
Payment status update
Inventory deduction
Receipt generation/printing
Refund/void/cancel primitives
Stock guard
Idempotency
Tenant/outlet context
```

### Business-specific flow adapters

These must not be mixed directly into generic POS core:

```txt
Table service
Kitchen/KDS ticketing
Order queue semantics
Pay-first vs pay-later behavior
Running bill/open tab behavior
Add item to active kitchen order
Void item after kitchen processing
Split bill by table/customer/item
Service job lifecycle
Appointment/service progress
```

## 6. Business Flow Profiles

Initial profiles:

```txt
retail_standard
restaurant_table_service
cafe_counter
quick_service
service_business_later
```

### retail_standard

Default flow:

```txt
Cart -> Pay -> Paid/Completed
```

Allowed actions:

```txt
CREATE_AND_PAY
SAVE_DRAFT optional
CONTINUE_DRAFT
CANCEL_DRAFT
REFUND/VOID according to payment/order policy
```

Not part of default retail flow:

```txt
Kitchen
Table service
Preparing/ready/served workflow
Order queue dependency
```

### restaurant_table_service

Default flow:

```txt
Table/Cart -> Send to Kitchen -> Active Kitchen Order -> Served -> Pay
```

Allowed actions:

```txt
SEND_TO_KITCHEN
PAY_ACTIVE_ORDER
ADD_ITEM_TO_ACTIVE_ORDER
VOID_ITEM_WITH_REASON
CANCEL_ORDER_WITH_REASON
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

This is pay-first counter service. It can reuse kitchen ticket infrastructure, but it is not table-service restaurant flow.

Allowed actions:

```txt
CREATE_AND_PAY
CREATE_PREPARATION_TICKET_AFTER_PAYMENT
REFUND/VOID according to policy
```

Optional future variant:

```txt
Cart -> Send to Prep -> Active unpaid order -> Pay
```

Do not make this the default until explicitly selected.

## 7. Order Lifecycle Vocabulary

Use clear vocabulary to avoid mixing draft/open/kitchen/payment:

```txt
Cart = local transient basket, not yet server order.
Local Draft = offline/local draft on a device.
Server Draft = server order with status draft, unpaid, not processed.
Active Order = confirmed/preparing/ready/served and unpaid/partial.
Kitchen Order = active order with kitchen ticket or fulfillment started.
Paid/Completed = financially closed order.
```

Do not call all unpaid orders `Draft`.

## 8. Action Policy Model

Create a business-flow action policy instead of spreading conditionals across UI/controllers.

Input:

```txt
tenantId
businessProfile
entitlements
orderLifecycleStatus
paymentStatus
fulfillmentStatus
hasKitchenTicket
action
actorRole/permission if available
```

Output:

```txt
allowed: boolean
reason?: string
requiredEntitlement?: string
requiredPermission?: string
```

Core actions:

```txt
CREATE_AND_PAY
SAVE_DRAFT
CONTINUE_DRAFT
UPDATE_DRAFT_ITEMS
SEND_TO_KITCHEN
PAY_ACTIVE_ORDER
ADD_ITEM_TO_ACTIVE_ORDER
VOID_ITEM
CANCEL_DRAFT
CANCEL_ACTIVE_ORDER
REFUND_PAYMENT
SPLIT_BILL
PARTIAL_PAYMENT
```

Example rules:

```txt
UPDATE_DRAFT_ITEMS allowed only when order.status = draft and no kitchen ticket.
PAY_ACTIVE_ORDER allowed for active unpaid/partial order.
SEND_TO_KITCHEN requires restaurant_kitchen_ops.
SPLIT_BILL requires split bill entitlement.
orders_queue must not be required for payment lifecycle.
```

## 9. Roadmap Phases

### P0 — Current Flow Audit and Flow Freeze

Deliverable:

```txt
roadmap/business-flows/P0_current_pos_flow_audit.md
```

Audit:

```txt
POS entry points
all buttons/actions
current order statuses
draft/open/kitchen/payment interactions
entitlements used by POS
unsafe mixed logic
backend gaps
frontend gaps
```

Do not refactor before this audit is complete.

### P1 — Business Flow SOT

Deliverable:

```txt
packages/application/business-flows/registry/businessFlowRegistry.ts
packages/domain/business-flows/businessFlowTypes.ts
```

Add SOT for:

```txt
business profiles
actions
allowed action matrix
required entitlement matrix
UI section definitions
```

No UI rewrite yet.

### P2 — Fix Existing POS Lifecycle

Fix current draft/kitchen/payment bugs before large split.

Acceptance:

```txt
Retail standard cart -> pay -> completed, no draft loop.
Server draft -> continue/edit -> pay -> completed.
Kitchen order -> active order, not editable draft.
No Lanjut/Edit/trash for active kitchen order.
Active unpaid kitchen order can be paid from order action/detail.
```

### P3 — Extract POS Core Reusable Components and Use Cases

Extract reusable POS pieces:

```txt
ProductGrid
CartPanel
PaymentDialog
OrderSummary
StockGuard
ReceiptActions
createAndPay
recordPayment
cancelOrder
```

Do not introduce business-specific behavior inside core components.

### P4 — Retail Standard Flow

Implement/clean `RetailPOSFlow`.

Acceptance:

```txt
No kitchen/table UI by default.
Cart -> Pay -> Completed.
Draft optional only when explicitly saved.
orders_queue disabled does not affect payment.
```

### P5 — Restaurant Table Service Flow

Implement/clean `RestaurantPOSFlow`.

Acceptance:

```txt
Table/order -> Send Kitchen -> Active Kitchen Order.
Kitchen items locked from normal cart edit.
Pay active order without loading editable cart.
Add item is explicit add-on flow.
Void/cancel requires reason/policy.
```

### P6 — Cafe Counter / Quick Service Flow

Implement `CafeCounterPOSFlow` as pay-first counter flow.

Acceptance:

```txt
Cart -> Pay -> Preparation ticket.
No table requirement.
No open kitchen unpaid order unless selected as variant.
```

### P7 — POS Root Routing by Business Profile

Create root selection:

```txt
POSRootPage -> RetailPOSFlow | RestaurantPOSFlow | CafeCounterPOSFlow
```

Selection source:

```txt
tenant.businessProfile
```

No plan-name hardcoding.

### P8 — Backend Action Policy Guard

Enforce `CanPerformOrderAction` on backend.

Acceptance:

```txt
UI bypass cannot edit kitchen order.
UI bypass cannot delete active kitchen order via normal trash.
Payment action follows policy.
Readable business errors returned.
```

### P9 — Test Matrix and Cleanup

Tests by business profile:

```txt
retail_standard
restaurant_table_service
cafe_counter
entitlement disabled/enabled combinations
```

Cleanup:

```txt
old mixed draft labels
hardcoded plan gates
dead POS branches
duplicated kitchen/queue/payment logic
unused components/hooks
```

## 10. Execution Discipline

Rules for every phase:

```txt
One phase = one scoped prompt/PR.
Every phase must include report.
Every phase must include validation output.
No unrelated payment/inventory/entitlement changes unless required by that phase.
No giant all-in-one rewrite.
No UI-only security.
No database access from domain/application/frontend.
```

## 11. Final Desired Outcome

AuraPoS should support different business operations cleanly:

```txt
Retail: fast checkout.
Restaurant: table/kitchen/pay-later safely.
Cafe counter: pay-first preparation flow.
Service business later: service order lifecycle.
```

Shared systems stay reusable:

```txt
payment
record payment
cart calculation
order repository
inventory deduction
receipt
refund/void/cancel primitives
```

Business-specific behavior is isolated in business-flow adapters and UI flow modules, not scattered across the codebase.

## P5 Status — Restaurant Table Service Adapter + Legacy Mixed POS Cleanup

Date: 2026-06-20

- Implemented explicit `restaurant_table_service` frontend adapter.
- POS root now routes retail and restaurant profiles to explicit adapters.
- Cafe/quick/service/unknown profiles now route to `UnsupportedPOSFlow` instead of the old mixed generic fallback.
- Deleted `GenericPOSPage` and old frontend POS service/mapper compatibility re-export shims.
- See `roadmap/business-flows/P5_restaurant_table_service_full_refactor_report.md` for proof, validation, risks, and next phase.

## P5.1 Status — Business Type vs Entitlement Model Correction

Date: 2026-06-20

- Corrected the P4.1/P5 model: `businessProfile` now represents a baseline POS business family (`retail_standard`, `food_beverage`, `service`, `core_standard`), not a paid operational workflow mode.
- Registered business types from the entitlement SOT map to a core checkout-capable baseline: `CAFE_RESTAURANT -> food_beverage`, `RETAIL_MINIMARKET -> retail_standard`, `LAUNDRY -> service`, `SERVICE_APPOINTMENT -> service`, and `DIGITAL_PPOB -> core_standard`.
- Unknown or missing business type now falls back to `core_standard` instead of `UnsupportedPOSFlow`.
- Table service, kitchen/KDS, order queue, split bill, partial payment, and multi-payment remain entitlement-controlled capabilities, not routing profiles or business-type upgrades.
- See `roadmap/business-flows/P5_1_business_type_entitlement_model_correction_report.md` for the audit table, mapping proof, validation output, and remaining risks.

## P6 Update — Food Beverage + Service Core Flow Adapters (2026-06-20)

P6 is implemented. `food_beverage` now routes to an explicit `FoodBeveragePOSFlow`, `service` routes to `ServiceCorePOSFlow`, and `core_standard`/null/unknown remain on `CoreStandardPOSFlow`. The new adapters reuse the POS checkout core while rendering capability-gated optional panels from the existing entitlement capability semantics. Full payment/cash checkout remains available without `orders_queue`, table service, kitchen ops, split bill, partial payment, or multi-payment entitlements. See `P6_food_beverage_service_core_flows_report.md` for validation and deferred paid capability work.

## P6.2 Business Flow Browser Smoke + Runtime Verification — 2026-06-20

Status: terminal/runtime verification completed; browser/manual smoke remains required in a browser-capable environment.

Report: `roadmap/business-flows/P6_2_business_flow_browser_smoke_runtime_verification_report.md`

Completed in this batch:

- Verified source/test evidence for current intended routing:
  - `retail_standard -> RetailStandardPOSFlow`
  - `food_beverage -> FoodBeveragePOSFlow`
  - `service -> ServiceCorePOSFlow`
  - `core_standard` / null / unknown -> `CoreStandardPOSFlow`
- Verified baseline checkout policy remains independent from paid entitlements such as order queue, table service, kitchen/KDS, split bill, partial payment, and multi-payment.
- Verified cashier runtime debug-copy cleanup using automated tests and grep guards.
- Ran required automated validation and practical package checks successfully.

Not completed in this environment:

- Real browser smoke for retail, F&B, service, and core fallback tenants.
- Screenshot/manual evidence for catalog visibility, cart interaction, full cash payment, and receipt behavior.

Next recommended phase:

- Run the P6.2 browser matrix against seeded tenants in a browser-capable environment and update the report with screenshots or detailed manual notes.

### P8 — Backend Action Policy Guard

Status: Implemented in backend/application core guard layer on 2026-06-20; API/controller bypass tests remain recommended for P8.1.

Deliverable:

```txt
roadmap/business-flows/P8_backend_action_policy_guard_report.md
```

Implemented:

```txt
- application-level assertCanPerformOrderAction helper with readable policy errors;
- UpdateOrder guarded through business-flow policy while preserving kitchen/fired item locks;
- recordPayment backend guard for PAY_ACTIVE_ORDER and PARTIAL_PAYMENT;
- active cancel backend guard requiring explicit reason and policy action;
- policy/use-case tests included in @pos/application test script.
```

Remaining follow-up:

```txt
- add Express/controller direct bypass tests;
- wire fine-grained RBAC permission claims into active cancel/refund/void policy input;
- run deferred browser/manual smoke during release gate.
```

## P8.1 — API Direct-Bypass Tests + RBAC Permission Mapping (2026-06-21)

Status: Implemented and validated.

- Added controller-level direct-bypass tests for order update, payment, and cancellation policy guards.
- Tightened active cancellation policy input so `orders:cancel_active` is derived from authenticated role context (`owner`, `manager`, `platform-admin`) instead of cancellation-reason presence.
- Audited refund/void/delete/trash order routes; they are not exposed in the current orders router and were not invented in this phase.
- Report: `roadmap/business-flows/P8_1_api_direct_bypass_tests_rbac_report.md`.
