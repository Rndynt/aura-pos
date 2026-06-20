# P0 Current POS Flow Audit & Freeze

Date: 2026-06-20
Scope source: `roadmap/business-flows/replit_codex_P0_current_pos_flow_audit_prompt.md`
Mode: **audit only** — no runtime code, schema, migration, route, UI, or entitlement behavior changed.

## 1. Executive summary

P0 confirms that the POS flow is still mixing at least five different business flows in one orchestration path:

1. standard retail/counter `Cart -> Bayar -> create-and-pay`;
2. server open-order/draft `Simpan Draft -> Lanjut -> updateOrder`;
3. restaurant table/kitchen `Simpan/Confirm -> Send to Kitchen -> KDS/status queue`;
4. partial/DP payment `create-and-pay` with partial amount plus optional kitchen send;
5. offline local order/draft/kitchen/receipt paths.

The largest risk is not tenant isolation at the route layer; most order mutations are tenant-scoped and many are outlet-checked. The largest P0 business-flow risk is semantic: **unpaid server orders are treated as "drafts" even when their operational status may already be `confirmed`, `preparing`, `ready`, or `served`.** The draft sheets load those orders into the editable cart and expose a trash/cancel action based primarily on `paymentStatus !== "paid"`, not on a true draft/editability rule.

Current standard retail payment for a fresh cart is safer than older two-step flows because it uses the atomic `/api/orders/create-and-pay` path through `useOfflineOrderSubmit`. However, paid create-and-pay orders remain operationally `confirmed` unless `fulfillment_mode="instant"` is passed, and the POS full-payment call does not pass `fulfillment_mode`. That means non-kitchen retail orders can remain in active/open operational queues after successful payment, depending on backend open-order filtering.

This P0 phase produced this report only. No runtime behavior changed.

## 2. Required search log

The required searches were run exactly against `apps packages shared` and saved during the audit session:

| Search | Result volume | Key observations |
|---|---:|---|
| `rg -n "CombinedDraftSheet|DraftOrdersSheet|continueOrderId|handleUpdateContinueOrder|handleCharge|Send to Kitchen|sendToKitchen|kitchen|KDS" apps packages shared` | 321 lines | POS page owns continue-order, charge, save draft, send kitchen; KDS/kitchen status code exists in app/domain/application. |
| `rg -n "paymentStatus|order.status|confirmed|preparing|ready|served|draft|completed|cancelled" apps packages shared` | 800 lines | Lifecycle terms are spread across POS UI, controllers, application/domain validators, repositories, and docs. |
| `rg -n "orders_queue|restaurant_kitchen_ops|requireTenantEntitlement|can\(|entitlement" apps packages shared` | 378 lines | Frontend gates queue and kitchen UI with `can`; backend gates kitchen ticket and partial payment but not standard order queue reads. |
| `rg -n "create-and-pay|recordPayment|useCreateAndPay|useRecordPayment|cancelOrder|updateOrder" apps packages shared` | 73 lines | Fresh payment uses create-and-pay; continued order mostly uses updateOrder; partial settlement uses recordPayment. |
| `rg -n "local draft|LocalDraft|deleteLocalDraftOrder|listLocalDraftOrders|createLocalOrder" apps packages shared` | 38 lines | Local draft/order code is isolated in offline package but surfaced in the same POS draft UI. |

## 3. Current POS action map

| User action | UI owner | API/use case called | Status/payment effect observed | Entitlement gate | Flow classification | P0 classification |
|---|---|---|---|---|---|---|
| Tambah item | `POSPage.handleAddToCart`, `ProductArea`, `ProductCardV2`, cart components | No API; local cart state only | Cart state only | Product variants/options are explicitly ungated | Shared core | SAFE_SHARED_CORE |
| Select product variants/options | `ProductOptionsDialog` opened by `POSPage.handleAddToCart` | No API | Cart state only | Ungated | Shared core | SAFE_SHARED_CORE |
| Bayar on fresh cart | `POSPage.handleCharge` opens `PaymentMethodDialog`; `handlePaymentMethodConfirm` submits | `useOfflineOrderSubmit`; online path posts `/api/orders/create-and-pay`; offline path creates local order | Online creates order + payment atomically; payment can become `paid`; operational status generally stays `confirmed` unless backend receives `fulfillment_mode="instant"` | Standard payment has cashier RBAC, no commercial entitlement; partial requires `payments_partial_payment` | Retail/counter shared core | SAFE_SHARED_CORE with ARCHITECTURE_LEAK for lifecycle close ambiguity |
| Bayar on continued unpaid order | `POSPage.handleCharge` | Most unpaid continued orders call `handleUpdateContinueOrder` -> `PATCH /api/orders/:id` | Replaces/updates items/pricing; does **not** record payment unless detected as partial | Cashier RBAC on backend | Server draft/open-order flow | BUG_CONFUSING_UX / BUG_FATAL depending on cashier expectation |
| Bayar on continued partial order | `POSPage.handleCharge` detects `paymentStatus === 'partial'`; `PaymentMethodDialog`; `handlePaymentMethodConfirm` | `POST /api/orders/:id/payments` via `useRecordPayment` | Records remaining amount as payment; can transition payment to paid | Backend requires `payments_partial_payment` only when request `payment_flow` is partial DP; settlement uses `full_payment` | Partial payment/settlement | BUSINESS_FLOW_SPECIFIC |
| Simpan Draft | `POSPage.handleSaveDraft` | Fresh: `POST /api/orders`; continued: `PATCH /api/orders/:id`; network fallback: local draft | Creates or updates server order using create/update order; label says draft but create use case may produce operational order status from backend default | Cashier RBAC for server; local fallback ungated except app session context | Server draft + local draft | ARCHITECTURE_LEAK |
| Lanjut server order | `CombinedDraftSheet`/`DraftOrdersSheet` -> `POSPage` URL `?continueOrderId=` -> `fetchOrderForPOS` -> `cart.loadOrder` | `GET /api/orders/:id` then local cart load | No backend mutation until later; loaded order can be edited in cart | Draft/open sheet itself not commercially gated; endpoint relies auth/tenant/outlet middleware | Draft/open/active order | BUG_FATAL for kitchen/active unpaid orders |
| Hapus server order | `CombinedDraftSheet` and older `DraftOrdersSheet` trash icon | `POST /api/orders/:id/cancel` via `useCancelOrder` | Cancels order through workflow; stock reversal may occur for paid/deducted orders | Cashier RBAC; no separate void/cancel entitlement found | Draft/open/active order | ENTITLEMENT_RISK + BUG_FATAL for kitchen active orders |
| Hapus local draft | `CombinedDraftSheet`, `LocalDraftOrdersSheet` | `deleteLocalDraftOrder` | Deletes local draft only | Local tenant cache context | Offline draft | SAFE_SHARED_CORE |
| Send to Kitchen / Confirm & Kitchen | `POSPage.handleConfirmAndKitchen` and `handleSendToKitchen` | Server: create/update order then `POST /api/orders/:id/kitchen-ticket`; offline: enqueue local kitchen ticket | Creates kitchen ticket; ticket status `pending`; order status is not clearly advanced by `CreateKitchenTicket` itself | Frontend `can("restaurant_kitchen_ops")`; backend `requireEntitlement('restaurant_kitchen_ops')` and `requireCashier` | Restaurant/kitchen | BUSINESS_FLOW_SPECIFIC with BUG_FATAL if still editable afterward |
| KDS/order queue status update | `ProductArea` renders `OrderQueue`; `POSPage.handleUpdateOrderStatus` | `PATCH /api/orders/:id/status`; KDS routes may call with kitchen mode | Kitchen mode limited to `confirmed/preparing/ready/served`; POS/cashier route allows through `completed/cancelled` with validator | UI order queue gated by `orders_queue`; backend status route uses `requireKitchen`, not `orders_queue` | Queue/kitchen fulfillment | BUSINESS_FLOW_SPECIFIC |
| Split bill | `PaymentMethodDialog` controlled by `allowSplitBill` | Not fully audited as a separate persisted split-bill use case in POS page; likely dialog/UI-level behavior | Unknown from inspected POS page | `payments_split_bill` or `payments_split_payment` | Payment-specific | UNKNOWN_NEEDS_CONFIRMATION |
| Multi payment | `PaymentMethodDialog` controlled by `allowMultiPayment` | Not visible as separate backend route in POS page | Unknown from inspected POS page | `payments_multi_payment` | Payment-specific | UNKNOWN_NEEDS_CONFIRMATION |
| Partial payment / DP | `PaymentMethodDialog`, `POSPage.handlePaymentMethodConfirm` | `POST /api/orders/create-and-pay` with `payment_flow="partial_payment_dp"` | Creates confirmed order and partial payment; optionally sends to kitchen | Frontend `payments_partial_payment`; backend enforces partial entitlement | Restaurant/cafe shared payment extension | BUSINESS_FLOW_SPECIFIC |
| Cancel/Void/Refund | Draft sheets expose cancel; orders page may expose settlement/payment actions | `POST /api/orders/:id/cancel`; no public refund/void flow found in P0 inspected paths | Cancels operational order; refund/void not a distinct public flow in current docs | Cashier RBAC, no separate commercial entitlement found | Financial/admin | ENTITLEMENT_RISK |
| Offline/local order submit | `useOfflineOrderSubmit`, POS payment path | Online `/api/orders/create-and-pay`; offline `createLocalOrder` queued for sync endpoint | Local order payload targets create-and-pay sync; local kitchen ticket optional | App-level tenant context; no backend until sync | Offline | BUSINESS_FLOW_SPECIFIC |

## 4. Current order lifecycle map

### Observed states

| State | Current meaning from code/docs | Current transition sources | P0 concern |
|---|---|---|---|
| Cart | In-memory POS state; not persisted | Product add/update/remove; local storage/session cart helpers | Shared correctly, but used as editor for server active orders. |
| Local Draft | IndexedDB/local persisted draft from save failure/offline draft action | `saveLocalDraftOrder`, `listLocalDraftOrders`, `deleteLocalDraftOrder` | Semantically closer to true draft; safe to edit/delete locally. |
| Server Draft/Open Order | Returned by `/api/orders/open`; UI filters unpaid orders as drafts | `POST /api/orders`, `PATCH /api/orders/:id`, open order query | The UI does not distinguish true draft from active unpaid/kitchen order. |
| Confirmed | Operational active order | create-and-pay and create/confirm paths; KDS status update | Paid retail order may remain confirmed/open unless explicit instant close. |
| Preparing | Kitchen/fulfillment active | status update route / KDS | Still included in open-order concepts and can be treated as editable if unpaid. |
| Ready | Kitchen/fulfillment ready | status update route / KDS | Same active-order edit risk if unpaid. |
| Served | Fulfillment delivered but bill can remain open | status update route / KDS | Pay-later restaurant valid, but should not be called draft. |
| Completed | Final order status | complete/status update/create-and-pay instant mode | Payment alone does not necessarily complete. |
| Cancelled | Cancelled order | cancel workflow/status update | Exposed through draft sheet trash for unpaid open orders. |
| Payment `unpaid` | No payment recorded | create order | Used by UI as draft proxy. |
| Payment `partial` | Some payment recorded | create-and-pay DP or record payment | Continued partial order routes to settlement, not update. |
| Payment `paid` | Fully paid | create-and-pay or record payment | Hidden from draft sheets; may still be operationally active. |

### Current transition graph (static audit)

```txt
Cart
  -> Local Draft                 (save draft network failure / local draft APIs)
  -> Server order/open           (POST /api/orders from Simpan Draft or Send Kitchen pre-save)
  -> Confirmed + Paid/Partial    (POST /api/orders/create-and-pay from Bayar)

Local Draft
  -> Cart                        (resume local draft)
  -> Deleted                     (delete local draft)
  -> Local queued order          (offline createLocalOrder path from payment)

Server order/open, unpaid
  -> Cart editor                 (Lanjut / continueOrderId)
  -> Updated/Repriced            (PATCH /api/orders/:id)
  -> Kitchen ticket pending      (POST /api/orders/:id/kitchen-ticket)
  -> Cancelled                   (POST /api/orders/:id/cancel)
  -> Partial/Paid                (recordPayment only if path reaches payment flow)

Confirmed/Preparing/Ready/Served
  -> Status updates              (PATCH /api/orders/:id/status)
  -> Cancelled                   (cancel workflow)
  -> Cart editor if unpaid       (current draft/open sheet risk)
  -> Paid                        (recordPayment)
  -> Completed                   (complete/status transition subject to validator)

Paid order
  -> Usually hidden from draft sheet
  -> May remain Confirmed/Preparing/Ready/Served operationally
  -> Completed only through explicit complete/status/instant fulfillment
```

## 5. Current entitlement map

| Capability | Frontend gate observed | Backend gate observed | Classification | Notes |
|---|---|---|---|---|
| Standard payment | None commercial; requires cart and selected order type | `requireCashier` on `/create-and-pay` | SAFE_SHARED_CORE | This is core POS behavior. |
| Order queue display | `can("orders_queue")` in `ProductArea` | `/api/orders/open`, `/api/orders`, SSE not visibly entitlement-gated in orders route | ENTITLEMENT_RISK | UI is gated; backend read/stream endpoints rely auth/tenant but not commercial entitlement. |
| Draft/open order sheet | Not gated by `orders_queue`; draft button count always includes open orders/local drafts | `/api/orders/open` not visibly commercial-gated | ARCHITECTURE_LEAK | Draft/open-order is effectively available outside order queue entitlement. |
| Send to kitchen / kitchen ticket | `can("restaurant_kitchen_ops")` | `requireEntitlement('restaurant_kitchen_ops')` on `/kitchen-ticket` | BUSINESS_FLOW_SPECIFIC | Good backend guard for ticket creation. |
| KDS/kitchen status | KDS pages/hub gated in navigation by `restaurant_kitchen_ops`; POS queue by `orders_queue` | `/api/orders/:id/status` uses `requireKitchen`; KDS routes use device/session controls | BUSINESS_FLOW_SPECIFIC | Need SOT separation between KDS entitlement and queue/status permissions. |
| Split bill | `payments_split_bill` or `payments_split_payment` | No specific backend split endpoint found in P0 POS path | UNKNOWN_NEEDS_CONFIRMATION | Needs P1 SOT decision. |
| Partial payment | `payments_partial_payment` | `requirePaymentEntitlement('payments_partial_payment')` for DP/partial create-and-pay and partial payment flow | BUSINESS_FLOW_SPECIFIC | Backend computes DP as explicit flow or amount less than estimated total. |
| Multi payment | `payments_multi_payment` | No specific backend multi-payment entitlement in inspected POS path | UNKNOWN_NEEDS_CONFIRMATION | `recordPayment` itself is core; multi-payment semantics need P1. |
| Cancel/void/refund | Trash/cancel no commercial gate found | `requireCashier` only on cancel route | ENTITLEMENT_RISK | Cancel is sensitive; refund/void distinct endpoint not identified in this audit path. |
| Customer display | `customer_display` | Not part of order backend | BUSINESS_FLOW_SPECIFIC | CFD updates are frontend side effects. |
| Receipt printer | No longer gate auto-print by entitlement; checks paired printer | Local/browser/offline services | BUSINESS_FLOW_SPECIFIC | Operational device behavior; not core P0 lifecycle issue. |

## 6. Current UI component ownership map

| Component/file | Ownership in current flow | Findings |
|---|---|---|
| `apps/pos-terminal-web/src/features/pos/pages/POSPage.tsx` | Central orchestrator for product add, cart, payment, draft save, continue order, send kitchen, offline order, receipt, CFD, KDS broadcast | Too many business flows in one page; uses `continueOrderId` as a generic edit mode, not a business-flow-specific continuation type. |
| `apps/pos-terminal-web/src/components/pos/CombinedDraftSheet.tsx` | Combined server open orders + local drafts sheet | Server list filters unpaid orders only; exposes continue and cancel/trash for all unpaid open orders. |
| `apps/pos-terminal-web/src/components/pos/DraftOrdersSheet.tsx` | Older server draft sheet | Same unpaid-as-draft pattern; `@ts-nocheck` indicates weak type safety in a sensitive flow. |
| `apps/pos-terminal-web/src/components/pos/ProductArea.tsx` | Product browsing, category search, draft button, optional order queue | Order queue gated by `orders_queue`; draft count/open sheet are not tied to that entitlement. |
| `apps/pos-terminal-web/src/components/pos/ProductCardV2.tsx` | Product card add CTA | Product selection only; not business-flow-specific beyond availability display. |
| `apps/pos-terminal-web/src/features/pos/components/CartSection.tsx` | Desktop/mobile cart panel wrapper | Forwards all action handlers; business logic remains in POSPage. |
| `apps/pos-terminal-web/src/hooks/useCart.ts` | In-memory cart and order load mapper | `loadOrder` maps server order items into editable cart rows without checking order status/payment/kitchen ticket editability. |
| `apps/pos-terminal-web/src/hooks/useOfflineOrderSubmit.ts` | Online create-and-pay with offline local fallback | Bridges standard payment and offline sync; safer for fresh payment but adds another lifecycle variant. |
| `apps/pos-terminal-web/src/lib/api/hooks.ts` | Frontend React Query mutations for create, update, payment, kitchen ticket, create-and-pay | Clear API wrappers, but UI decides business-flow semantics. |
| `apps/pos-terminal-web/src/lib/api/tableHooks.ts` | Tables and open orders query hooks | `useOpenOrders` exposes server open orders as a generic list used by draft sheets. |

## 7. Current backend endpoint/use-case ownership map

| Endpoint/hook | Controller/use case/repository path | Current responsibility | P0 classification |
|---|---|---|---|
| `POST /api/orders` / `useCreateOrder` | `OrdersController.createOrder` -> `container.createOrder` | Creates order with items/pricing; used by "Simpan Draft" and pre-kitchen save | ARCHITECTURE_LEAK because same endpoint is used as draft/open-order primitive. |
| `PATCH /api/orders/:id` / `useUpdateOrder` | `OrdersController.updateOrder` -> `UpdateOrder` -> repository `updateWithItems` | Replaces/recalculates order items/pricing | BUG_FATAL for active kitchen/unpaid orders because use case does not enforce draft-only editability. |
| `POST /api/orders/create-and-pay` / `useCreateAndPay` / `useOfflineOrderSubmit` | `OrdersController.createAndPay` -> `CreateAndPayOrder` repo | Atomic order+payment; can enforce partial entitlement; payment/fulfillment separate | SAFE_SHARED_CORE; lifecycle close mode needs explicit P1/P2 rule. |
| `POST /api/orders/:id/payments` / `useRecordPayment` | `OrdersController.recordPayment` -> `RecordPayment` -> `DrizzleRecordPaymentRepository` | Adds payment with row-lock/idempotency support | SAFE_SHARED_CORE for settlement; entitlement only partial-specific. |
| `POST /api/orders/:id/kitchen-ticket` / `useCreateKitchenTicket` | `OrdersController.createKitchenTicket` -> `CreateKitchenTicket` | Creates ticket from pending/preparing items | BUSINESS_FLOW_SPECIFIC; does not by itself make order uneditable in current update flow. |
| `PATCH /api/orders/:id/status` | `OrdersController.updateOrderStatus` -> transition use cases | Operational status transitions; kitchen mode restricts fulfillment statuses | BUSINESS_FLOW_SPECIFIC. |
| `POST /api/orders/:id/cancel` / `useCancelOrder` | `OrdersController.cancelOrder` -> `CancelOrderWorkflow` | Cancels order and handles stock reversal policy | ENTITLEMENT_RISK when exposed as draft-trash. |
| `GET /api/orders/open` / `useOpenOrders` | `OrdersController.listOpenOrders` -> `ListOpenOrders` | Lists open orders by tenant/outlet | ARCHITECTURE_LEAK because output is consumed as draft list. |
| `GET /api/orders` / `useOrders` | `OrdersController.listOrders` | General order list used for POS queue and partial lookup | BUSINESS_FLOW_SPECIFIC depending on UI. |
| `GET /api/orders/:id` / `fetchOrderForPOS` | `OrdersController.getOrderById` | Fetch full order for cart loading | BUG_FATAL unless P2 adds editability guard before cart load. |

## 8. Retail standard flow findings

1. **Fresh standard payment uses atomic create-and-pay.**
   Classification: SAFE_SHARED_CORE.
   `POSPage` full payment calls `submitOrder`, which sends items, order type, amount, and payment method; `useOfflineOrderSubmit` uses `/api/orders/create-and-pay` online and local order fallback offline. This prevents the older orphaned order pattern for fresh checkout.

2. **Paid quick-sale operational status can remain `confirmed`.**
   Classification: ARCHITECTURE_LEAK / BUG_CONFUSING_UX.
   The backend create-and-pay repository only sets order `status='completed'` when `fulfillment_mode === 'instant'`; POS full payment does not pass that mode. For retail tenants without kitchen/order queue, the user expectation is usually "paid sale is closed". Current lifecycle intentionally separates payment and fulfillment, but there is no POS business-flow SOT deciding when a non-kitchen retail/counter sale should auto-complete.

3. **Continued unpaid order + Bayar can update instead of pay.**
   Classification: BUG_FATAL for standard POS.
   When `continueOrderId` exists, `handleCharge` only opens payment for `paymentStatus === 'partial'`; other unpaid orders go to `handleUpdateContinueOrder`, which patches order items/pricing and clears cart. A cashier clicking Bayar after loading an unpaid draft/open order may not record payment.

## 9. Restaurant/kitchen flow findings

1. **Send to Kitchen creates a kitchen ticket but editability remains undefined.**
   Classification: BUG_FATAL.
   `handleConfirmAndKitchen` creates or updates the order, calls kitchen ticket creation, and clears cart. The kitchen ticket use case rejects only cancelled/no-item/no-pending-item cases. It does not set an order-level "kitchen locked" state; `UpdateOrder` does not reject editing an order that already has kitchen tickets or active statuses.

2. **Active kitchen orders can be surfaced in draft/open sheets.**
   Classification: BUG_FATAL.
   `CombinedDraftSheet` and `DraftOrdersSheet` filter server rows by `paymentStatus !== "paid"`. A restaurant pay-later order in `confirmed`, `preparing`, `ready`, or `served` can be unpaid by design and therefore appear as a draft/open order with Lanjut and trash actions.

3. **Kitchen status transition model exists and is safer than POS draft semantics.**
   Classification: SAFE_SHARED_CORE / BUSINESS_FLOW_SPECIFIC.
   Backend status route supports a kitchen mode restricted to `confirmed`, `preparing`, `ready`, and `served`; domain/application code has dedicated fulfillment transition concepts. The unsafe part is not the KDS transition map itself, but that POS draft/open editing bypasses an explicit lifecycle editability model.

4. **Offline kitchen behavior is best-effort local-only.**
   Classification: BUSINESS_FLOW_SPECIFIC.
   Offline successful local orders can enqueue local kitchen tickets and broadcast to local KDS. This is operationally useful, but P1/P2 must define reconciliation semantics when the same local order later syncs to the server.

## 10. Cafe/counter flow findings

Cafe/counter is not explicit as a first-class flow in the audited POS page. It currently shares the same standard payment path, order type selection, optional kitchen ticket, and payment dialog behavior.

Findings:

- Classification: BUSINESS_FLOW_SPECIFIC. Counter service may require `Cart -> Pay -> kitchen/counter queue -> served/completed` rather than retail instant complete.
- Classification: UNKNOWN_NEEDS_CONFIRMATION. The code does not clearly distinguish cafe counter from retail, except through enabled tenant order types and optional kitchen entitlement.
- Classification: ARCHITECTURE_LEAK. P1 should decide whether counter orders are instant financial close, active fulfillment orders, or a configurable flow per order type/business type.

## 11. Draft/local draft/open order findings

| Finding | Classification | Details |
|---|---|---|
| Server "draft" means unpaid open order in UI | ARCHITECTURE_LEAK | `CombinedDraftSheet` and `DraftOrdersSheet` call server open orders drafts and filter by `paymentStatus !== "paid"`. |
| True local drafts are safer than server drafts | SAFE_SHARED_CORE | Local drafts are device-local, explicit draft records that can be resumed/deleted without backend order lifecycle side effects. |
| Server draft save uses order creation endpoint | ARCHITECTURE_LEAK | `Simpan Draft` creates a real server order via `POST /api/orders`; whether it is a true draft depends on backend default status. |
| Continue order is generic editable mode | BUG_FATAL | `continueOrderId` loads any fetched order into cart; no frontend or backend use-case guard says only true drafts can be edited. |
| Delete/trash is actually cancel order | ENTITLEMENT_RISK | Trash icon calls cancel workflow, not "delete draft"; unsafe for active pay-later/kitchen orders. |

## 12. Kitchen safety answers

| Question | Current answer | Classification |
|---|---|---|
| What happens after Send to Kitchen? | POS creates/updates order, then creates a kitchen ticket. Ticket status starts `pending`; order status is not necessarily advanced by `CreateKitchenTicket`. | BUSINESS_FLOW_SPECIFIC |
| Does the order become confirmed/preparing/ready/served? | Not by `CreateKitchenTicket` itself in inspected use case; status movement is separate through status endpoints/KDS. | UNKNOWN_NEEDS_CONFIRMATION |
| Is a kitchen ticket created? | Yes for online if backend entitlement/RBAC pass; offline creates local ticket best-effort. | SAFE_SHARED_CORE |
| Can the order still be loaded into cart? | Yes if it appears in open/unpaid lists and the user clicks Lanjut; `loadOrder` has no lifecycle guard. | BUG_FATAL |
| Can it still be deleted via trash? | Yes from draft/open sheet if unpaid, by calling cancel workflow. | BUG_FATAL / ENTITLEMENT_RISK |
| Can fired kitchen items be edited? | No direct guard found in `UpdateOrder`; it rebuilds items and marks new item statuses `pending`. | BUG_FATAL |
| Can active kitchen orders be paid without cart edit? | Partial orders can be settled via payment dialog if detected as `partial`; unpaid active orders route to update, not payment, from continue flow. Orders page has a separate `useRecordPayment` settlement path. | BUG_CONFUSING_UX |

## 13. Standard POS safety answers

| Question | Current answer | Classification |
|---|---|---|
| Can tenant without `restaurant_kitchen_ops` and without `orders_queue` do Cart -> Bayar -> paid/completed? | It can do Cart -> Bayar -> create-and-pay -> payment `paid`; operational status may stay `confirmed`, not necessarily `completed`. | ARCHITECTURE_LEAK |
| Does it enter draft/open-order unexpectedly? | It can remain operationally open/confirmed after payment depending on backend open-order filtering; the UI hides paid orders from draft sheet but order queue/open APIs may still consider operational status open. | BUG_CONFUSING_UX |
| Does continued draft payment actually pay, or only update the order? | Continued partial order can pay remaining balance. Continued unpaid non-partial order currently updates order only. | BUG_FATAL |

## 14. Critical bugs and unsafe behavior

1. **BUG_FATAL — active unpaid kitchen/pay-later orders are treated as editable drafts.**
   Evidence: draft sheets filter `paymentStatus !== "paid"`; continue loads order into cart; update use case does not enforce draft-only status.

2. **BUG_FATAL — Bayar on continued unpaid non-partial order patches order rather than recording payment.**
   Evidence: `handleCharge` branches `continueOrderId` to `handleUpdateContinueOrder` unless `paymentStatus === 'partial'`.

3. **BUG_FATAL — fired kitchen items can be replaced by update order.**
   Evidence: `UpdateOrder` reconstructs all order items as pending items and repository update replaces items; no kitchen-ticket/item status guard was found in the audited use case.

4. **ENTITLEMENT_RISK — cancel/void exposed as draft trash.**
   Evidence: trash button invokes cancel order workflow for server open orders; no cancel/void entitlement beyond cashier RBAC was found in orders route.

5. **ENTITLEMENT_RISK — order queue/open-order backend is not commercially gated like UI.**
   Evidence: frontend `ProductArea` gates `OrderQueue` with `orders_queue`, but `/api/orders/open` route is not visibly guarded by `requireEntitlement('orders_queue')`.

6. **ARCHITECTURE_LEAK — server order creation is used as "save draft" without a true draft SOT.**
   Evidence: `handleSaveDraft` calls `createOrderMutation` and labels the result as draft.

7. **BUG_CONFUSING_UX — paid retail order may remain operationally confirmed.**
   Evidence: backend create-and-pay only completes on explicit `fulfillment_mode='instant'`; POS does not pass it.

8. **UNKNOWN_NEEDS_CONFIRMATION — split bill/multi-payment backend semantics.**
   Evidence: POS passes entitlement booleans to `PaymentMethodDialog`, but no separate split/multi-payment endpoint/use case was confirmed in this P0 scope.

## 15. Refactor risk register

| Risk | Impact | Likelihood | Required mitigation before P2 |
|---|---|---:|---|
| Changing create-and-pay completion behavior could break restaurant/cafe fulfillment queues | High | High | P1 must define business-flow SOT and order-type fulfillment mode before code change. |
| Locking all unpaid orders could break legitimate restaurant pay-later settlement | High | Medium | Separate payment settlement from cart item editing. |
| Adding backend entitlement to `/open` could break draft sheet for tenants relying on drafts without queue entitlement | Medium | High | Decide if draft/open orders is a core feature or paid queue feature. |
| Preventing `PATCH /orders/:id` for active statuses may block intended add-on item behavior | Medium | Medium | Introduce explicit add-items flow for active restaurant orders, not generic replacement. |
| Changing cancel/trash semantics may leave no way to discard true drafts | Medium | Medium | Add true draft delete vs active order cancel/void policy. |
| Offline local order sync may duplicate kitchen tickets if online kitchen ticket is also created | Medium | Unknown | Define idempotent local order/kitchen ticket sync keys. |
| Moving logic out of POSPage may cause regressions in CFD, receipt print, and offline side effects | Medium | High | Refactor in slices after P1 SOT with tests around side effects. |

## 16. Recommended P1 SOT requirements

P1 should create a business-flow single source of truth before any runtime refactor:

1. Define canonical flow types:
   - `retail_instant_checkout`;
   - `cafe_counter_checkout`;
   - `restaurant_table_service_pay_later`;
   - `restaurant_table_service_pay_first`;
   - `draft_quote_or_hold`;
   - `offline_local_order`.
2. Define order editability as a first-class policy:
   - true draft editable;
   - confirmed unpaid but not fired may be editable only by explicit policy;
   - kitchen ticket created/fired items not replaceable;
   - preparing/ready/served not cart-editable;
   - paid orders not cart-editable, only refund/void/adjustment flows.
3. Define cancel/delete/void/refund policy separately:
   - delete local draft;
   - delete true server draft;
   - cancel active unpaid order;
   - void/refund paid order;
   - manager override requirements.
4. Define payment-flow policy:
   - full payment fresh cart;
   - settle existing unpaid active order without cart edit;
   - partial/DP creation;
   - split bill/multi-payment contract.
5. Define fulfillment policy per order type/business type:
   - instant completion allowed only for retail/non-kitchen order types;
   - counter/kitchen order remains active after payment;
   - restaurant pay-later can be served before payment.
6. Define entitlement SOT:
   - core POS payment;
   - true draft/open-order feature;
   - order queue display;
   - restaurant kitchen/KDS;
   - partial/split/multi payment;
   - cancel/void/refund permissions.
7. Define API contracts:
   - `createDraft` vs `createOrder` vs `createAndPay`;
   - `continueDraft` vs `settleOrder` vs `addItemsToActiveOrder`;
   - kitchen-ticket idempotency and item lock semantics.
8. Define UI language:
   - do not call active unpaid restaurant orders "draft";
   - distinguish Draft, Open Bill, Kitchen Active, Ready/Served, Paid Pending Fulfillment.

## 17. Recommended P2 lifecycle fix requirements

P2 should implement lifecycle fixes only after P1 SOT is accepted:

1. Add backend editability guard to `PATCH /api/orders/:id` / `UpdateOrder`:
   - allow only true draft or explicit add-item states;
   - reject active kitchen/served/paid orders for replacement edits.
2. Split POS continue actions:
   - Continue Draft -> cart edit;
   - Open Bill -> payment/settlement view;
   - Kitchen Active -> read-only detail + pay/add-item actions;
   - Local Draft -> cart edit.
3. Replace unpaid filter in draft sheets with lifecycle-aware groups.
4. Make `Bayar` on continued unpaid order open settlement/payment, not update-only, unless the action is explicitly "Simpan Perubahan".
5. Add separate true draft delete vs active cancel/void UI labels and permission checks.
6. Decide and implement `fulfillment_mode="instant"` for retail tenants/order types only when safe.
7. Backend-gate or explicitly core-allow `/api/orders/open` and queue stream according to entitlement SOT.
8. Add tests:
   - unpaid `preparing` order cannot be loaded/updated as draft;
   - trash cannot silently cancel active kitchen order from draft sheet;
   - continued unpaid order can be settled;
   - retail fresh payment completes or remains confirmed according to SOT;
   - cross-tenant/outlet guards remain intact.

## 18. Files that must not be touched yet

P0 is audit-only. These files are high-risk and must not be changed until P1/P2 tasks explicitly authorize implementation:

- `apps/pos-terminal-web/src/features/pos/pages/POSPage.tsx`
- `apps/pos-terminal-web/src/components/pos/CombinedDraftSheet.tsx`
- `apps/pos-terminal-web/src/components/pos/DraftOrdersSheet.tsx`
- `apps/pos-terminal-web/src/components/pos/ProductArea.tsx`
- `apps/pos-terminal-web/src/hooks/useCart.ts`
- `apps/pos-terminal-web/src/hooks/useOfflineOrderSubmit.ts`
- `apps/pos-terminal-web/src/lib/api/hooks.ts`
- `apps/pos-terminal-web/src/lib/api/tableHooks.ts`
- `apps/api/src/http/controllers/OrdersController.ts`
- `apps/api/src/http/routes/orders.ts`
- `packages/application/orders/**`
- `packages/application/payments/**`
- `packages/application/entitlements/**`
- `packages/infrastructure/repositories/orders/**`
- `packages/infrastructure/db/schema/orders.schema.ts`
- `shared/schema.ts`

## 19. P0 validation statement

- No runtime code changed in P0.
- Audit completed from static code inspection.
- No behavior changed.
- No full test run was required for this audit-only phase.
