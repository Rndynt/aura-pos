-- Kitchen tickets (Drizzle-managed) and KDS devices (raw SQL, outside Drizzle schema).
-- Dependencies: tenants, outlets, orders.

-- ── Kitchen Tickets ───────────────────────────────────────────────────────────
CREATE TABLE "kitchen_tickets" (
  "id"            uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"     uuid        NOT NULL,
  "outlet_id"     uuid,
  "order_id"      uuid        NOT NULL,
  "ticket_number" text        NOT NULL,
  "table_number"  text,
  "status"        varchar(50) NOT NULL DEFAULT 'pending',
  "items"         json        NOT NULL,
  "printed_at"    timestamp,
  "completed_at"  timestamp,
  "created_at"    timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "kitchen_tickets"
  ADD CONSTRAINT "kitchen_tickets_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "kitchen_tickets"
  ADD CONSTRAINT "kitchen_tickets_outlet_id_outlets_id_fk"
  FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "kitchen_tickets"
  ADD CONSTRAINT "kitchen_tickets_order_id_orders_id_fk"
  FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX "kitchen_tickets_tenant_idx"   ON "kitchen_tickets" ("tenant_id");
CREATE INDEX "kitchen_tickets_outlet_idx"   ON "kitchen_tickets" ("outlet_id");
CREATE INDEX "kitchen_tickets_order_idx"    ON "kitchen_tickets" ("order_id");
CREATE INDEX "kitchen_tickets_status_idx"   ON "kitchen_tickets" ("status");

-- ── KDS Devices (managed outside Drizzle schema) ──────────────────────────────
-- api_key stores only a SHA-256 hex hash; the raw key is returned once from
-- /api/kds/verify-code and is never stored in plaintext.
-- activation_locked_until protects against brute-force of the 6-digit code.
CREATE TABLE "kds_devices" (
  "id"                      uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"               uuid        NOT NULL,
  "outlet_id"               uuid,
  "device_name"             text,
  "api_key"                 text,
  "activation_code"         text,
  "activation_expires_at"   timestamptz,
  "activation_attempts"     integer     NOT NULL DEFAULT 0,
  "activation_locked_until" timestamptz,
  "status"                  varchar(50) NOT NULL DEFAULT 'pending',
  "created_at"              timestamptz NOT NULL DEFAULT now(),
  "activated_at"            timestamptz,
  "last_seen_at"            timestamptz
);

ALTER TABLE "kds_devices"
  ADD CONSTRAINT "kds_devices_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "kds_devices"
  ADD CONSTRAINT "kds_devices_outlet_id_outlets_id_fk"
  FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX "kds_devices_tenant_idx"
  ON "kds_devices" ("tenant_id");
CREATE INDEX "kds_devices_outlet_idx"
  ON "kds_devices" ("outlet_id");
-- Fast lookup of active device by hashed API key.
CREATE INDEX "kds_devices_active_api_key_idx"
  ON "kds_devices" ("api_key")
  WHERE "status" = 'active' AND "api_key" IS NOT NULL;
-- Fast lookup of pending device by activation code.
CREATE INDEX "kds_devices_pending_activation_code_idx"
  ON "kds_devices" ("activation_code")
  WHERE "status" = 'pending' AND "activation_code" IS NOT NULL;
