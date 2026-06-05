# Payment Engine — FakeGateway E2E Smoke Documentation

**Phase 6.5 — FakeGateway End-to-End Smoke & Dev Testing**

---

## What FakeGateway Is

`FakeGatewayProvider` is a local dev/test-only simulated payment gateway built into AuraPoS.
It exists to prove the Payment Engine lifecycle end-to-end — creating intents, creating
gateway transactions, confirming or rejecting them via controlled endpoints, running
refund/void flows, and verifying reconciliation — **without any external system**.

FakeGateway is the **golden contract provider**: every real provider adapter (Midtrans, Xendit,
Stripe) that will be implemented in future phases must produce results compatible with
FakeGateway's contract.

FakeGateway uses **scenario tags** (`metadata.scenario`) to simulate different provider behaviors
from a single code path. Each scenario produces deterministic, predictable output suitable for
automated testing.

---

## What FakeGateway Is NOT

- ❌ **NOT a Midtrans emulator.** It shares no API shape, URL format, or signature scheme with Midtrans.
- ❌ **NOT a Xendit emulator.** It shares no API shape, URL format, or signature scheme with Xendit.
- ❌ **NOT a Stripe emulator.** It is not compatible with any Stripe SDK or test-mode credential.
- ❌ **NOT suitable for production.** The `fake-gateway/confirm` endpoint and `webhooks/fake_gateway`
  are hard-disabled (`404`) when `NODE_ENV=production`.
- ❌ **NOT real money movement.** FakeGateway makes zero external HTTP calls and processes zero real payments.

---

## Scenarios

| `metadata.scenario` | Transaction status | `providerActions[0].descriptor` | Notes |
|---|---|---|---|
| `redirect` | `requires_action` | `WEB_URL` | Browser redirect to fake payment page |
| `qris` | `requires_action` | `QR_STRING` | QRIS / static QR payment |
| `va` | `requires_action` | `VA_NUMBER` | Bank virtual account |
| `payment_code` | `requires_action` | `PAYMENT_CODE` | Indomaret / Alfamart counter code |
| `immediate_success` | `succeeded` | _(empty actions)_ | Settled synchronously, no webhook |
| `immediate_failure` | `failed` | _(empty actions)_ | Rejected synchronously, no webhook |
| `pending_expiry` | `requires_action` | `WEB_URL` + `expiresAt` | Expires in 15 minutes |
| `default` / omitted | `pending` | _(empty actions)_ | Backward-compatible; legacy URL+QR fields set |

---

## Required Environment Variables

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/pos_db"
PAYMENT_ENGINE_SERVICE_TOKEN="my-dev-smoke-test-token-32chars-min"

# Optional: override FakeGateway HMAC secret (defaults to built-in dev secret in non-production)
FAKE_GATEWAY_WEBHOOK_SECRET="my-dev-webhook-secret"
```

> **Production safety:** `PAYMENT_ENGINE_SERVICE_TOKEN` bypass is **hard-disabled** when
> `NODE_ENV=production`. In production, use a Better Auth session with cashier+ role.

---

## Required Headers

Every request to `/api/payment-engine/*` must include:

```bash
-H "Content-Type: application/json"
-H "x-tenant-id: $TENANT_ID"
-H "x-payment-engine-service-token: $PAYMENT_ENGINE_SERVICE_TOKEN"
```

Webhook requests (`/api/payment-engine/webhooks/fake_gateway`) do **not** use the service token.
They are authenticated by HMAC-SHA256 signature only:

```bash
-H "x-fake-gateway-signature: $COMPUTED_HMAC"
```

---

## Placeholders

```bash
BASE_URL="http://localhost:5000"
TENANT_ID="dev-tenant"
PAYMENT_ENGINE_SERVICE_TOKEN="replace-with-local-token-32chars-minimum"
FAKE_GATEWAY_WEBHOOK_SECRET="fake-gateway-test-secret-default-dev-only-NOT-for-prod"
```

---

## Endpoint Reference

| Method | Path | Phase | Description |
|---|---|---|---|
| `POST` | `/api/payment-engine/intents` | 1 | Create payment intent |
| `GET` | `/api/payment-engine/intents/:id` | 1 | Get intent |
| `GET` | `/api/payment-engine/intents/:id/transactions` | 1 | List transactions |
| `POST` | `/api/payment-engine/intents/:id/manual-payments` | 1 | Record manual payment |
| `POST` | `/api/payment-engine/intents/:id/gateway-payments` | 2 | Create gateway payment (FakeGateway) |
| `POST` | `/api/payment-engine/fake-gateway/confirm` | 2 | Controlled confirm/fail (dev only) |
| `POST` | `/api/payment-engine/webhooks/:provider` | 3 | Provider webhook (HMAC only) |
| `POST` | `/api/payment-engine/transactions/:id/refund` | 4 | Refund succeeded transaction |
| `POST` | `/api/payment-engine/transactions/:id/void` | 4 | Void pending/requires_action transaction |
| `POST` | `/api/payment-engine/reconciliation/reprocess-stale-events` | 5 | Reprocess orphaned events |
| `GET` | `/api/payment-engine/reconciliation/stale-transactions` | 5 | List stale transactions |
| `POST` | `/api/payment-engine/reconciliation/expire-stale-transactions` | 5 | Expire stale transactions |
| `POST` | `/api/payment-engine/reconciliation/reconcile-intent-totals` | 5 | Reconcile intent totals |

---

## Curl Flows

### Flow 1 — Create Payment Intent

```bash
INTENT=$(curl -s -X POST "$BASE_URL/api/payment-engine/intents" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "x-payment-engine-service-token: $PAYMENT_ENGINE_SERVICE_TOKEN" \
  -d '{
    "payable_type": "order",
    "payable_id": "order-demo-001",
    "amount_due": 150000,
    "currency": "IDR",
    "allow_partial": false,
    "idempotency_key": "smoke-intent-001"
  }')
echo "$INTENT" | python3 -m json.tool

INTENT_ID=$(echo "$INTENT" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
echo "Intent ID: $INTENT_ID"
```

**Expected response (201):**
```json
{
  "success": true,
  "data": {
    "id": "<uuid>",
    "status": "requires_payment",
    "amountDue": 150000,
    "amountPaid": 0,
    "amountRemaining": 150000,
    "currency": "IDR"
  }
}
```

Idempotent replay returns **200** with the same `id`.

---

### Flow 2 — FakeGateway Payment: `default` Scenario

```bash
curl -s -X POST "$BASE_URL/api/payment-engine/intents/$INTENT_ID/gateway-payments" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "x-payment-engine-service-token: $PAYMENT_ENGINE_SERVICE_TOKEN" \
  -d '{
    "provider": "fake_gateway",
    "method": "qris",
    "amount": 150000,
    "metadata": {}
  }' | python3 -m json.tool
```

**Expected response (200):**
```json
{
  "success": true,
  "data": {
    "transaction": {
      "status": "pending",
      "provider": "fake_gateway",
      "providerReference": "fake_<intent_id>_<hex>",
      "providerPaymentUrl": "https://fake-gateway.local/pay/<ref>",
      "providerQrString": "FAKE_QR:<ref>:<amount>:IDR"
    },
    "intent": { "status": "requires_payment" },
    "providerActions": [],
    "immediateSuccess": false
  }
}
```

> **Note:** `default` scenario produces `status: pending`, both legacy URL + QR fields set, `providerActions: []`.

---

### Flow 3 — FakeGateway Payment: `redirect` Scenario

```bash
curl -s -X POST "$BASE_URL/api/payment-engine/intents/$INTENT_ID/gateway-payments" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "x-payment-engine-service-token: $PAYMENT_ENGINE_SERVICE_TOKEN" \
  -d '{
    "provider": "fake_gateway",
    "method": "qris",
    "amount": 150000,
    "metadata": { "scenario": "redirect" }
  }' | python3 -m json.tool
```

**Expected response (200):**
```json
{
  "success": true,
  "data": {
    "transaction": { "status": "requires_action" },
    "providerActions": [
      {
        "type": "redirect_customer",
        "descriptor": "WEB_URL",
        "label": "Complete payment",
        "value": "https://fake-gateway.local/pay/<ref>"
      }
    ]
  }
}
```

---

### Flow 4 — FakeGateway Payment: `qris` Scenario

```bash
curl -s -X POST "$BASE_URL/api/payment-engine/intents/$INTENT_ID/gateway-payments" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "x-payment-engine-service-token: $PAYMENT_ENGINE_SERVICE_TOKEN" \
  -d '{
    "provider": "fake_gateway",
    "method": "qris",
    "amount": 150000,
    "metadata": { "scenario": "qris" }
  }' | python3 -m json.tool
```

**Expected response (200):**
```json
{
  "success": true,
  "data": {
    "transaction": {
      "status": "requires_action",
      "providerQrString": "FAKE_QR:<ref>:150000:IDR"
    },
    "providerActions": [
      {
        "type": "present_qr",
        "descriptor": "QR_STRING",
        "label": "Scan QR code",
        "value": "FAKE_QR:<ref>:150000:IDR"
      }
    ]
  }
}
```

---

### Flow 5 — FakeGateway Payment: `va` Scenario

```bash
curl -s -X POST "$BASE_URL/api/payment-engine/intents/$INTENT_ID/gateway-payments" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "x-payment-engine-service-token: $PAYMENT_ENGINE_SERVICE_TOKEN" \
  -d '{
    "provider": "fake_gateway",
    "method": "bank_transfer",
    "amount": 150000,
    "metadata": { "scenario": "va" }
  }' | python3 -m json.tool
```

**Expected response (200):**
```json
{
  "success": true,
  "data": {
    "transaction": { "status": "requires_action" },
    "providerActions": [
      {
        "type": "display_code",
        "descriptor": "VA_NUMBER",
        "label": "Virtual Account Number",
        "value": "8800000000"
      }
    ]
  }
}
```

---

### Flow 6 — FakeGateway Payment: `payment_code` Scenario

```bash
curl -s -X POST "$BASE_URL/api/payment-engine/intents/$INTENT_ID/gateway-payments" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "x-payment-engine-service-token: $PAYMENT_ENGINE_SERVICE_TOKEN" \
  -d '{
    "provider": "fake_gateway",
    "method": "other",
    "amount": 150000,
    "metadata": { "scenario": "payment_code" }
  }' | python3 -m json.tool
```

**Expected response (200):**
```json
{
  "success": true,
  "data": {
    "transaction": { "status": "requires_action" },
    "providerActions": [
      {
        "type": "display_code",
        "descriptor": "PAYMENT_CODE",
        "label": "Payment Code",
        "value": "FAKE<hex>"
      }
    ]
  }
}
```

---

### Flow 7 — FakeGateway Payment: `immediate_success` Scenario

```bash
curl -s -X POST "$BASE_URL/api/payment-engine/intents/$INTENT_ID/gateway-payments" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "x-payment-engine-service-token: $PAYMENT_ENGINE_SERVICE_TOKEN" \
  -d '{
    "provider": "fake_gateway",
    "method": "qris",
    "amount": 150000,
    "metadata": { "scenario": "immediate_success" }
  }' | python3 -m json.tool
```

**Expected response (200):**
```json
{
  "success": true,
  "data": {
    "transaction": { "status": "succeeded" },
    "intent": { "status": "paid", "amountPaid": 150000, "amountRemaining": 0 },
    "providerActions": [],
    "immediateSuccess": true
  }
}
```

> Intent is marked `paid` immediately. No webhook or confirm step needed.

---

### Flow 8 — FakeGateway Payment: `immediate_failure` Scenario

```bash
curl -s -X POST "$BASE_URL/api/payment-engine/intents/$INTENT_ID/gateway-payments" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "x-payment-engine-service-token: $PAYMENT_ENGINE_SERVICE_TOKEN" \
  -d '{
    "provider": "fake_gateway",
    "method": "qris",
    "amount": 150000,
    "metadata": { "scenario": "immediate_failure" }
  }' | python3 -m json.tool
```

**Expected response (200):**
```json
{
  "success": true,
  "data": {
    "transaction": {
      "status": "failed",
      "failureReason": "Payment rejected by fake gateway (immediate_failure scenario)"
    },
    "intent": { "status": "requires_payment", "amountPaid": 0 },
    "providerActions": [],
    "immediateSuccess": false
  }
}
```

---

### Flow 9 — FakeGateway Payment: `pending_expiry` Scenario

```bash
curl -s -X POST "$BASE_URL/api/payment-engine/intents/$INTENT_ID/gateway-payments" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "x-payment-engine-service-token: $PAYMENT_ENGINE_SERVICE_TOKEN" \
  -d '{
    "provider": "fake_gateway",
    "method": "qris",
    "amount": 150000,
    "metadata": { "scenario": "pending_expiry" }
  }' | python3 -m json.tool
```

**Expected response (200):**
```json
{
  "success": true,
  "data": {
    "transaction": { "status": "requires_action" },
    "providerActions": [
      {
        "type": "redirect_customer",
        "descriptor": "WEB_URL",
        "label": "Complete payment (expires soon)",
        "value": "https://fake-gateway.local/pay/<ref>",
        "expiresAt": "<15 minutes from now>"
      }
    ]
  }
}
```

---

### Flow 10 — Confirm FakeGateway Transaction as `succeeded`

Replace `<PROVIDER_REFERENCE>` with the `providerReference` from a gateway payment response.

```bash
curl -s -X POST "$BASE_URL/api/payment-engine/fake-gateway/confirm" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "x-payment-engine-service-token: $PAYMENT_ENGINE_SERVICE_TOKEN" \
  -d '{
    "provider_reference": "<PROVIDER_REFERENCE>",
    "status": "succeeded"
  }' | python3 -m json.tool
```

**Expected response (200):**
```json
{
  "success": true,
  "data": {
    "transaction": { "status": "succeeded" },
    "intent": { "status": "paid", "amountPaid": 150000, "amountRemaining": 0 }
  }
}
```

> ⚠️ Returns `404` when `NODE_ENV=production`. This endpoint is permanently disabled in production.

---

### Flow 11 — Confirm FakeGateway Transaction as `failed`

```bash
curl -s -X POST "$BASE_URL/api/payment-engine/fake-gateway/confirm" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "x-payment-engine-service-token: $PAYMENT_ENGINE_SERVICE_TOKEN" \
  -d '{
    "provider_reference": "<PROVIDER_REFERENCE>",
    "status": "failed",
    "failure_reason": "Insufficient funds"
  }' | python3 -m json.tool
```

**Expected response (200):**
```json
{
  "success": true,
  "data": {
    "transaction": {
      "status": "failed",
      "failureReason": "Insufficient funds"
    },
    "intent": { "status": "requires_payment", "amountPaid": 0 }
  }
}
```

---

### Flow 12 — List Transactions for an Intent

```bash
curl -s "$BASE_URL/api/payment-engine/intents/$INTENT_ID/transactions" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "x-payment-engine-service-token: $PAYMENT_ENGINE_SERVICE_TOKEN" \
  | python3 -m json.tool
```

**Expected response (200):**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "<uuid>",
        "status": "succeeded",
        "provider": "fake_gateway",
        "amount": 150000
      }
    ]
  }
}
```

---

### Flow 13 — Refund a Succeeded Transaction

Replace `<TRANSACTION_ID>` with the `id` of a succeeded incoming transaction.

```bash
curl -s -X POST "$BASE_URL/api/payment-engine/transactions/<TRANSACTION_ID>/refund" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "x-payment-engine-service-token: $PAYMENT_ENGINE_SERVICE_TOKEN" \
  -d '{
    "amount": 150000
  }' | python3 -m json.tool
```

**Expected response (201):**
```json
{
  "success": true,
  "data": {
    "refundTransaction": {
      "status": "succeeded",
      "direction": "outgoing",
      "transactionType": "refund"
    },
    "intent": {
      "status": "refunded",
      "amountRefunded": 150000
    }
  }
}
```

---

### Flow 14 — Void a Pending / `requires_action` Transaction

Replace `<TRANSACTION_ID>` with the `id` of a pending or requires_action transaction.

```bash
curl -s -X POST "$BASE_URL/api/payment-engine/transactions/<TRANSACTION_ID>/void" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "x-payment-engine-service-token: $PAYMENT_ENGINE_SERVICE_TOKEN" \
  -d '{}' | python3 -m json.tool
```

**Expected response (200):**
```json
{
  "success": true,
  "data": {
    "transaction": { "status": "voided" },
    "intent": { "status": "requires_payment" }
  }
}
```

---

### Flow 15 — Reconciliation Dry-Run Endpoints

All reconciliation endpoints require **manager role** (or service token in non-production).
All default to `dry_run: true` — pass `"dry_run": false` to actually mutate.

#### 15a — Reprocess Stale Provider Events (dry-run)

```bash
curl -s -X POST "$BASE_URL/api/payment-engine/reconciliation/reprocess-stale-events" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "x-payment-engine-service-token: $PAYMENT_ENGINE_SERVICE_TOKEN" \
  -d '{ "dry_run": true, "cutoff_minutes": 30 }' | python3 -m json.tool
```

#### 15b — List Stale Transactions

```bash
curl -s "$BASE_URL/api/payment-engine/reconciliation/stale-transactions?cutoff_minutes=30" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "x-payment-engine-service-token: $PAYMENT_ENGINE_SERVICE_TOKEN" \
  | python3 -m json.tool
```

#### 15c — Expire Stale Transactions (dry-run)

```bash
curl -s -X POST "$BASE_URL/api/payment-engine/reconciliation/expire-stale-transactions" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "x-payment-engine-service-token: $PAYMENT_ENGINE_SERVICE_TOKEN" \
  -d '{ "dry_run": true, "cutoff_minutes": 60, "provider": "fake_gateway" }' | python3 -m json.tool
```

#### 15d — Reconcile Intent Totals (dry-run)

```bash
curl -s -X POST "$BASE_URL/api/payment-engine/reconciliation/reconcile-intent-totals" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "x-payment-engine-service-token: $PAYMENT_ENGINE_SERVICE_TOKEN" \
  -d '{
    "intent_ids": ["<INTENT_ID>"],
    "dry_run": true
  }' | python3 -m json.tool
```

---

### Flow 16 — FakeGateway Webhook (HMAC-signed)

Generate the HMAC signature first using Node.js:

```bash
WEBHOOK_BODY='{"event_id":"evt-001","event_type":"payment.succeeded","provider_reference":"<PROVIDER_REFERENCE>"}'
SIGNATURE=$(node -e "
  const crypto = require('crypto');
  const secret = process.env.FAKE_GATEWAY_WEBHOOK_SECRET || 'fake-gateway-test-secret-default-dev-only-NOT-for-prod';
  const sig = crypto.createHmac('sha256', secret).update(process.argv[1]).digest('hex');
  console.log(sig);
" "$WEBHOOK_BODY")

curl -s -X POST "$BASE_URL/api/payment-engine/webhooks/fake_gateway" \
  -H "Content-Type: application/json" \
  -H "x-fake-gateway-signature: $SIGNATURE" \
  -d "$WEBHOOK_BODY" | python3 -m json.tool
```

> No service token or session is required for webhooks — HMAC signature is the only auth mechanism.
> Returns `404` when `NODE_ENV=production`.

---

## End-to-End Lifecycle Summary

```
POST /intents                          → creates intent (requires_payment)
POST /intents/:id/gateway-payments     → creates tx (pending | requires_action | succeeded | failed)
  [if pending/requires_action]
    → POST /fake-gateway/confirm       → tx succeeded/failed, intent recalculated
    → POST /webhooks/fake_gateway      → tx succeeded/failed via HMAC webhook
  [if requires_action, not confirmed]
    → POST /transactions/:id/void      → tx voided, intent back to requires_payment
  [if succeeded]
    → POST /transactions/:id/refund    → refund tx, intent partially_refunded / refunded
Reconciliation:
    → GET  /reconciliation/stale-transactions
    → POST /reconciliation/reprocess-stale-events
    → POST /reconciliation/expire-stale-transactions
    → POST /reconciliation/reconcile-intent-totals
```

---

## State Transition Table

| Action | Intent before | Intent after |
|---|---|---|
| Create intent | — | `requires_payment` |
| Gateway payment `immediate_success` | `requires_payment` | `paid` |
| Gateway payment `immediate_failure` | `requires_payment` | `requires_payment` |
| Confirm `succeeded` (full amount) | `requires_payment` | `paid` |
| Confirm `failed` | `requires_payment` | `requires_payment` |
| Void pending/requires_action | `requires_payment` | `requires_payment` |
| Full refund of succeeded tx | `paid` | `refunded` |
| Partial refund of succeeded tx | `paid` | `partially_refunded` |

---

## Known Limitations

- FakeGateway `canCancel: false`, `canRefund: false` — provider-level cancel/refund API is not implemented.
  Use `VoidPaymentTransaction` / `RefundPaymentTransaction` use cases instead.
- No polling support (`supportsPolling: false`).
- No `ProviderAccountConfig` DB table — credentials sourced from env vars only.
- `rawProviderResponse` is returned in the use-case output but is not persisted to DB.
- `fake-gateway/confirm` and `webhooks/fake_gateway` are hard-disabled in `NODE_ENV=production`.
