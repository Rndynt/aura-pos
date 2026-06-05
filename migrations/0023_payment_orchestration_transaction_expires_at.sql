-- Migration: Payment Orchestration Phase 8J — transaction-level expiry compatibility
-- Adds transaction expires_at to the monorepo compatibility schema.

ALTER TABLE "payment_orchestration_transactions"
  ADD COLUMN IF NOT EXISTS "expires_at" timestamp;

CREATE INDEX IF NOT EXISTS "po_transactions_expires_at_idx"
  ON "payment_orchestration_transactions" ("expires_at");
