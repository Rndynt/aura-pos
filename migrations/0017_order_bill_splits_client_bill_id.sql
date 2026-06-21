-- Add client_bill_id to order_bill_splits for frontend split lifecycle tracking
ALTER TABLE order_bill_splits ADD COLUMN IF NOT EXISTS client_bill_id varchar(128);

CREATE INDEX IF NOT EXISTS order_bill_splits_client_bill_idx
  ON order_bill_splits(order_id, client_bill_id)
  WHERE client_bill_id IS NOT NULL;
