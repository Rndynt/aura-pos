# AuraPoS Order Lifecycle Documentation

## Outlet-Scoped Access

Order reads and mutations are tenant-scoped and, when `req.outletId` is resolved, also outlet-scoped. Non-owner POS roles (`manager`, `cashier`, `kitchen`, `viewer`, and staff-style roles) must have an active `user_outlet_assignments` row for the requested outlet before the API exposes outlet data. Mutations that target existing orders verify the order belongs to both the current tenant and active outlet before status, payment, cancellation, completion, or kitchen-ticket changes are delegated to the order use cases.

## Overview

Orders in AuraPoS follow a well-defined lifecycle with clear state transitions. This document explains each stage and what operations are possible at each point.

---

## Order States

### 1. **DRAFT** (Initial State)
- **What it is**: Order items are selected but not yet confirmed
- **Where it happens**: Customer is adding items to cart in POS terminal
- **Duration**: While customer is browsing/adding items (not time-limited)
- **Possible Actions**:
  - Add items to cart
  - Remove items from cart
  - Modify item quantities
  - Change customer name or table number
  - Clear entire cart
  - **Cancel**: Discard all items without saving
- **Transition To**: `CONFIRMED` (when customer clicks "Charge/Order")
- **Example**: Customer adds 2 coffees and 1 sandwich to cart

---

### 2. **CONFIRMED** (Order Created)
- **What it is**: Order has been created in database, items are finalized
- **When it starts**: When customer clicks "Charge" or "Order" button
- **Possible Actions**:
  - Record payment (full or partial)
  - Send to kitchen (creates kitchen ticket)
  - Continue taking orders or view other orders
- **Transition To**: `PREPARING` (when kitchen starts work), `READY`, `SERVED`, then `COMPLETED` after fulfillment/financial close. Full payment alone does **not** change `status` to `COMPLETED`.
- **Payment Status at this point**:
  - `UNPAID` (default after order creation)
  - Can transition to `PARTIALLY_PAID` after partial payment
  - Can transition to `PAID` after full payment
- **Example**: Order #1001 created for Table 5 with 2 lattes and 1 food item

---

### 3. **PREPARING / READY / SERVED** (Fulfillment Processing)
- **What it is**: Order is moving through fulfillment after creation.
- **When it starts**: When kitchen/cashier starts fulfillment (`PREPARING`) or marks the order ready/served.
- **Who manages this**: Kitchen staff via Kitchen Display System (KDS) up to `SERVED`, or cashier/POS for non-kitchen fulfillment.
- **Possible Actions**:
  - Mark order as preparing
  - Mark order as ready
  - Mark order as served
  - Cashier completes financial close after payment is settled
- **Transition To**: `COMPLETED` only when fulfillment is done and cashier/POS performs completion.
- **Example**: Kitchen staff mark all items ready → Order moved to "Ready" queue → server marks served → cashier completes after payment.

---

### 4. **COMPLETED** (Order Finished)
- **What it is**: Order is finished/closed for reporting after fulfillment is complete and payment rules are satisfied.
- **When it starts**: When cashier/POS explicitly completes the order after kitchen/cashier fulfillment; kitchen-only screens stop at `SERVED`.
- **Possible Actions**:
  - View final amount
  - View payment history
  - Print receipt (if applicable)
  - Archive for reporting
- **No further transitions**: This is the final state
- **Example**: Customer received lattes and food → Order complete and archived

---

## Payment Status vs Order Status

These are **different concepts** that work together:

### Order Status (Fulfillment)
- Tracks **preparation/fulfillment progress**: CONFIRMED → PREPARING → READY → SERVED → COMPLETED
- Managed by: Kitchen staff (on KDS)
- Question it answers: "Is the food ready?"

### Payment Status (Finances)
- Tracks **payment progress**: UNPAID → PARTIALLY_PAID → PAID
- Managed by: Cashier/POS staff
- Question it answers: "Has the customer paid?"

### Valid Combinations
| Order Status | Payment Status | Meaning |
|---|---|---|
| CONFIRMED | UNPAID | Order created, not paid, not sent to kitchen |
| CONFIRMED | PARTIALLY_PAID | Customer paid part, still owes balance |
| CONFIRMED | PAID | Order created and fully paid, waiting to send to kitchen |
| PREPARING / READY / SERVED | UNPAID | Fulfillment active, customer has not paid yet |
| PREPARING / READY / SERVED | PARTIALLY_PAID | Fulfillment active, customer paid part |
| PREPARING / READY / SERVED | PAID | Fulfillment active and customer paid; still not financially closed |
| COMPLETED | PAID | Fulfillment complete and fully paid ✅ (normal financial close) |
| COMPLETED | UNPAID | Only allowed through explicit manager/override flows; otherwise blocked |

---

## Quick Charge Path (P2)

When order metadata (type + table) is pre-set, the POS terminal skips the order type dialog:

```
Cart Items → [Click "Charge"] → Skip Dialog → Payment Method → Process → Order Created + Paid, status remains CONFIRMED (P3)
```

This is a **1-click checkout path** for counter service or pre-set table orders. It records `payment_status=PAID` and `paid_amount`, but keeps operational `status=CONFIRMED` so the order remains visible until kitchen/cashier fulfillment completion. A non-kitchen quick sale may auto-complete only when the request explicitly sends validated `fulfillment_mode="instant"`.

---

## Inventory Policy for Confirm / Quick-Pay Payment

Online order flows resolve a per-tenant inventory policy from `tenant_module_configs.config.inventory_policy` (or `inventoryPolicy`). Supported values are `strict` and `allow_negative`. If no override is configured, tenants with the inventory module enabled default to `strict`; tenants without the module default to `allow_negative` so order flow is not blocked by inventory operations.

- **Strict inventory**: tracked stock update and `inventory_movements` ledger insert must succeed before `/api/orders/:id/confirm`, kitchen-ticket auto-confirm, or quick-pay payment returns success. For quick-pay (`/api/orders/create-and-pay`), order, payment, stock update, and ledger insert are in the same database transaction.
- **Allow-negative inventory**: tracked stock can go below zero. If the stock/ledger movement fails, the order response can still proceed, but the failure is persisted in `inventory_sync_errors` with the tenant/order/product context and is picked up by the retry job. This replaces silent `.catch(() => {})` inventory failures.


## Inventory Stock Policy

AuraPoS keeps fulfillment status and financial settlement separate from stock movement timing. The current stock policy is:

- Tracked stock is deducted on the first successful payment recording for an order, including the first partial payment.
- Additional payments on the same order do not deduct stock again; payment idempotency keys replay the prior payment instead of creating duplicate stock movements.
- Unpaid draft/confirmed orders do not deduct stock. Cancelling an unpaid order must not restore stock because no sale deduction happened.
- Cancelling a partially paid or paid order in a deducted lifecycle state restores stock through the existing cancel workflow. Refund/void endpoints are still not implemented as a separate public flow, so refund/void stock restoration remains a follow-up policy item.
- Basic Stock / Stok Dasar controls access to `/api/inventory/products`; Advanced Inventory remains separately gated for movement/report endpoints.

---

## Atomic Order+Payment (P3)

To prevent "orphaned orders" (order created but payment fails), AuraPoS uses atomic creation:

```
Customer clicks "Charge"
  ↓
Create Order + Record Payment in single endpoint (`/api/orders/create-and-pay`)
  ↓
Strict inventory tenant: also deduct tracked stock + insert inventory movement in the same transaction
Allow-negative tenant: commit order/payment first, then attempt stock movement; durable retry record is created if movement fails
  ↓
Strict success → Order with payment recorded, status still operationally active, and inventory ledger updated ✅
Strict inventory failure → Transaction rolls back; cart can retry ✅
Allow-negative inventory failure → Order/payment remain; `inventory_sync_errors` retry/audit record is queued ✅
```

**Result**: Strict tenants keep order, payment, product stock, and inventory movement ledger in sync for quick-pay. Allow-negative tenants preserve order/payment availability while making inventory movement failures durable and retryable instead of silent. In both policies, full payment does not automatically set `status=COMPLETED` unless `fulfillment_mode="instant"` is explicitly requested for a non-kitchen instant sale.

---

## Order Continuation (Resume Order)

If a customer returns or order isn't completed:

1. **Search for existing order** in order queue
2. **Click "Continue"** on that order
3. **Add new items** to existing order (if needed)
4. **Make additional payment** (if required)
5. **Send to kitchen again** (if items aren't cooking yet)

**URL format**: `/pos?continueOrderId=<order-id>`

---

## Typical Workflows

### Workflow 1: Dine-In Service
```
Customer arrives → Table assigned → POS: Select "Dine-In" + Table #
  → Add items to cart → Click "Charge" → Select payment method
  → Order created + sent to kitchen → Kitchen prepares
  → Server delivers when ready → Mark served
  → Customer pays (if not pre-paid) → Cashier marks completed → Receipt printed → Archived
```

### Workflow 2: Counter Service (Takeaway)
```
Customer orders at counter → POS: Select "Takeaway"
  → Add items → Click "Quick Charge" (1-click with preset type)
  → Order created + paid, status remains confirmed, then sent to kitchen
  → Kitchen prepares → Customer waits/leaves
  → Pickup when ready → Mark served/completed
```

### Workflow 3: Delivery
```
Customer orders via app/phone → POS: Select "Delivery" + delivery address
  → Add items → Payment processed online (external)
  → Mark as PAID, send to kitchen → Kitchen prepares
  → Delivery staff pickup → Mark SERVED/COMPLETED when delivered
```

### Workflow 4: Multiple Payments
```
Customer wants to split bill → POS: Create order, add items
  → Customer A pays partial ($20) → Order = PARTIALLY_PAID
  → Customer B pays remaining ($30) → Order = PAID
  → Send to kitchen (was already sent, or send now)
  → Serve when ready → Mark COMPLETED
```

---

## Common Questions

**Q: Can I edit an order after it's confirmed?**
A: Not directly. Standard POS workflow: create new order or continue existing order with additional items.

**Q: What if kitchen is slow?**
A: Order stays in `PREPARING`, `READY`, or `SERVED`. You can close the POS view and continue with new orders; kitchen/cashier will advance fulfillment when ready.

**Q: Can customer pay later?**
A: Yes. Create order with UNPAID status, send to kitchen. Customer pays when convenient. Update payment status when they pay.

**Q: What about refunds?**
A: Not yet implemented. Current system: void order (don't mark complete) and create new order for corrected amount.

---

## Technical Implementation

### Database Schema
- `orders` table: `id`, `tenant_id`, `order_type_id`, `status`, `payment_status`, etc.
- `order_number_sequences` table: tenant-scoped order number allocator keyed by `(tenant_id, business_date)` with `last_seq`. Order creation increments this row inside the database transaction with `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING last_seq`; `business_date` is derived from `tenants.timezone`, not the server UTC date.
- `order_items` table: Links items to orders with quantity and prices
- `order_payments` table: Records all payments (full and partial)

### API Endpoints
- `POST /api/orders` - Create order (DRAFT)
- `PATCH /api/orders/:id` - Update order (move between states)
- `POST /api/orders/:id/confirm` - Confirm order (DRAFT → CONFIRMED)
- `POST /api/orders/:id/payments` - Record payment
- `POST /api/orders/create-and-pay` - Atomic create + pay (P3); full payment keeps `status=confirmed` by default. Optional validated `fulfillment_mode="instant"` is the explicit non-kitchen auto-complete path.
- `POST /api/kitchen-tickets` - Create kitchen ticket (send to kitchen)

### React Hooks
- `useCreateOrder()` - Create new order
- `useUpdateOrder()` - Update order status
- `useRecordPayment()` - Record payment
- `useCreateAndPay()` - Atomic create + pay (P3)
- `useKitchenTicket()` - Send to kitchen

---

## State Diagram

```
┌─────────┐
│ DRAFT   │ (Items in cart, not saved)
└────┬────┘
     │ Click "Charge"
     ↓
┌─────────────┐
│ CONFIRMED   │ (Order created, items finalized)
└────┬────────┘
     │ Send to Kitchen
     ↓
┌─────────────┐
│ PREPARING   │ (Kitchen/cashier fulfilling items)
└────┬────────┘
     │ Ready, then served
     ↓
┌─────────────┐
│ SERVED      │ (Fulfillment done, bill may still be open)
└────┬────────┘
     │ Cashier/POS completion after payment
     ↓
┌─────────────┐
│ COMPLETED   │ (Financially closed, archived)
└─────────────┘
```

---

## See Also
- [AuraPoS Architecture](./comprehensive-architecture-analysis.md)
- [P0-P3 Critical Fixes Documentation](../IMPLEMENTATION_STATUS.md)

## POS Open-Order Lifecycle DTO (P2.1)

POS-facing order reads now include computed lifecycle fields so the terminal does not rely only on ad-hoc frontend status checks:

- `isEditableDraft`
- `isActiveOrder`
- `isKitchenLocked`
- `hasKitchenTicket`
- `hasFiredKitchenItems`
- `allowedActions`
- `lifecycleKind`
- `lifecycleLabel`

`GET /api/orders/open` is scoped to rows that are actionable in the POS draft/active sheet: editable server drafts and unpaid/partial active orders. Full-paid create-and-pay rows map to `paid_completed` and are excluded from Draft Server/Pesanan Aktif even when their operational status remains `confirmed` for fulfillment tracking.

Active-order payment from the POS sheet pays only the remaining amount (`remaining_amount` when supplied, otherwise `max(total - paidAmount, 0)`) and blocks payment if the remaining amount cannot be computed safely.

## Split Bill persistence and resume flow

Split Bill is persisted at two levels:

1. `order_bill_splits` stores bill identity, label, due amount, paid amount, and lifecycle status.
2. `order_bill_split_items` stores the order item assignments for each split bill, including item id, client bill id, quantity, and amount.

`clientBillId` remains the UI-stable bill identity such as `A` or `B`. `orderBillSplitId` is only the database UUID for `order_bill_splits`. The POS submit flow must not send `clientBillId` values as database UUIDs.

When a split bill is paid, the submit flow persists/updates the selected bill, persists selected item assignments, inserts idempotent payment rows, updates split paid/status, and updates order paid/status inside the same payment repository transaction. Reopening a partial order must hydrate `billSplits[].items[]`, lock paid bills/items, and default the cashier to the next unpaid bill. Split Bill item assignment supports allocating whole-number quantities from one order item row across multiple bills; quantities already attached to paid bills remain locked.
