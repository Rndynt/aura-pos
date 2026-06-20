# Replit/Codex Prompt P5 — Restaurant Table Service POS Adapter + Legacy Mixed POS Cleanup

Repository: `Rndynt/AuraPoS`

## Goal

Implement the full `restaurant_table_service` POS flow adapter and clean up the remaining mixed/legacy POS runtime path created before the business-flow refactor.

This project is still in development. Backward compatibility with old mixed POS internals is **not required** for P5. Do not keep compatibility shims, mixed generic flow behavior, or legacy import paths if they are no longer needed.

After P5:

```txt
retail_standard -> RetailStandardPOSFlow
restaurant_table_service -> RestaurantTableServicePOSFlow
cafe_counter / quick_service / service_business_later / unknown -> explicit Unsupported/NotYetImplemented flow, not the old mixed GenericPOSPage
```

P5 must remove the old generic mixed POS behavior as an active runtime path. The point is to make business-profile routing explicit and remove legacy ambiguity.

## Phase dependencies

Read these first:

```txt
roadmap/business-flows/main.md
roadmap/business-flows/P0_current_pos_flow_audit.md
roadmap/business-flows/P1_business_flow_sot_report.md
roadmap/business-flows/P2_pos_lifecycle_runtime_fix_report.md
roadmap/business-flows/P2_1_lifecycle_hardening_patch_report.md
roadmap/business-flows/P3_pos_core_extraction_report.md
roadmap/business-flows/P4_retail_standard_adapter_report.md
roadmap/business-flows/P4_1_business_profile_resolver_pos_flow_gate_report.md
packages/domain/business-flows/**
packages/application/business-flows/**
apps/pos-terminal-web/src/features/pos-core/**
apps/pos-terminal-web/src/features/pos-flows/retail/**
apps/pos-terminal-web/src/features/pos-flows/root/**
apps/pos-terminal-web/src/features/pos/pages/POSPage.tsx
apps/pos-terminal-web/src/features/pos/pages/GenericPOSPage.tsx
```

Also inspect restaurant/kitchen/table code:

```bash
rg -n "restaurant|table|dining|kitchen|KDS|kitchenTicket|kitchen_ticket|send.*kitchen|tableNumber|table_id|tables" apps packages shared
```

## Non-negotiable direction

P5 is not a small compatibility patch. P5 is a cleanup/refactor phase.

Required direction:

```txt
- Implement a real restaurant_table_service adapter.
- Route restaurant_table_service to that adapter.
- Remove old mixed GenericPOSPage as active runtime fallback.
- Replace unknown/unimplemented profiles with explicit UnsupportedPOSFlow / NotYetImplementedPOSFlow.
- Migrate remaining imports away from old pos service/mapper compatibility shims.
- Delete compatibility re-export files if no longer needed.
- Keep POS route/profile resolution explicit.
```

## What must not be preserved

Do not preserve these just for compatibility:

```txt
- old mixed POS page as default fallback for all profiles;
- frontend inference from plan/entitlement absence;
- legacy re-export shims under `features/pos/services/*` and `features/pos/mappers/*` if imports can be migrated;
- restaurant behavior hidden inside retail/generic code;
- old `paymentStatus !== paid` draft classification;
- active/kitchen order editable cart path;
- pay-later active order accidentally created by retail flow;
- generic kitchen/table controls leaking into retail.
```

If any legacy file cannot be deleted safely in this PR, create a report section named **Remaining Legacy Blockers** with exact file, exact import chain, and exact deletion plan. But the target is deletion, not compatibility.

## Safety boundaries

Even though backward compatibility is not required, these safety rules remain mandatory:

```txt
- Do not remove standard POS payment methods such as cash/full payment.
- Do not remove existing retail_standard flow.
- Do not weaken P2/P2.1 lifecycle locks.
- Do not allow active/kitchen orders to enter normal editable cart path.
- Do not make orders_queue required for payment.
- Do not hardcode plan names.
- Do not guess profile from entitlement absence.
- Do not rewrite NorthFlow/payment orchestration.
- Do not delete data/schema unless explicitly required and documented.
```

## Restaurant Table Service canonical flow

For `restaurant_table_service`, implement this runtime flow:

```txt
1. Select table / dining context.
2. Add products to cart.
3. Send to Kitchen / Create kitchen ticket.
4. Order becomes active kitchen order.
5. Active kitchen order is visible in restaurant active order/table context.
6. Active kitchen order cannot be edited through normal retail cart.
7. Add-on items must go through an explicit add-item-to-existing-order / new kitchen ticket flow, not silent cart overwrite.
8. Order can move through kitchen statuses: confirmed/preparing/ready/served where existing APIs support it.
9. Payment happens after service/when guest pays.
10. Full payment records payment on existing active order and closes/removes it from active restaurant view.
```

Restaurant flow is **not**:

```txt
Cart -> immediate paid checkout by default
Cart -> accidental generic draft
Cart -> active order editable cart
Cart -> retail-style quick charge unless explicitly selected and supported
```

## Required target structure

Create:

```txt
apps/pos-terminal-web/src/features/pos-flows/restaurant/
  RestaurantTableServicePOSFlow.tsx
  useRestaurantTableServicePOSFlow.ts
  restaurantTableServiceFlowPolicy.ts
  restaurantOrderLifecyclePanel.tsx or RestaurantOrderLifecyclePanel.tsx
  RestaurantTableContextPanel.tsx
  index.ts
  __tests__/
```

Also update root flow:

```txt
apps/pos-terminal-web/src/features/pos-flows/root/POSFlowRoot.tsx
apps/pos-terminal-web/src/features/pos-flows/root/resolvePOSFlowComponent.ts
```

Add unsupported flow:

```txt
apps/pos-terminal-web/src/features/pos-flows/unsupported/UnsupportedPOSFlow.tsx
apps/pos-terminal-web/src/features/pos-flows/unsupported/index.ts
```

Optional shared adapter helpers:

```txt
apps/pos-terminal-web/src/features/pos-flows/shared/
```

Only create shared helpers if both retail and restaurant use them without mixing business decisions.

## Routing requirements

After P5, routing must be:

```txt
retail_standard -> RetailStandardPOSFlow
restaurant_table_service -> RestaurantTableServicePOSFlow
cafe_counter -> UnsupportedPOSFlow profile="cafe_counter"
quick_service -> UnsupportedPOSFlow profile="quick_service"
service_business_later -> UnsupportedPOSFlow profile="service_business_later"
null/unknown -> UnsupportedPOSFlow profile="unknown"
```

Do not route unsupported profiles to GenericPOSPage.

Remove or quarantine `GenericPOSPage` so it is not used as runtime fallback. If it still exists only temporarily for deletion reference, it must not be imported by `POSFlowRoot`.

## Business profile resolver

P4.1 already resolved:

```txt
restaurant / CAFE_RESTAURANT -> restaurant_table_service
```

P5 must verify this still works and add/adjust mappings only if existing business-type catalog clearly indicates restaurant/table-service.

Do not route cafe_counter to restaurant adapter unless business rules clearly say it is table service. Cafe adapter is P6.

## Restaurant flow policy

Create `restaurantTableServiceFlowPolicy.ts`.

It must define explicit restaurant booleans/actions:

```ts
businessProfile = 'restaurant_table_service'
showTableServiceActions = true
showKitchenActions = true
showActiveOrderQueueByDefault = true
allowFreshCreateAndPay = false by default
allowSendToKitchen = true
allowPayLaterActiveOrderCreation = true via Send to Kitchen only
allowServerDraft = true if explicit
allowLocalDraft = true if existing local/offline behavior supports it
allowRetailQuickCharge = false by default
allowLegacyActiveOrderCartEdit = false
allowLegacyActiveOrderDelete = false
requireOrdersQueueForPayment = false
```

Use P1 constants/profile/action ids where possible. Do not invent ad-hoc string ids if clean constants exist.

## Restaurant UI behavior

Restaurant adapter must show:

```txt
- Product grid
- Cart panel
- Table/dining context panel
- Send to Kitchen action
- Active restaurant order/lifecycle panel
- Payment dialog for existing active order
- Receipt behavior after payment
- Local draft support if safe
```

Restaurant adapter must not show:

```txt
- retail quick charge as default primary action
- generic old active/draft mixed sheet as the main workflow
- active/kitchen order normal edit cart path
- cart trash/delete for active kitchen order
- split-by-table behavior unless already safely implemented and entitlement-controlled
```

## Table context requirements

Use existing table hooks/API if available:

```txt
apps/pos-terminal-web/src/lib/api/tableHooks.ts
```

Restaurant flow must require/select a dining context before Send to Kitchen if table support exists.

Minimum acceptable behavior:

```txt
- If tables API exists and returns tables: user can select table.
- If no table is selected and table service requires table: Send to Kitchen is disabled with clear message.
- If API/table data is unavailable: fallback to manual table number/customer note if existing order payload supports it; otherwise block Send to Kitchen and document blocker.
```

Do not silently create table-service orders without any dining context unless the existing app already explicitly supports counter/no-table restaurant mode.

## Send to Kitchen requirements

Restaurant `Send to Kitchen` must:

```txt
- create or update an unpaid active order through existing order API path;
- create kitchen ticket through existing kitchen ticket payload/service path;
- clear cart after successful send;
- refresh active restaurant orders/lifecycle data;
- not record payment during Send to Kitchen;
- not mark order paid;
- not use retail create-and-pay as default;
- not require orders_queue entitlement;
- require restaurant_kitchen_ops or kitchen feature if current entitlement policy says kitchen ops is gated.
```

If the current backend/API lacks a clean send-to-kitchen call, use the existing current generic POS behavior as implementation reference, but extract it into restaurant adapter code. Do not keep it buried in GenericPOSPage.

## Active restaurant order behavior

Restaurant active order panel must use server lifecycle DTO fields from P2.1:

```txt
isEditableDraft
isActiveOrder
isKitchenLocked
allowedActions
lifecycleKind
lifecycleLabel
```

Rules:

```txt
- server_draft may resume into cart if explicitly draft and not kitchen locked;
- active_order / active_kitchen_order cannot resume into normal editable cart;
- active/kitchen orders show Detail/Pay/status controls only;
- paid_completed and cancelled orders are not shown as active work;
- active/kitchen order payment pays remaining amount only;
- unsafe item edits remain blocked by backend 409 locks.
```

## Add item to existing restaurant order

If adding items to an already-active table order is supported, implement it explicitly:

```txt
Active order -> Add Items -> temporary add-on cart -> Send Add-on to Kitchen -> new kitchen ticket / order item append
```

If existing backend lacks a safe append-item endpoint, do not hack it by reusing `PATCH /orders/:id` in a way that violates P2/P2.1 locks. Instead:

```txt
- hide Add Items for active kitchen order;
- report backend/app use case needed: AppendRestaurantOrderItems / CreateAdditionalKitchenTicket;
- keep payment/detail/status safe.
```

Do not silently overwrite fired items.

## Payment behavior

Restaurant payment must be on active existing order:

```txt
Active restaurant order -> Detail/Pay -> Payment dialog -> record payment -> close/paid -> removed from active list -> receipt
```

Rules:

```txt
- Full payment/cash remains available.
- Payment must not require orders_queue.
- Partial payment allowed only if payments_partial_payment entitlement exists and current dialog supports it safely.
- Multi payment allowed only if payments_multi_payment entitlement exists.
- Split bill behavior must not be exposed unless implemented safely for restaurant in a dedicated controlled UI.
- Remaining amount resolver from pos-core must be used.
- Do not create a second paid order from the active order payment cart.
```

## Cleanup requirements: remove legacy/compatibility

P5 must migrate imports to new flow/core paths and remove stale compatibility paths where possible.

Check and remove if unused:

```txt
apps/pos-terminal-web/src/features/pos/services/orderLifecycle.ts
apps/pos-terminal-web/src/features/pos/services/posOrderService.ts
apps/pos-terminal-web/src/features/pos/services/posPrinterService.ts
apps/pos-terminal-web/src/features/pos/mappers/cartToOrderPayload.ts
apps/pos-terminal-web/src/features/pos/mappers/orderToCart.ts
apps/pos-terminal-web/src/features/pos/mappers/receiptPayloadMapper.ts
apps/pos-terminal-web/src/features/pos/mappers/cfdPayloadMapper.ts
apps/pos-terminal-web/src/features/pos/mappers/kitchenTicketPayloadMapper.ts
apps/pos-terminal-web/src/features/pos/pages/GenericPOSPage.tsx
```

Use:

```bash
rg -n "features/pos/services|features/pos/mappers|GenericPOSPage|generic fallback|compatibility shim|legacy" apps/pos-terminal-web/src packages apps/api/src
```

Required outcome:

```txt
- No active runtime import from old compatibility re-export shims.
- No POS root import of GenericPOSPage.
- No generic mixed POS path for mapped profiles.
- No dead compatibility files left unless documented as Remaining Legacy Blockers.
```

If deletion breaks tests because some unrelated code still imports the old paths, update imports to `@/features/pos-core/...`.

## Backend/API constraints

P5 should prefer frontend/application refactor using existing backend APIs.

Only add backend use cases if needed for restaurant correctness, for example:

```txt
AppendRestaurantOrderItems
CreateAdditionalKitchenTicket
```

But do not add schema/migration unless unavoidable.

If backend use case is missing and cannot be implemented safely in P5, do not bypass locks. Document exact missing backend use case and keep unsafe UI hidden.

## Tests required

Add tests where harness exists.

### Policy tests

```txt
restaurantTableServiceFlowPolicy:
- businessProfile restaurant_table_service
- showKitchenActions true
- showTableServiceActions true
- allowFreshCreateAndPay false by default
- allowSendToKitchen true
- allowPayLaterActiveOrderCreation true via send-to-kitchen only
- requireOrdersQueueForPayment false
- allowLegacyActiveOrderCartEdit false
- allowLegacyActiveOrderDelete false
```

### Root routing tests

```txt
resolvePOSFlowComponent:
- retail_standard -> retail
- restaurant_table_service -> restaurant
- cafe_counter -> unsupported
- quick_service -> unsupported
- service_business_later -> unsupported
- null/unknown -> unsupported
```

### Restaurant flow helper tests

If helpers are pure, test:

```txt
- canSendToKitchen false when no table/dining context and table required
- canSendToKitchen false when cart empty
- canSendToKitchen false when kitchen entitlement missing if gated
- canSendToKitchen true when cart + table + kitchen entitlement ok
- active kitchen order cannot be converted to editable cart
- active order payment uses remaining amount resolver
```

### Component tests if harness exists

```txt
RestaurantTableServicePOSFlow:
- renders table context and Send to Kitchen action
- does not render retail quick-charge primary action
- active kitchen order row has Detail/Pay, not cart edit/delete
```

If component harness does not exist, add pure policy/helper tests and document manual smoke.

## Manual smoke checklist

Run if possible and document:

```txt
1. Restaurant tenant routes to RestaurantTableServicePOSFlow.
2. Retail tenant still routes to RetailStandardPOSFlow.
3. Cafe/quick/service/unknown routes to UnsupportedPOSFlow, not GenericPOSPage.
4. Restaurant cart with no table cannot Send to Kitchen if table required.
5. Restaurant table selected -> add products -> Send to Kitchen -> active kitchen order appears -> cart clears.
6. Active kitchen order cannot be edited/deleted through normal cart.
7. Active kitchen order Detail/Pay opens payment dialog and pays remaining amount only.
8. Paid active restaurant order disappears from active list and receipt works.
9. Retail flow still has no kitchen/table controls.
10. Full payment works without orders_queue.
```

Browser smoke is strongly recommended because this phase changes active routing.

## Required docs/report

Create:

```txt
roadmap/business-flows/P5_restaurant_table_service_full_refactor_report.md
```

Report must include:

```txt
1. Summary
2. Files changed/deleted
3. Restaurant adapter structure
4. POS root routing matrix after P5
5. Legacy/compatibility cleanup result
6. Remaining Legacy Blockers, if any
7. Restaurant table context behavior
8. Send to Kitchen behavior proof
9. Active kitchen order lifecycle/payment proof
10. Payment entitlement proof
11. Tests and validation output
12. Manual smoke result or not-run statement
13. Remaining risks deferred to P6/P7
14. Recommended next phase
```

Update:

```txt
roadmap/business-flows/main.md
PLANS.md
```

if the repo uses these as progress/task tracking.

## Validation commands

Run relevant commands:

```bash
pnpm --filter @pos/domain type-check
pnpm --filter @pos/application type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/terminal-web type-check
pnpm --filter @pos/application test
pnpm --filter @pos/api test
pnpm --filter @pos/terminal-web test
pnpm type-check
```

Also run an import/dead-code check manually with `rg`:

```bash
rg -n "GenericPOSPage|features/pos/services|features/pos/mappers|compatibility shim|legacy" apps/pos-terminal-web/src packages apps/api/src
```

Document exact findings.

## Completion checklist

- [x] RestaurantTableServicePOSFlow created.
- [x] useRestaurantTableServicePOSFlow created.
- [x] restaurantTableServiceFlowPolicy created.
- [x] Restaurant table/context panel created or existing table UI integrated.
- [x] Restaurant active order/lifecycle panel created or safely composed.
- [x] Send to Kitchen path owned by restaurant adapter.
- [x] Restaurant active/kitchen orders cannot enter editable cart.
- [x] Restaurant payment uses existing active order and remaining amount resolver.
- [x] Retail flow still works.
- [x] POS root routes retail -> retail adapter.
- [x] POS root routes restaurant_table_service -> restaurant adapter.
- [x] POS root routes unimplemented profiles -> UnsupportedPOSFlow.
- [x] Generic mixed POS fallback removed from active runtime.
- [x] Old compatibility shims/imports removed or blockers documented.
- [x] No orders_queue payment requirement added.
- [x] No plan/entitlement inference added.
- [x] Tests/validation documented.
- [x] P5 report created.

## Commit

```txt
feat(pos): add restaurant table service flow and remove mixed POS legacy
```
