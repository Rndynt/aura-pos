ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS outlet_id uuid REFERENCES outlets(id) ON DELETE SET NULL;
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS payment_flow varchar(50) NOT NULL DEFAULT 'FULL';
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS payment_kind varchar(50) NOT NULL DEFAULT 'FULL_PAYMENT';
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS received_amount numeric(10,2);
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS change_amount numeric(10,2);
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS status varchar(50) NOT NULL DEFAULT 'succeeded';
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS split_id uuid;
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS sequence integer NOT NULL DEFAULT 1;
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS reference_note text;
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS metadata jsonb;

UPDATE order_payments op
SET tenant_id = o.tenant_id,
    outlet_id = o.outlet_id
FROM orders o
WHERE op.order_id = o.id
  AND op.tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS order_payments_tenant_idx ON order_payments(tenant_id);
CREATE INDEX IF NOT EXISTS order_payments_split_idx ON order_payments(split_id);

CREATE TABLE IF NOT EXISTS order_bill_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  split_no integer NOT NULL,
  split_label text,
  amount_due numeric(10,2) NOT NULL,
  amount_paid numeric(10,2) NOT NULL DEFAULT 0,
  status varchar(50) NOT NULL DEFAULT 'unpaid',
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT order_bill_splits_order_split_no_unique UNIQUE(order_id, split_no)
);

CREATE INDEX IF NOT EXISTS order_bill_splits_tenant_idx ON order_bill_splits(tenant_id);
CREATE INDEX IF NOT EXISTS order_bill_splits_order_idx ON order_bill_splits(order_id);
