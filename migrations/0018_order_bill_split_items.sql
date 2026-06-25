-- Persist split-bill item assignment so paid bills can be rehydrated and locked.
CREATE TABLE IF NOT EXISTS order_bill_split_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_bill_split_id uuid NOT NULL REFERENCES order_bill_splits(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  client_bill_id varchar(128) NOT NULL,
  quantity numeric(12,3) NOT NULL DEFAULT 1,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT order_bill_split_items_order_item_bill_unique UNIQUE(order_id, order_item_id, client_bill_id)
);

CREATE INDEX IF NOT EXISTS order_bill_split_items_order_idx ON order_bill_split_items(order_id);
CREATE INDEX IF NOT EXISTS order_bill_split_items_split_idx ON order_bill_split_items(order_bill_split_id);
CREATE INDEX IF NOT EXISTS order_bill_split_items_item_idx ON order_bill_split_items(order_item_id);
