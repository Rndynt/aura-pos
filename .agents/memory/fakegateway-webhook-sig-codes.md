---
name: FakeGateway webhook signature error codes
description: Distinct error codes for missing vs wrong signature on FakeGateway webhook handler
---

The `FakeGatewayWebhookHandler` uses three distinct error codes for signature failures:

| Scenario | Code | HTTP |
|---|---|---|
| Secret configured, `x-fakegateway-signature` header absent | `WEBHOOK_SIGNATURE_MISSING` | 401 |
| Secret configured, header present but HMAC doesn't match | `WEBHOOK_SIGNATURE_INVALID` | 401 |
| Production mode, no secret configured | `WEBHOOK_SECRET_REQUIRED` | 403 |

**Why:** Missing vs wrong are different operational situations. Missing = header not sent at all (configuration problem on provider side). Wrong = header sent but HMAC mismatch (replay/tamper attempt). Tests must assert the correct code for each case.

**How to apply:** When writing tests for webhook signature scenarios, assert `WEBHOOK_SIGNATURE_MISSING` for the no-header case, not `WEBHOOK_SIGNATURE_INVALID`.
