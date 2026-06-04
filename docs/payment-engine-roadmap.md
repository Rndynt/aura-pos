# AuraPoS Generic Payment Engine Roadmap

> Status: Planning document for a new independent Payment Engine module.
> Target: Build a reusable, extensible, tenant-aware payment foundation without breaking the current legacy order payment flow.
> Repository: AuraPoS
> Last updated: 2026-06-04

---

## 1. Executive Summary

AuraPoS currently has a working order-level payment flow based on `orders` and `order_payments`. That flow should remain untouched during the initial Payment Engine build.

This roadmap defines a new independent Payment Engine that can support multiple business types and payment scenarios:

- Instant cash payment
- Manual card payment
- Manual e-wallet / QRIS payment
- Multi-payment in a single checkout
- Partial payment / deposit / down payment
- Later payment settlement
- Refund and void flows
- Payment gateway integration
- Webhook-based payment confirmation
- Future customer receivables / ledger integration
- Future stock reservation integration
- Future split bill allocation

The engine must be generic and must not be tightly coupled to `orders`. Instead, it should use a generic payable reference.

---

## 2. Design Principles

### 2.1 Do not break existing payment flow

The existing `order_payments` based flow must continue to work. The new engine must be built in parallel.

Do not rewrite these in Phase 1:

- `packages/application/orders/RecordPayment.ts`
- `packages/application/orders/CreateAndPayOrder.ts`
- `apps/api/src/http/routes/orders.ts`
- existing `/api/orders/:id/payments`
- existing `/api/orders/create-and-pay`

The new module should use new files, new tables, and new endpoints.

### 2.2 Engine must be generic

The engine must not assume every payment belongs to an order.

Use a generic payable model:

- `payable_type`
- `payable_id`

Possible payable types:

- `order`
- `invoice`
- `customer_account`
- `wallet_topup`
- `agent_credit`
- `subscription`
- `manual_receivable`

### 2.3 Payment lifecycle and fulfillment lifecycle are separate

Payment status must not automatically complete operational workflow.

Examples:

- Restaurant order can be paid but still preparing.
- Laundry order can be partially paid but still in progress.
- Retail booking can be partially paid while stock is reserved.
- PPOB customer transaction must not be submitted to provider before full payment.

### 2.4 Gateway-ready from the beginning

The engine must support asynchronous provider flows:

1. Create payment intent.
2. Create pending transaction.
3. Provider returns payment URL / QR string / reference.
4. Customer pays.
5. Provider sends webhook.
6. Engine verifies webhook.
7. Engine marks transaction as succeeded or failed.
8. Engine recalculates intent status.

### 2.5 Strong idempotency

Payment creation and webhook processing must be idempotent.

Required idempotency layers:

- manual payment idempotency key
- gateway transaction provider reference uniqueness
- webhook event uniqueness
- transaction-safe row lock when updating payment intent totals

### 2.6 Transactional consistency

When recording a payment, the engine must lock the payment intent row before calculating remaining balance.

A payment must not be able to overpay accidentally because of concurrent requests.

---

## 3. High-Level Architecture

New module locations:

```text
packages/domain/payments/
packages/application/payments/
packages/infrastructure/repositories/payments/
apps/api/src/http/controllers/PaymentEngineController.ts
apps/api/src/http/routes/payment-engine.ts
```

The engine should follow the existing AuraPoS layering style:

- Domain: types, status enums, lifecycle rules, provider interfaces.
- Application: use cases and orchestration.
- Infrastructure: Drizzle repositories and provider implementations.
- API: validation, HTTP controllers, route registration.

---

## 4. Core Domain Concepts

## 4.1 Payment Intent

A Payment Intent represents a payable amount that needs to be collected.

It is the canonical payment state container.

Example:

```text
Order total: Rp100,000
Payment intent amount_due: 100000
Payment intent amount_paid: 0
Payment intent amount_remaining: 100000
Status: requires_payment
```

After a partial payment:

```text
Payment amount: Rp30,000
Payment intent amount_paid: 30000
Payment intent amount_remaining: 70000
Status: partially_paid
```

After full settlement:

```text
Payment intent amount_paid: 100000
Payment intent amount_remaining: 0
Status: paid
```

## 4.2 Payment Transaction

A Payment Transaction represents a money movement attempt or result.

It can be synchronous:

- cash succeeded immediately
- manual card succeeded immediately

Or asynchronous:

- gateway pending
- QRIS pending
- transfer pending
- webhook later confirms payment

## 4.3 Payment Allocation

A Payment Allocation maps a successful transaction amount to a target.

This is needed for future split bill, invoice line payment, and customer ledger payment.

Phase 1 may create only default order-level allocations, but the table should exist from the beginning to avoid later schema redesign.

## 4.4 Provider Event

A Provider Event stores raw gateway webhook events.

This prevents duplicate webhook processing and gives auditability.

---

## 5. Database Schema Roadmap

Add the following tables to `shared/schema.ts` and generate a Drizzle migration.

### 5.1 `payment_intents`

Required columns:

```text
id uuid primary key defaultRandom
tenant_id uuid not null references tenants(id) on delete cascade
outlet_id uuid nullable references outlets(id) on delete set null
payable_type varchar(64) not null
payable_id varchar(128) not null
currency varchar(3) not null default 'IDR'
amount_due decimal(12,2) not null
amount_paid decimal(12,2) not null default '0'
amount_refunded decimal(12,2) not null default '0'
amount_remaining decimal(12,2) not null
status varchar(50) not null default 'requires_payment'
allow_partial boolean not null default false
expires_at timestamp nullable
metadata jsonb nullable
idempotency_key varchar(128) nullable
created_at timestamp not null default current_timestamp
updated_at timestamp not null default current_timestamp
```

Suggested indexes:

```text
payment_intents_tenant_idx on tenant_id
payment_intents_outlet_idx on outlet_id
payment_intents_payable_idx on tenant_id, payable_type, payable_id
payment_intents_status_idx on tenant_id, status
payment_intents_created_at_idx on created_at
payment_intents_tenant_idempotency_unique unique on tenant_id, idempotency_key where idempotency_key is not null
```

Status enum:

```text
requires_payment
partially_paid
paid
overpaid
cancelled
expired
refunded
partially_refunded
```

### 5.2 `payment_transactions`

Required columns:

```text
id uuid primary key defaultRandom
tenant_id uuid not null references tenants(id) on delete cascade
payment_intent_id uuid not null references payment_intents(id) on delete cascade
direction varchar(20) not null default 'incoming'
transaction_type varchar(50) not null default 'payment'
method varchar(50) not null
provider varchar(50) not null default 'manual'
status varchar(50) not null default 'pending'
amount decimal(12,2) not null
received_amount decimal(12,2) nullable
change_amount decimal(12,2) nullable
provider_reference varchar(255) nullable
provider_payment_url text nullable
provider_qr_string text nullable
failure_reason text nullable
idempotency_key varchar(128) nullable
metadata jsonb nullable
created_at timestamp not null default current_timestamp
updated_at timestamp not null default current_timestamp
succeeded_at timestamp nullable
failed_at timestamp nullable
cancelled_at timestamp nullable
```

Suggested indexes:

```text
payment_transactions_tenant_idx on tenant_id
payment_transactions_intent_idx on payment_intent_id
payment_transactions_status_idx on tenant_id, status
payment_transactions_provider_reference_idx on provider, provider_reference
payment_transactions_tenant_idempotency_unique unique on tenant_id, idempotency_key where idempotency_key is not null
payment_transactions_provider_reference_unique unique on provider, provider_reference where provider_reference is not null
```

Status enum:

```text
pending
requires_action
succeeded
failed
cancelled
voided
refunded
```

Transaction type enum:

```text
payment
deposit
settlement
refund
void
adjustment
```

Method enum:

```text
cash
card
qris
ewallet
bank_transfer
customer_credit
other
```

Provider enum should be extensible string values, not a hard-coded closed enum:

```text
manual
cash
midtrans
xendit
stripe
custom
```

### 5.3 `payment_allocations`

Required columns:

```text
id uuid primary key defaultRandom
tenant_id uuid not null references tenants(id) on delete cascade
payment_intent_id uuid not null references payment_intents(id) on delete cascade
payment_transaction_id uuid not null references payment_transactions(id) on delete cascade
target_type varchar(64) not null
target_id varchar(128) not null
amount decimal(12,2) not null
metadata jsonb nullable
created_at timestamp not null default current_timestamp
```

Suggested indexes:

```text
payment_allocations_tenant_idx on tenant_id
payment_allocations_intent_idx on payment_intent_id
payment_allocations_transaction_idx on payment_transaction_id
payment_allocations_target_idx on tenant_id, target_type, target_id
```

### 5.4 `payment_provider_events`

Required columns:

```text
id uuid primary key defaultRandom
tenant_id uuid nullable references tenants(id) on delete cascade
provider varchar(50) not null
provider_event_id varchar(255) not null
provider_reference varchar(255) nullable
event_type varchar(100) not null
raw_payload jsonb not null
signature_valid boolean not null default false
processing_status varchar(50) not null default 'pending'
processed_at timestamp nullable
error_message text nullable
created_at timestamp not null default current_timestamp
```

Suggested indexes:

```text
payment_provider_events_provider_event_unique unique on provider, provider_event_id
payment_provider_events_reference_idx on provider, provider_reference
payment_provider_events_status_idx on processing_status
payment_provider_events_created_at_idx on created_at
```

---

## 6. Domain Types and Interfaces

Create payment domain files:

```text
packages/domain/payments/types.ts
packages/domain/payments/status.ts
packages/domain/payments/provider.ts
packages/domain/payments/policy.ts
packages/domain/payments/index.ts
```

### 6.1 Payment Provider Interface

Provider interface:

```ts
export interface PaymentProvider {
  providerCode: string;

  createPayment(input: CreateProviderPaymentInput): Promise<CreateProviderPaymentResult>;

  cancelPayment(input: CancelProviderPaymentInput): Promise<CancelProviderPaymentResult>;

  refundPayment(input: RefundProviderPaymentInput): Promise<RefundProviderPaymentResult>;

  verifyWebhook(input: VerifyWebhookInput): Promise<boolean>;

  parseWebhook(input: ParseWebhookInput): Promise<ParsedProviderWebhook>;
}
```

### 6.2 Manual Provider

Phase 1 must include a manual provider implementation that supports:

- cash
- card
- qris manual
- ewallet manual
- bank transfer manual
- other

Manual provider behavior:

- transaction can be marked as `succeeded` immediately.
- no webhook is required.
- no external provider reference is required except optional user-supplied reference.

---

## 7. Application Use Cases

Create use cases under:

```text
packages/application/payments/
```

### 7.1 Phase 1 Required Use Cases

```text
CreatePaymentIntent
GetPaymentIntent
ListPaymentTransactions
RecordManualPayment
RecalculatePaymentIntent
```

### 7.2 Phase 2 Use Cases

```text
CancelPaymentIntent
CreateGatewayPayment
HandlePaymentProviderWebhook
MarkPaymentTransactionFailed
```

### 7.3 Phase 3 Use Cases

```text
RefundPaymentTransaction
VoidPaymentTransaction
AllocatePaymentTransaction
```

### 7.4 Phase 4 Use Cases

```text
CreateOrderPaymentIntent
PayOrderWithPaymentEngine
SyncPaymentIntentToOrder
```

Order integration must not be implemented before the base engine passes tests.

---

## 8. Base Engine Rules

### 8.1 Create Payment Intent

Input:

```ts
{
  tenant_id: string;
  outlet_id?: string | null;
  payable_type: string;
  payable_id: string;
  amount_due: number;
  currency?: string;
  allow_partial?: boolean;
  expires_at?: Date | null;
  metadata?: Record<string, unknown>;
  idempotency_key?: string;
}
```

Rules:

- amount_due must be greater than zero.
- currency defaults to IDR.
- amount_paid starts at zero.
- amount_refunded starts at zero.
- amount_remaining equals amount_due.
- status starts as `requires_payment`.
- idempotency key must replay the existing intent.

### 8.2 Record Manual Payment

Input:

```ts
{
  tenant_id: string;
  payment_intent_id: string;
  amount: number;
  method: 'cash' | 'card' | 'qris' | 'ewallet' | 'bank_transfer' | 'other';
  transaction_type?: 'payment' | 'deposit' | 'settlement';
  received_amount?: number;
  provider_reference?: string;
  metadata?: Record<string, unknown>;
  idempotency_key?: string;
}
```

Rules:

- Lock payment intent row with `FOR UPDATE` before calculating remaining amount.
- Reject payment if intent is cancelled, expired, paid, refunded, or overpaid.
- If `allow_partial = false`, reject amount lower than remaining amount.
- If `allow_partial = true`, allow amount lower than remaining amount.
- Reject overpayment unless method is cash and received_amount is used for change calculation.
- `amount` means applied payment amount, not cash received amount.
- `received_amount` can be larger than `amount` only for cash.
- `change_amount = received_amount - amount`.
- Insert transaction as `succeeded` for manual payment.
- Insert default allocation for the payable target.
- Recalculate intent totals after transaction insert.

### 8.3 Recalculate Payment Intent

Rules:

- amount_paid = sum succeeded incoming payment/deposit/settlement transactions.
- amount_refunded = sum succeeded outgoing refund transactions.
- amount_remaining = max(0, amount_due - amount_paid + amount_refunded).
- status rules:
  - paid if amount_remaining <= 0 and amount_paid >= amount_due.
  - partially_paid if amount_paid > 0 and amount_remaining > 0.
  - requires_payment if amount_paid <= 0.
  - overpaid only if overpayment is explicitly allowed in later phase.
  - partially_refunded if paid and amount_refunded > 0 and amount_refunded < amount_paid.
  - refunded if amount_refunded >= amount_paid and amount_paid > 0.

---

## 9. API Roadmap

Register new route module:

```text
apps/api/src/http/routes/payment-engine.ts
```

Mount it in:

```text
apps/api/src/http/routes/index.ts
```

Base path:

```text
/api/payment-engine
```

### 9.1 Phase 1 Endpoints

```text
POST /api/payment-engine/intents
GET /api/payment-engine/intents/:id
GET /api/payment-engine/intents/:id/transactions
POST /api/payment-engine/intents/:id/manual-payments
```

### 9.2 Phase 2 Endpoints

```text
POST /api/payment-engine/intents/:id/gateway-payments
POST /api/payment-engine/webhooks/:provider
POST /api/payment-engine/intents/:id/cancel
```

### 9.3 Phase 3 Endpoints

```text
POST /api/payment-engine/transactions/:id/refund
POST /api/payment-engine/transactions/:id/void
```

---

## 10. Response Shape

All responses should follow existing API style:

```json
{
  "success": true,
  "data": {}
}
```

Validation error:

```json
{
  "success": false,
  "error": "Invalid request body"
}
```

Do not expose stack traces to clients.

---

## 11. Testing Roadmap

### 11.1 Unit Tests

Required tests for domain/application:

- Create intent initializes totals correctly.
- Intent idempotency replays existing intent.
- Manual full payment marks intent as paid.
- Manual partial payment marks intent as partially_paid.
- Partial payment is rejected when allow_partial is false.
- Cash over-received payment calculates change correctly.
- Non-cash overpayment is rejected.
- Duplicate idempotency key does not duplicate transaction.
- Recalculation ignores failed/cancelled transactions.

### 11.2 Integration Tests

Required API tests:

- POST intent.
- GET intent.
- POST manual payment full amount.
- POST manual payment partial amount.
- POST manual payment duplicate idempotency key.
- GET transactions.
- Tenant isolation: tenant A cannot access tenant B intent.

### 11.3 Migration Tests

Required checks:

- `npm run check`
- migration generation or manual migration is committed.
- migration applies cleanly to empty database.
- migration does not drop or mutate legacy `order_payments`.

---

## 12. Implementation Phases

## Phase 1: Independent Base Engine

Goal: Create a working generic manual payment engine without touching order payment flows.

Tasks:

- Add schema tables.
- Add migration.
- Add domain payment types.
- Add repository layer.
- Add application use cases:
  - CreatePaymentIntent
  - GetPaymentIntent
  - ListPaymentTransactions
  - RecordManualPayment
  - RecalculatePaymentIntent
- Add API controller and routes.
- Add tests.
- Add documentation updates.

Exit criteria:

- Existing order payment endpoints still work.
- New payment engine endpoints work.
- Manual full payment works.
- Manual partial payment works.
- Idempotency works.
- Tenant isolation works.
- Tests pass.

## Phase 2: Gateway-Ready Abstraction

Goal: Add provider abstraction without integrating real external gateway yet.

Tasks:

- Add PaymentProvider interface.
- Add ManualProvider implementation.
- Add FakeGatewayProvider for tests.
- Add `CreateGatewayPayment` use case.
- Add pending transaction support.
- Add gateway response fields.

Exit criteria:

- Fake gateway can create pending transaction.
- Pending transaction does not mark intent as paid.
- Gateway confirmation can mark transaction as succeeded.

## Phase 3: Webhook Engine

Goal: Add webhook handling and idempotent provider event storage.

Tasks:

- Add provider webhook endpoint.
- Verify webhook signature through provider interface.
- Store provider events before processing.
- Prevent duplicate event processing.
- Update transaction from pending to succeeded/failed.
- Recalculate intent after webhook.

Exit criteria:

- Duplicate webhook does not duplicate payment.
- Invalid signature is rejected or stored as invalid according to policy.
- Event processing is auditable.

## Phase 4: Refund and Void

Goal: Support internal refund and void lifecycle.

Tasks:

- Add refund use case.
- Add void use case.
- Add outgoing transaction support.
- Recalculate intent after refund.
- Add API endpoints.
- Add tests.

Exit criteria:

- Full refund marks intent refunded.
- Partial refund marks intent partially_refunded.
- Void does not count as paid.

## Phase 5: Order Adapter

Goal: Integrate new engine with orders without deleting legacy flow.

Tasks:

- Add `CreateOrderPaymentIntent`.
- Add `PayOrderWithPaymentEngine`.
- Add `SyncPaymentIntentToOrder`.
- Keep legacy `/api/orders/:id/payments` intact.
- Optionally add new endpoint under order namespace only after tests pass.

Exit criteria:

- New engine can update `orders.paidAmount` and `orders.paymentStatus` safely.
- Legacy flow still works.
- POS UI can migrate gradually.

## Phase 6: Business Extensions

Goal: Extend engine to specific business workflows.

Extensions:

- Split bill allocations for restaurant.
- Customer ledger for laundry DP and retail bon.
- Stock reservation for retail booking.
- Agent wallet / credit for PPOB.
- Business-type payment policies.

Do not start Phase 6 until Phase 1-5 are stable.

---

## 13. Non-Negotiable Guardrails

- Do not delete existing payment code.
- Do not rename existing payment endpoints.
- Do not change legacy order payment behavior in Phase 1.
- Do not hardcode payment engine to orders only.
- Do not skip idempotency.
- Do not process webhooks without event storage.
- Do not mark operational order completed just because payment is paid.
- Do not mix cash received amount with applied payment amount.
- Do not allow non-cash overpayment.
- Do not implement real gateway credentials in repo.

---

## 14. Review Checklist

Every implementation PR or commit must be reviewed against this checklist:

- Is the engine independent from legacy order payment flow?
- Are all new tables tenant-aware?
- Are all reads tenant-scoped?
- Are idempotency constraints present?
- Are monetary values stored as decimals, not floating numbers?
- Are calculations converted safely at application boundary?
- Does `RecordManualPayment` lock the intent row before updating totals?
- Does partial payment obey `allow_partial`?
- Does cash change logic avoid inflated revenue?
- Are tests included?
- Are migrations included?
- Does `npm run check` pass?

---

## 15. Target First Deliverable

The first deliverable should be Phase 1 only.

Do not implement gateway, order adapter, split bill, customer ledger, stock reservation, or PPOB credit in the first coding task.

The first coding task should produce:

- New schema tables.
- New migration.
- New payment domain files.
- New payment application use cases.
- New payment repositories.
- New API endpoints under `/api/payment-engine`.
- Unit/integration tests for base manual payment behavior.
- A short implementation report.
