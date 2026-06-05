# AuraPoS — Xendit Sandbox Payment Engine Smoke Guide

> **⚠️ SANDBOX ONLY — Phase 7A**
> This guide covers sandbox/test-mode integration only.
> No production Xendit credentials. No real money movement.
> Never use production keys in a development/sandbox environment.

---

## Prerequisites

### 1. Create a Xendit Test Account

1. Sign up at [https://dashboard.xendit.co](https://dashboard.xendit.co)
2. Switch to **Test Mode** (toggle in dashboard header)
3. Go to **Settings → API Keys** → create a new secret key (test mode)
4. Go to **Settings → Webhooks** → configure webhook URL (see below)
5. Copy the **Webhook Verification Token** from the webhook settings page

### 2. Required Environment Variables

Add to your `.env` or shell environment. **Never commit real secret values.**

```bash
# Enable the Xendit sandbox provider (must be 'true' to activate)
XENDIT_SANDBOX_ENABLED=true

# Test-mode secret key from Xendit dashboard (starts with xnd_development_...)
XENDIT_SECRET_KEY_SANDBOX=xnd_development_REPLACE_WITH_REAL_TEST_KEY

# Webhook verification token from Xendit dashboard
XENDIT_WEBHOOK_TOKEN_SANDBOX=REPLACE_WITH_WEBHOOK_TOKEN

# Xendit API base URL (default — do not change for standard integration)
XENDIT_API_BASE_URL=https://api.xendit.co

# Return URLs after payment completion
XENDIT_PAYMENT_SUCCESS_RETURN_URL=http://localhost:5000/payment/success
XENDIT_PAYMENT_FAILURE_RETURN_URL=http://localhost:5000/payment/failure

# Payment engine service token — required for all payment-engine routes
# Must be at least 32 characters. Set in Replit Secrets or .env (never commit).
# NOTE: Webhook routes use x-callback-token, NOT this token.
PAYMENT_ENGINE_SERVICE_TOKEN=REPLACE_WITH_AT_LEAST_32_CHAR_TOKEN
```

> **Security rules:**
> - Never log `XENDIT_SECRET_KEY_SANDBOX` or `XENDIT_WEBHOOK_TOKEN_SANDBOX`.
> - Never commit `.env` files containing real secrets.
> - Use `.env.example` (without values) as a template.

---

## Starting the AuraPoS API

```bash
# From repo root
npm run dev
```

Or via the Replit workflow "Start application".

Confirm Xendit provider is registered:

```
[Payment Engine] Xendit sandbox provider registered (sandbox mode)
```

If you do NOT see this message, check:
- `XENDIT_SANDBOX_ENABLED=true` is set
- `XENDIT_SECRET_KEY_SANDBOX` is non-empty

---

## End-to-End Smoke Flow

### Step 1 — Create a Payment Intent

> **Auth:** All payment-engine routes require the `x-payment-engine-service-token` header.
> Set `SERVICE_TOKEN` to your `PAYMENT_ENGINE_SERVICE_TOKEN` env var value.

```bash
SERVICE_TOKEN="your-payment-engine-service-token-here"   # ≥32 chars

curl -s -X POST http://localhost:5000/api/payment-engine/intents \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: demo-tenant" \
  -H "x-payment-engine-service-token: ${SERVICE_TOKEN}" \
  -d '{
    "payable_type": "order",
    "payable_id": "test-order-001",
    "amount_due": 100000,
    "currency": "IDR",
    "allow_partial": false
  }' | jq .
```

Expected: `201 Created` with a `data.id` field — save it as `INTENT_ID`.

```json
{
  "success": true,
  "data": {
    "id": "pi_xxxxxxxxxxxxxxxx",
    "status": "requires_payment",
    "amountDue": 100000,
    "amountPaid": 0,
    "amountRemaining": 100000
  }
}
```

Extract the intent ID:

```bash
INTENT_ID=$(curl -s -X POST http://localhost:5000/api/payment-engine/intents \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: demo-tenant" \
  -H "x-payment-engine-service-token: ${SERVICE_TOKEN}" \
  -d '{"payable_type":"order","payable_id":"test-order-001","amount_due":100000,"currency":"IDR"}' \
  | jq -r '.data.id')
echo "INTENT_ID=${INTENT_ID}"
```

### Step 2 — Create a Xendit Sandbox Gateway Payment (QRIS)

> **Route:** `/gateway-payments` (plural) — not `/gateway-payment`.

```bash
curl -s -X POST "http://localhost:5000/api/payment-engine/intents/${INTENT_ID}/gateway-payments" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: demo-tenant" \
  -H "x-payment-engine-service-token: ${SERVICE_TOKEN}" \
  -d '{
    "provider": "xendit_sandbox",
    "method": "qris",
    "amount": 100000,
    "metadata": {
      "xendit_channel_code": "QRIS"
    }
  }' | jq .
```

Expected: `{ "success": true, "data": { "providerReference": ..., "transaction": { ... }, ... } }`.
The key fields are nested under `data`:

```json
{
  "success": true,
  "data": {
    "providerReference": "pr_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "providerPaymentUrl": null,
    "providerQrString": "00020101021226...",
    "providerActions": [
      {
        "type": "present_qr",
        "descriptor": "QR_STRING",
        "label": "Scan QR code to pay",
        "value": "00020101021226..."
      }
    ],
    "transaction": {
      "status": "requires_action",
      "provider": "xendit_sandbox",
      "method": "qris"
    }
  }
}
```

Save `data.providerReference` as `PROVIDER_REF`:

```bash
PROVIDER_REF=$(curl -s -X POST "http://localhost:5000/api/payment-engine/intents/${INTENT_ID}/gateway-payments" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: demo-tenant" \
  -H "x-payment-engine-service-token: ${SERVICE_TOKEN}" \
  -d '{"provider":"xendit_sandbox","method":"qris","amount":100000}' \
  | jq -r '.data.providerReference')
echo "PROVIDER_REF=${PROVIDER_REF}"
```

### Step 3 — E-Wallet Payment (OVO example)

```bash
curl -s -X POST "http://localhost:5000/api/payment-engine/intents/${INTENT_ID}/gateway-payments" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: demo-tenant" \
  -H "x-payment-engine-service-token: ${SERVICE_TOKEN}" \
  -d '{
    "provider": "xendit_sandbox",
    "method": "ewallet",
    "amount": 100000,
    "metadata": {
      "xendit_channel_code": "OVO"
    }
  }' | jq .
```

### Step 4 — Bank Transfer (Virtual Account)

```bash
curl -s -X POST "http://localhost:5000/api/payment-engine/intents/${INTENT_ID}/gateway-payments" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: demo-tenant" \
  -H "x-payment-engine-service-token: ${SERVICE_TOKEN}" \
  -d '{
    "provider": "xendit_sandbox",
    "method": "bank_transfer",
    "amount": 100000,
    "metadata": {
      "xendit_channel_code": "BCA"
    }
  }' | jq .
```

### Step 5 — Check Intent Status (Polling)

```bash
curl -s "http://localhost:5000/api/payment-engine/intents/${INTENT_ID}/status" \
  -H "x-tenant-id: demo-tenant" \
  -H "x-payment-engine-service-token: ${SERVICE_TOKEN}" | jq .
```

Expected (before payment completes):

```json
{
  "status": "open",
  "isTerminal": false,
  "requiresAction": true,
  "canRetryPayment": true
}
```

### Step 6 — Configure Xendit Webhook URL

In the Xendit dashboard:

1. Go to **Settings → Webhooks**
2. Add webhook URL:
   ```
   POST https://your-public-domain.com/api/payment-engine/webhooks/xendit_sandbox
   ```
   For local development, use a tunnel tool (e.g., ngrok):
   ```bash
   ngrok http 5000
   # Then set: https://xxxx.ngrok.io/api/payment-engine/webhooks/xendit_sandbox
   ```
3. Select events: `payment.capture`, `payment.failure`, `payment_request.expiry`
4. Copy the **Webhook Verification Token** → set as `XENDIT_WEBHOOK_TOKEN_SANDBOX`

### Step 7 — Simulate a Webhook (Manual Test)

You can simulate a Xendit `payment.capture` webhook with the token in the header:

```bash
WEBHOOK_TOKEN="your-webhook-token-here"
PROVIDER_REF="pr_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

curl -s -X POST "http://localhost:5000/api/payment-engine/webhooks/xendit_sandbox" \
  -H "Content-Type: application/json" \
  -H "x-callback-token: ${WEBHOOK_TOKEN}" \
  -d '{
    "event": "payment.capture",
    "data": {
      "payment_request_id": "'"${PROVIDER_REF}"'",
      "reference_id": "aurapos-pi_xxxxxxxxxxxxxxxx",
      "status": "SUCCEEDED",
      "request_amount": 100000,
      "currency": "IDR"
    },
    "created": "2026-01-01T00:00:00.000Z"
  }' | jq .
```

Expected: `200 OK` with `outcome: "processed"`.

### Step 8 — Verify Final Intent Status

> **Note:** The webhook route (`/webhooks/xendit_sandbox`) uses `x-callback-token`, NOT the service token.
> All other routes use `x-payment-engine-service-token`.

```bash
curl -s "http://localhost:5000/api/payment-engine/intents/${INTENT_ID}/status" \
  -H "x-tenant-id: demo-tenant" \
  -H "x-payment-engine-service-token: ${SERVICE_TOKEN}" | jq .
```

Expected after successful webhook:

```json
{
  "status": "paid",
  "isTerminal": true,
  "requiresAction": false,
  "canRetryPayment": false
}
```

---

## Channel Code Reference

| method | xendit_channel_code | Notes |
|--------|---------------------|-------|
| `qris` | `QRIS` (default) | Can omit metadata if QRIS |
| `ewallet` | `OVO` | Requires metadata.xendit_channel_code |
| `ewallet` | `DANA` | Requires metadata.xendit_channel_code |
| `ewallet` | `LINKAJA` | Requires metadata.xendit_channel_code |
| `bank_transfer` | `BCA` | Requires metadata.xendit_channel_code |
| `bank_transfer` | `MANDIRI` | Requires metadata.xendit_channel_code |
| `bank_transfer` | `BNI` | Requires metadata.xendit_channel_code |
| `bank_transfer` | `BRI` | Requires metadata.xendit_channel_code |

---

## Status Mapping Reference

| Xendit status | Internal status | Notes |
|---------------|-----------------|-------|
| `REQUIRES_ACTION` | `requires_action` | Customer action needed |
| `PENDING` | `pending` | Awaiting confirmation |
| `SUCCEEDED` | `succeeded` | Payment complete |
| `FAILED` | `failed` | Payment rejected |
| `CANCELED` | `failed` | Phase 7A limitation — see below |
| `EXPIRED` | `failed` | Phase 7A limitation — see below |

---

## Known Limitations (Phase 7A)

| Limitation | Details |
|------------|---------|
| Sandbox only | No production credential support |
| No provider-level refund | Use `RefundPaymentTransaction` use case (Phase 4) |
| No provider-level cancel | Use `VoidPaymentTransaction` use case (Phase 4) |
| CANCELED/EXPIRED → `failed` | No distinct status in internal contract; mapped to `failed` |
| `payment_request.expiry` webhook | Parsed as `ignored` — no state transition in Phase 7A |
| No external polling | `supportsPolling: false`; status updates via webhook only |
| No cron/worker layer | Manual webhook delivery by Xendit; no polling loop in AuraPoS |
| No POS UI adapter | Gateway payments created via API only in Phase 7A |
| No Midtrans/Stripe | Only `xendit_sandbox` and `fake_gateway` providers available |
