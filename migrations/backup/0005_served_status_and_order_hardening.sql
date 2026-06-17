-- Migration: Served status, closed_at, order number uniqueness
-- Addresses P0.3 (served lifecycle), P1.3 (order number race condition)

-- Add closed_at timestamp to orders for explicit settlement tracking
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "closed_at" timestamp;

-- Add cancellation_reason text to orders
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cancellation_reason" text;

-- Add unique index for (tenant_id, order_number) to prevent race condition duplicates
-- This enforces P1.3: order numbers are unique per tenant
CREATE UNIQUE INDEX IF NOT EXISTS "orders_tenant_order_number_unique"
  ON "orders" ("tenant_id", "order_number");
