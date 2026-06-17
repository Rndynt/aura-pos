-- Align AuraPoS identifier columns to PostgreSQL native uuid.
--
-- This migration casts legacy varchar/text UUID columns with explicit preflight
-- checks. Legacy slug tenant ids are repaired in-place by generating UUID
-- tenant ids, preserving the original value in tenants.slug, and updating
-- tenant-owned references before the native uuid cast.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION aurapos_assert_uuid_castable(p_table regclass, p_column text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  invalid_value text;
BEGIN
  EXECUTE format(
    'SELECT %1$I::text FROM %2$s WHERE %1$I IS NOT NULL AND %1$I::text !~* %3$L LIMIT 1',
    p_column,
    p_table,
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) INTO invalid_value;

  IF invalid_value IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot cast %.% to uuid; invalid value: %', p_table, p_column, invalid_value;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION aurapos_column_exists(p_table regclass, p_column text)
RETURNS boolean
LANGUAGE sql
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = p_table
      AND attname = p_column
      AND NOT attisdropped
  );
$$;

CREATE OR REPLACE FUNCTION aurapos_alter_column_to_uuid(p_table regclass, p_column text, p_default_random boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  current_type text;
BEGIN
  IF NOT aurapos_column_exists(p_table, p_column) THEN
    RETURN;
  END IF;

  SELECT format_type(a.atttypid, a.atttypmod)
    INTO current_type
  FROM pg_attribute a
  WHERE a.attrelid = p_table
    AND a.attname = p_column
    AND NOT a.attisdropped;

  IF current_type = 'uuid' THEN
    IF p_default_random THEN
      EXECUTE format('ALTER TABLE %s ALTER COLUMN %I SET DEFAULT gen_random_uuid()', p_table, p_column);
    END IF;
    RETURN;
  END IF;

  PERFORM aurapos_assert_uuid_castable(p_table, p_column);
  EXECUTE format('ALTER TABLE %s ALTER COLUMN %I DROP DEFAULT', p_table, p_column);
  EXECUTE format('ALTER TABLE %s ALTER COLUMN %I TYPE uuid USING %I::uuid', p_table, p_column, p_column);

  IF p_default_random THEN
    EXECUTE format('ALTER TABLE %s ALTER COLUMN %I SET DEFAULT gen_random_uuid()', p_table, p_column);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION aurapos_drop_table_fks(p_table regclass)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  fk record;
BEGIN
  FOR fk IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = p_table
      AND contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', p_table, fk.conname);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION aurapos_add_fk(
  p_table regclass,
  p_constraint text,
  p_column text,
  p_ref_table regclass,
  p_ref_column text,
  p_on_delete text DEFAULT 'NO ACTION'
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  sql_on_delete text := '';
BEGIN
  IF NOT aurapos_column_exists(p_table, p_column) OR NOT aurapos_column_exists(p_ref_table, p_ref_column) THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = p_table AND conname = p_constraint) THEN
    RETURN;
  END IF;

  IF upper(p_on_delete) <> 'NO ACTION' THEN
    sql_on_delete := ' ON DELETE ' || p_on_delete;
  END IF;

  EXECUTE format(
    'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s(%I)%s ON UPDATE NO ACTION',
    p_table,
    p_constraint,
    p_column,
    p_ref_table,
    p_ref_column,
    sql_on_delete
  );
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'cfd_devices',
    'inventory_movements',
    'inventory_sync_errors',
    'kitchen_tickets',
    'order_item_modifiers',
    'order_items',
    'order_number_sequences',
    'order_payments',
    'orders',
    'outlet_product_configs',
    'outlets',
    'product_categories',
    'product_option_groups',
    'product_options',
    'products',
    'server_sync_conflicts',
    'sync_batches',
    'sync_events',
    'tables',
    'tenant_features',
    'tenant_module_configs',
    'tenant_order_types',
    'terminals',
    'user_outlet_assignments',
    'users'
  ] LOOP
    IF to_regclass(table_name) IS NOT NULL THEN
      PERFORM aurapos_drop_table_fks(to_regclass(table_name));
    END IF;
  END LOOP;
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  -- Repair legacy tenants.id values such as 'thamada' before UUID casting.
  -- FKs have already been dropped above, so tenant-owned references can be
  -- updated consistently in the same migration transaction.
  IF to_regclass('tenants') IS NOT NULL
     AND aurapos_column_exists('tenants'::regclass, 'id')
     AND aurapos_column_exists('tenants'::regclass, 'slug') THEN
    CREATE TEMP TABLE IF NOT EXISTS aurapos_tenant_id_repair (
      old_id text PRIMARY KEY,
      new_id uuid NOT NULL UNIQUE
    ) ON COMMIT DROP;

    INSERT INTO aurapos_tenant_id_repair (old_id, new_id)
    SELECT id::text, gen_random_uuid()
    FROM tenants
    WHERE id IS NOT NULL
      AND id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ON CONFLICT (old_id) DO NOTHING;

    IF EXISTS (SELECT 1 FROM aurapos_tenant_id_repair) THEN
      -- Preserve the legacy slug value before changing tenants.id. This is
      -- idempotent for rows where slug already matches the old id.
      UPDATE tenants t
      SET slug = COALESCE(NULLIF(t.slug, ''), r.old_id)
      FROM aurapos_tenant_id_repair r
      WHERE t.id::text = r.old_id;

      FOREACH table_name IN ARRAY ARRAY[
        'outlets',
        'tables',
        'tenant_module_configs',
        'product_categories',
        'products',
        'product_option_groups',
        'product_options',
        'tenant_order_types',
        'order_number_sequences',
        'orders',
        'kitchen_tickets',
        'tenant_features',
        'terminals',
        'sync_batches',
        'sync_events',
        'server_sync_conflicts',
        'inventory_movements',
        'inventory_sync_errors',
        'cfd_devices',
        'users'
      ] LOOP
        IF to_regclass(table_name) IS NOT NULL
           AND aurapos_column_exists(to_regclass(table_name), 'tenant_id') THEN
          EXECUTE format(
            'UPDATE %s child SET tenant_id = repair.new_id::text FROM aurapos_tenant_id_repair repair WHERE child.tenant_id::text = repair.old_id',
            to_regclass(table_name)
          );
        END IF;
      END LOOP;

      UPDATE tenants t
      SET id = r.new_id::text
      FROM aurapos_tenant_id_repair r
      WHERE t.id::text = r.old_id;
    END IF;
  END IF;
END;
$$;

DO $$
DECLARE
  column_spec text[];
  table_name text;
  column_name text;
  random_default boolean;
BEGIN
  FOREACH column_spec SLICE 1 IN ARRAY ARRAY[
    ARRAY['users', 'id', 'true'],
    ARRAY['tenants', 'id', 'true'],
    ARRAY['outlets', 'id', 'true'], ARRAY['outlets', 'tenant_id', 'false'],
    ARRAY['user_outlet_assignments', 'id', 'true'], ARRAY['user_outlet_assignments', 'outlet_id', 'false'],
    ARRAY['tables', 'id', 'true'], ARRAY['tables', 'tenant_id', 'false'], ARRAY['tables', 'outlet_id', 'false'], ARRAY['tables', 'current_order_id', 'false'],
    ARRAY['tenant_module_configs', 'tenant_id', 'false'],
    ARRAY['product_categories', 'id', 'true'], ARRAY['product_categories', 'tenant_id', 'false'],
    ARRAY['products', 'id', 'true'], ARRAY['products', 'tenant_id', 'false'], ARRAY['products', 'category_id', 'false'],
    ARRAY['outlet_product_configs', 'id', 'true'], ARRAY['outlet_product_configs', 'outlet_id', 'false'], ARRAY['outlet_product_configs', 'product_id', 'false'],
    ARRAY['product_option_groups', 'id', 'true'], ARRAY['product_option_groups', 'tenant_id', 'false'], ARRAY['product_option_groups', 'product_id', 'false'],
    ARRAY['product_options', 'id', 'true'], ARRAY['product_options', 'tenant_id', 'false'], ARRAY['product_options', 'option_group_id', 'false'],
    ARRAY['order_types', 'id', 'true'],
    ARRAY['tenant_order_types', 'id', 'true'], ARRAY['tenant_order_types', 'tenant_id', 'false'], ARRAY['tenant_order_types', 'outlet_id', 'false'], ARRAY['tenant_order_types', 'order_type_id', 'false'],
    ARRAY['order_number_sequences', 'tenant_id', 'false'],
    ARRAY['orders', 'id', 'true'], ARRAY['orders', 'tenant_id', 'false'], ARRAY['orders', 'outlet_id', 'false'], ARRAY['orders', 'order_type_id', 'false'],
    ARRAY['order_items', 'id', 'true'], ARRAY['order_items', 'order_id', 'false'], ARRAY['order_items', 'product_id', 'false'], ARRAY['order_items', 'variant_id', 'false'],
    ARRAY['order_item_modifiers', 'id', 'true'], ARRAY['order_item_modifiers', 'order_item_id', 'false'], ARRAY['order_item_modifiers', 'option_group_id', 'false'], ARRAY['order_item_modifiers', 'option_id', 'false'],
    ARRAY['order_payments', 'id', 'true'], ARRAY['order_payments', 'order_id', 'false'],
    ARRAY['kitchen_tickets', 'id', 'true'], ARRAY['kitchen_tickets', 'tenant_id', 'false'], ARRAY['kitchen_tickets', 'outlet_id', 'false'], ARRAY['kitchen_tickets', 'order_id', 'false'],
    ARRAY['tenant_features', 'id', 'true'], ARRAY['tenant_features', 'tenant_id', 'false'],
    ARRAY['terminals', 'id', 'true'], ARRAY['terminals', 'tenant_id', 'false'], ARRAY['terminals', 'outlet_id', 'false'],
    ARRAY['sync_batches', 'id', 'true'], ARRAY['sync_batches', 'tenant_id', 'false'], ARRAY['sync_batches', 'outlet_id', 'false'],
    ARRAY['sync_events', 'id', 'true'], ARRAY['sync_events', 'tenant_id', 'false'], ARRAY['sync_events', 'outlet_id', 'false'], ARRAY['sync_events', 'batch_id', 'false'],
    ARRAY['server_sync_conflicts', 'id', 'true'], ARRAY['server_sync_conflicts', 'tenant_id', 'false'], ARRAY['server_sync_conflicts', 'outlet_id', 'false'], ARRAY['server_sync_conflicts', 'server_order_id', 'false'],
    ARRAY['inventory_movements', 'id', 'true'], ARRAY['inventory_movements', 'tenant_id', 'false'], ARRAY['inventory_movements', 'outlet_id', 'false'], ARRAY['inventory_movements', 'product_id', 'false'], ARRAY['inventory_movements', 'order_id', 'false'],
    ARRAY['inventory_sync_errors', 'id', 'true'], ARRAY['inventory_sync_errors', 'tenant_id', 'false'], ARRAY['inventory_sync_errors', 'outlet_id', 'false'], ARRAY['inventory_sync_errors', 'order_id', 'false'], ARRAY['inventory_sync_errors', 'product_id', 'false'],
    ARRAY['cfd_devices', 'id', 'true'], ARRAY['cfd_devices', 'tenant_id', 'false']
  ] LOOP
    table_name := column_spec[1];
    column_name := column_spec[2];
    random_default := column_spec[3]::boolean;

    IF to_regclass(table_name) IS NOT NULL THEN
      PERFORM aurapos_alter_column_to_uuid(to_regclass(table_name), column_name, random_default);
    END IF;
  END LOOP;
END;
$$;

SELECT aurapos_add_fk('outlets', 'outlets_tenant_id_tenants_id_fk', 'tenant_id', 'tenants', 'id', 'CASCADE');
SELECT aurapos_add_fk('user_outlet_assignments', 'user_outlet_assignments_outlet_id_outlets_id_fk', 'outlet_id', 'outlets', 'id', 'CASCADE');
SELECT aurapos_add_fk('tables', 'tables_tenant_id_tenants_id_fk', 'tenant_id', 'tenants', 'id', 'CASCADE');
SELECT aurapos_add_fk('tables', 'tables_outlet_id_outlets_id_fk', 'outlet_id', 'outlets', 'id', 'CASCADE');
SELECT aurapos_add_fk('tenant_module_configs', 'tenant_module_configs_tenant_id_tenants_id_fk', 'tenant_id', 'tenants', 'id', 'CASCADE');
SELECT aurapos_add_fk('product_categories', 'product_categories_tenant_id_tenants_id_fk', 'tenant_id', 'tenants', 'id', 'CASCADE');
SELECT aurapos_add_fk('products', 'products_tenant_id_tenants_id_fk', 'tenant_id', 'tenants', 'id', 'CASCADE');
SELECT aurapos_add_fk('products', 'products_category_id_product_categories_id_fk', 'category_id', 'product_categories', 'id', 'SET NULL');
SELECT aurapos_add_fk('outlet_product_configs', 'outlet_product_configs_outlet_id_outlets_id_fk', 'outlet_id', 'outlets', 'id', 'CASCADE');
SELECT aurapos_add_fk('outlet_product_configs', 'outlet_product_configs_product_id_products_id_fk', 'product_id', 'products', 'id', 'CASCADE');
SELECT aurapos_add_fk('product_option_groups', 'product_option_groups_tenant_id_tenants_id_fk', 'tenant_id', 'tenants', 'id', 'CASCADE');
SELECT aurapos_add_fk('product_option_groups', 'product_option_groups_product_id_products_id_fk', 'product_id', 'products', 'id', 'CASCADE');
SELECT aurapos_add_fk('product_options', 'product_options_tenant_id_tenants_id_fk', 'tenant_id', 'tenants', 'id', 'CASCADE');
SELECT aurapos_add_fk('product_options', 'product_options_option_group_id_product_option_groups_id_fk', 'option_group_id', 'product_option_groups', 'id', 'CASCADE');
SELECT aurapos_add_fk('tenant_order_types', 'tenant_order_types_tenant_id_tenants_id_fk', 'tenant_id', 'tenants', 'id', 'CASCADE');
SELECT aurapos_add_fk('tenant_order_types', 'tenant_order_types_outlet_id_outlets_id_fk', 'outlet_id', 'outlets', 'id', 'CASCADE');
SELECT aurapos_add_fk('tenant_order_types', 'tenant_order_types_order_type_id_order_types_id_fk', 'order_type_id', 'order_types', 'id', 'CASCADE');
SELECT aurapos_add_fk('order_number_sequences', 'order_number_sequences_tenant_id_tenants_id_fk', 'tenant_id', 'tenants', 'id', 'CASCADE');
SELECT aurapos_add_fk('orders', 'orders_tenant_id_tenants_id_fk', 'tenant_id', 'tenants', 'id', 'CASCADE');
SELECT aurapos_add_fk('orders', 'orders_outlet_id_outlets_id_fk', 'outlet_id', 'outlets', 'id', 'CASCADE');
SELECT aurapos_add_fk('orders', 'orders_order_type_id_order_types_id_fk', 'order_type_id', 'order_types', 'id', 'NO ACTION');
SELECT aurapos_add_fk('order_items', 'order_items_order_id_orders_id_fk', 'order_id', 'orders', 'id', 'CASCADE');
SELECT aurapos_add_fk('order_items', 'order_items_product_id_products_id_fk', 'product_id', 'products', 'id', 'NO ACTION');
SELECT aurapos_add_fk('order_item_modifiers', 'order_item_modifiers_order_item_id_order_items_id_fk', 'order_item_id', 'order_items', 'id', 'CASCADE');
SELECT aurapos_add_fk('order_payments', 'order_payments_order_id_orders_id_fk', 'order_id', 'orders', 'id', 'CASCADE');
SELECT aurapos_add_fk('kitchen_tickets', 'kitchen_tickets_tenant_id_tenants_id_fk', 'tenant_id', 'tenants', 'id', 'CASCADE');
SELECT aurapos_add_fk('kitchen_tickets', 'kitchen_tickets_outlet_id_outlets_id_fk', 'outlet_id', 'outlets', 'id', 'CASCADE');
SELECT aurapos_add_fk('kitchen_tickets', 'kitchen_tickets_order_id_orders_id_fk', 'order_id', 'orders', 'id', 'CASCADE');
SELECT aurapos_add_fk('tenant_features', 'tenant_features_tenant_id_tenants_id_fk', 'tenant_id', 'tenants', 'id', 'CASCADE');
SELECT aurapos_add_fk('terminals', 'terminals_tenant_id_tenants_id_fk', 'tenant_id', 'tenants', 'id', 'CASCADE');
SELECT aurapos_add_fk('terminals', 'terminals_outlet_id_outlets_id_fk', 'outlet_id', 'outlets', 'id', 'SET NULL');
SELECT aurapos_add_fk('sync_batches', 'sync_batches_tenant_id_tenants_id_fk', 'tenant_id', 'tenants', 'id', 'CASCADE');
SELECT aurapos_add_fk('sync_batches', 'sync_batches_outlet_id_outlets_id_fk', 'outlet_id', 'outlets', 'id', 'SET NULL');
SELECT aurapos_add_fk('sync_events', 'sync_events_tenant_id_tenants_id_fk', 'tenant_id', 'tenants', 'id', 'CASCADE');
SELECT aurapos_add_fk('sync_events', 'sync_events_outlet_id_outlets_id_fk', 'outlet_id', 'outlets', 'id', 'SET NULL');
SELECT aurapos_add_fk('sync_events', 'sync_events_batch_id_sync_batches_id_fk', 'batch_id', 'sync_batches', 'id', 'CASCADE');
SELECT aurapos_add_fk('server_sync_conflicts', 'server_sync_conflicts_tenant_id_tenants_id_fk', 'tenant_id', 'tenants', 'id', 'CASCADE');
SELECT aurapos_add_fk('server_sync_conflicts', 'server_sync_conflicts_outlet_id_outlets_id_fk', 'outlet_id', 'outlets', 'id', 'SET NULL');
SELECT aurapos_add_fk('inventory_movements', 'inventory_movements_tenant_id_tenants_id_fk', 'tenant_id', 'tenants', 'id', 'CASCADE');
SELECT aurapos_add_fk('inventory_movements', 'inventory_movements_outlet_id_outlets_id_fk', 'outlet_id', 'outlets', 'id', 'SET NULL');
SELECT aurapos_add_fk('inventory_movements', 'inventory_movements_product_id_products_id_fk', 'product_id', 'products', 'id', 'CASCADE');
SELECT aurapos_add_fk('inventory_movements', 'inventory_movements_order_id_orders_id_fk', 'order_id', 'orders', 'id', 'SET NULL');
SELECT aurapos_add_fk('inventory_sync_errors', 'inventory_sync_errors_tenant_id_tenants_id_fk', 'tenant_id', 'tenants', 'id', 'CASCADE');
SELECT aurapos_add_fk('inventory_sync_errors', 'inventory_sync_errors_outlet_id_outlets_id_fk', 'outlet_id', 'outlets', 'id', 'SET NULL');
SELECT aurapos_add_fk('inventory_sync_errors', 'inventory_sync_errors_order_id_orders_id_fk', 'order_id', 'orders', 'id', 'SET NULL');
SELECT aurapos_add_fk('inventory_sync_errors', 'inventory_sync_errors_product_id_products_id_fk', 'product_id', 'products', 'id', 'SET NULL');
SELECT aurapos_add_fk('cfd_devices', 'cfd_devices_tenant_id_tenants_id_fk', 'tenant_id', 'tenants', 'id', 'CASCADE');

DROP FUNCTION aurapos_add_fk(regclass, text, text, regclass, text, text);
DROP FUNCTION aurapos_drop_table_fks(regclass);
DROP FUNCTION aurapos_alter_column_to_uuid(regclass, text, boolean);
DROP FUNCTION aurapos_column_exists(regclass, text);
DROP FUNCTION aurapos_assert_uuid_castable(regclass, text);
