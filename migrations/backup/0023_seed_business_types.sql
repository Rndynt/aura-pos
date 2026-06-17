-- Seed business_types reference data from ENTITLEMENT_CATALOG SOT.
-- Idempotent upsert: safe to apply multiple times without re-seeding errors.
-- Child bundle labels (kitchen_ticket, etc.) are NOT inserted here.
INSERT INTO business_types (code, name, description, is_active)
VALUES
  ('CAFE_RESTAURANT',     'Café & Restaurant',     'Food and beverage service',  true),
  ('RETAIL_MINIMARKET',   'Retail & Minimarket',   'Retail and minimarket store', true),
  ('LAUNDRY',             'Laundry',               'Laundry and cleaning service',true),
  ('SERVICE_APPOINTMENT', 'Service & Appointment', 'Appointment-based service',   true),
  ('DIGITAL_PPOB',        'Digital & PPOB',        'Digital products and bills',  true)
ON CONFLICT (code) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active   = EXCLUDED.is_active;
