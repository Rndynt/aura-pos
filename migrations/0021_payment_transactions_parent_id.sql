-- Phase 4: Add parent_transaction_id to payment_transactions
-- Links refund/void rows back to the original incoming transaction.
-- Nullable self-reference — NULL for all original payment rows.

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS parent_transaction_id uuid
    REFERENCES payment_transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS payment_transactions_parent_idx
  ON payment_transactions (parent_transaction_id)
  WHERE parent_transaction_id IS NOT NULL;
