# AuraPoS Order Lifecycle Documentation

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
- **Transition To**: `IN_PROGRESS` (when kitchen receives ticket) or `COMPLETED` (when fully paid)
- **Payment Status at this point**:
  - `UNPAID` (default after order creation)
  - Can transition to `PARTIALLY_PAID` after partial payment
  - Can transition to `PAID` after full payment
- **Example**: Order #1001 created for Table 5 with 2 lattes and 1 food item

---

### 3. **IN_PROGRESS** (Kitchen Processing)
- **What it is**: Order is currently being prepared in the kitchen
- **When it starts**: When kitchen ticket is sent/printed
- **Who manages this**: Kitchen staff via Kitchen Display System (KDS)
- **Possible Actions**:
  - Mark items as ready
  - Mark entire order as ready for serving
  - Mark order as completed
- **Transition To**: `COMPLETED` (when all items are prepared and served)
- **Example**: Kitchen staff mark all items ready → Order moved to "Ready" queue

---

### 4. **COMPLETED** (Order Finished)
- **What it is**: All items have been prepared and served to customer
- **When it starts**: When all items are marked complete in KDS
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
- Tracks **preparation progress**: CONFIRMED → IN_PROGRESS → COMPLETED
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
| IN_PROGRESS | UNPAID | Cooking but customer hasn't paid yet |
| IN_PROGRESS | PARTIALLY_PAID | Cooking, customer paid part |
| IN_PROGRESS | PAID | Cooking and customer paid |
| COMPLETED | PAID | Ready to serve, fully paid ✅ (ideal) |
| COMPLETED | UNPAID | Ready to serve but not paid (need to collect payment!) |

---

## Quick Charge Path (P2)

When order metadata (type + table) is pre-set, the POS terminal skips the order type dialog:

```
Cart Items → [Click "Charge"] → Skip Dialog → Payment Method → Process → Order Created + Paid (P3)
```

This is a **1-click checkout path** for counter service or pre-set table orders.

---

## Inventory Policy for Confirm / Quick-Pay Completion

Online order flows resolve a per-tenant inventory policy from `tenant_module_configs.config.inventory_policy` (or `inventoryPolicy`). Supported values are `strict` and `allow_negative`. If no override is configured, tenants with the inventory module enabled default to `strict`; tenants without the module default to `allow_negative` so order flow is not blocked by inventory operations.

- **Strict inventory**: tracked stock update and `inventory_movements` ledger insert must succeed before `/api/orders/:id/confirm`, kitchen-ticket auto-confirm, or quick-pay completion returns success. For quick-pay (`/api/orders/create-and-pay`), order, payment, stock update, and ledger insert are in the same database transaction.
- **Allow-negative inventory**: tracked stock can go below zero. If the stock/ledger movement fails, the order response can still proceed, but the failure is persisted in `inventory_sync_errors` with the tenant/order/product context and is picked up by the retry job. This replaces silent `.catch(() => {})` inventory failures.

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
Strict success → Order with payment recorded and inventory ledger updated ✅
Strict inventory failure → Transaction rolls back; cart can retry ✅
Allow-negative inventory failure → Order/payment remain; `inventory_sync_errors` retry/audit record is queued ✅
```

**Result**: Strict tenants keep order, payment, product stock, and inventory movement ledger in sync for quick-pay. Allow-negative tenants preserve order/payment availability while making inventory movement failures durable and retryable instead of silent.

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
  → Server delivers when ready → Mark order complete
  → Customer pays (if not pre-paid) → Receipt printed → Archived
```

### Workflow 2: Counter Service (Takeaway)
```
Customer orders at counter → POS: Select "Takeaway"
  → Add items → Click "Quick Charge" (1-click with preset type)
  → Order created + paid + sent to kitchen
  → Kitchen prepares → Customer waits/leaves
  → Pickup when ready → Order complete
```

### Workflow 3: Delivery
```
Customer orders via app/phone → POS: Select "Delivery" + delivery address
  → Add items → Payment processed online (external)
  → Mark as PAID, send to kitchen → Kitchen prepares
  → Delivery staff pickup → Mark COMPLETED when delivered
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
A: Order stays in IN_PROGRESS. You can close the POS order and continue with new orders. Kitchen will complete when ready.

**Q: Can customer pay later?**
A: Yes. Create order with UNPAID status, send to kitchen. Customer pays when convenient. Update payment status when they pay.

**Q: What about refunds?**
A: Not yet implemented. Current system: void order (don't mark complete) and create new order for corrected amount.

---

## Technical Implementation

### Database Schema
- `orders` table: `id`, `tenant_id`, `order_type_id`, `status`, `payment_status`, etc.
- `order_items` table: Links items to orders with quantity and prices
- `order_payments` table: Records all payments (full and partial)

### API Endpoints
- `POST /api/orders` - Create order (DRAFT)
- `PATCH /api/orders/:id` - Update order (move between states)
- `POST /api/orders/:id/confirm` - Confirm order (DRAFT → CONFIRMED)
- `POST /api/orders/:id/payments` - Record payment
- `POST /api/orders/create-and-pay` - Atomic create + pay (P3)
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
│ IN_PROGRESS │ (Kitchen preparing items)
└────┬────────┘
     │ All items ready & served
     ↓
┌─────────────┐
│ COMPLETED   │ (Order finished, archived)
└─────────────┘
```

---

## See Also
- [AuraPoS Architecture](./comprehensive-architecture-analysis.md)
- [P0-P3 Critical Fixes Documentation](../IMPLEMENTATION_STATUS.md)
