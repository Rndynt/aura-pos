-- Seed order_types reference data.
-- Idempotent: safe to apply multiple times.
INSERT INTO "order_types" (
  "code", "name", "description",
  "is_on_premise", "need_table_number", "need_address",
  "allow_scheduled", "is_digital_product", "affects_service_charge", "is_active"
)
VALUES
  ('DINE_IN',   'Dine In',   'Customer eats on premises; may use table service and service charge.',    true,  true,  false, false, false, true,  true),
  ('TAKE_AWAY', 'Take Away', 'Customer orders for pickup/takeaway from the outlet.',                   false, false, false, false, false, false, true),
  ('DELIVERY',  'Delivery',  'Customer order is delivered to an address.',                             false, false, true,  true,  false, false, true),
  ('WALK_IN',   'Walk In',   'Default counter/walk-in order type for retail, laundry, service, and digital businesses.', false, false, false, false, false, false, true)
ON CONFLICT ("code") DO UPDATE SET
  "name"                  = EXCLUDED."name",
  "description"           = EXCLUDED."description",
  "is_on_premise"         = EXCLUDED."is_on_premise",
  "need_table_number"     = EXCLUDED."need_table_number",
  "need_address"          = EXCLUDED."need_address",
  "allow_scheduled"       = EXCLUDED."allow_scheduled",
  "is_digital_product"    = EXCLUDED."is_digital_product",
  "affects_service_charge" = EXCLUDED."affects_service_charge",
  "is_active"             = EXCLUDED."is_active",
  "updated_at"            = CURRENT_TIMESTAMP;
