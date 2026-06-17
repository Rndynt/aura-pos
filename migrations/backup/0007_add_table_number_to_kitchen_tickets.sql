-- Migration: Add table_number column to kitchen_tickets
-- The domain type KitchenTicket already had table_number but the DB column was missing.
-- This migration adds it safely with IF NOT EXISTS.

ALTER TABLE "kitchen_tickets" ADD COLUMN IF NOT EXISTS "table_number" text;
