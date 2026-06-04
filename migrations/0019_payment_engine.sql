-- Payment Engine Phase 1
-- Adds: payment_intents, payment_transactions, payment_allocations, payment_provider_events

CREATE TABLE IF NOT EXISTS "payment_intents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "outlet_id" uuid REFERENCES "outlets"("id") ON DELETE SET NULL,
  "payable_type" varchar(64) NOT NULL,
  "payable_id" varchar(128) NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'IDR',
  "amount_due" decimal(12,2) NOT NULL,
  "amount_paid" decimal(12,2) NOT NULL DEFAULT '0',
  "amount_refunded" decimal(12,2) NOT NULL DEFAULT '0',
  "amount_remaining" decimal(12,2) NOT NULL,
  "status" varchar(50) NOT NULL DEFAULT 'requires_payment',
  "allow_partial" boolean NOT NULL DEFAULT false,
  "expires_at" timestamp,
  "metadata" jsonb,
  "idempotency_key" varchar(128),
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "payment_intents_tenant_idx" ON "payment_intents" ("tenant_id");
CREATE INDEX IF NOT EXISTS "payment_intents_outlet_idx" ON "payment_intents" ("outlet_id");
CREATE INDEX IF NOT EXISTS "payment_intents_payable_idx" ON "payment_intents" ("tenant_id", "payable_type", "payable_id");
CREATE INDEX IF NOT EXISTS "payment_intents_status_idx" ON "payment_intents" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "payment_intents_created_at_idx" ON "payment_intents" ("created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "payment_intents_tenant_idempotency_unique" ON "payment_intents" ("tenant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "payment_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "payment_intent_id" uuid NOT NULL REFERENCES "payment_intents"("id") ON DELETE CASCADE,
  "direction" varchar(20) NOT NULL DEFAULT 'incoming',
  "transaction_type" varchar(50) NOT NULL DEFAULT 'payment',
  "method" varchar(50) NOT NULL,
  "provider" varchar(50) NOT NULL DEFAULT 'manual',
  "status" varchar(50) NOT NULL DEFAULT 'pending',
  "amount" decimal(12,2) NOT NULL,
  "received_amount" decimal(12,2),
  "change_amount" decimal(12,2),
  "provider_reference" varchar(255),
  "provider_payment_url" text,
  "provider_qr_string" text,
  "failure_reason" text,
  "idempotency_key" varchar(128),
  "metadata" jsonb,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "succeeded_at" timestamp,
  "failed_at" timestamp,
  "cancelled_at" timestamp
);

CREATE INDEX IF NOT EXISTS "payment_transactions_tenant_idx" ON "payment_transactions" ("tenant_id");
CREATE INDEX IF NOT EXISTS "payment_transactions_intent_idx" ON "payment_transactions" ("payment_intent_id");
CREATE INDEX IF NOT EXISTS "payment_transactions_status_idx" ON "payment_transactions" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "payment_transactions_provider_reference_idx" ON "payment_transactions" ("provider", "provider_reference");
CREATE UNIQUE INDEX IF NOT EXISTS "payment_transactions_tenant_idempotency_unique" ON "payment_transactions" ("tenant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "payment_transactions_provider_reference_unique" ON "payment_transactions" ("provider", "provider_reference") WHERE "provider_reference" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "payment_allocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "payment_intent_id" uuid NOT NULL REFERENCES "payment_intents"("id") ON DELETE CASCADE,
  "payment_transaction_id" uuid NOT NULL REFERENCES "payment_transactions"("id") ON DELETE CASCADE,
  "target_type" varchar(64) NOT NULL,
  "target_id" varchar(128) NOT NULL,
  "amount" decimal(12,2) NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "payment_allocations_tenant_idx" ON "payment_allocations" ("tenant_id");
CREATE INDEX IF NOT EXISTS "payment_allocations_intent_idx" ON "payment_allocations" ("payment_intent_id");
CREATE INDEX IF NOT EXISTS "payment_allocations_transaction_idx" ON "payment_allocations" ("payment_transaction_id");
CREATE INDEX IF NOT EXISTS "payment_allocations_target_idx" ON "payment_allocations" ("tenant_id", "target_type", "target_id");

CREATE TABLE IF NOT EXISTS "payment_provider_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE CASCADE,
  "provider" varchar(50) NOT NULL,
  "provider_event_id" varchar(255) NOT NULL,
  "provider_reference" varchar(255),
  "event_type" varchar(100) NOT NULL,
  "raw_payload" jsonb NOT NULL,
  "signature_valid" boolean NOT NULL DEFAULT false,
  "processing_status" varchar(50) NOT NULL DEFAULT 'pending',
  "processed_at" timestamp,
  "error_message" text,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "payment_provider_events_provider_event_unique" ON "payment_provider_events" ("provider", "provider_event_id");
CREATE INDEX IF NOT EXISTS "payment_provider_events_reference_idx" ON "payment_provider_events" ("provider", "provider_reference");
CREATE INDEX IF NOT EXISTS "payment_provider_events_status_idx" ON "payment_provider_events" ("processing_status");
CREATE INDEX IF NOT EXISTS "payment_provider_events_created_at_idx" ON "payment_provider_events" ("created_at");
