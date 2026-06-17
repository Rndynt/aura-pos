-- Outlets and user-outlet role assignments.
-- Dependency: tenants.

CREATE TABLE "outlets" (
  "id"         uuid         PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"  uuid         NOT NULL,
  "name"       text         NOT NULL DEFAULT 'Cabang Utama',
  "slug"       varchar(100) NOT NULL DEFAULT 'main',
  "address"    text,
  "phone"      varchar(50),
  "is_default" boolean      NOT NULL DEFAULT false,
  "is_active"  boolean      NOT NULL DEFAULT true,
  "created_at" timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- user_id is varchar (not uuid) because Better Auth uses text/nanoid for user IDs.
CREATE TABLE "user_outlet_assignments" (
  "id"         uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"    varchar     NOT NULL,
  "outlet_id"  uuid        NOT NULL,
  "role"       varchar(50) NOT NULL DEFAULT 'staff',
  "is_active"  boolean     NOT NULL DEFAULT true,
  "created_at" timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Foreign keys ──────────────────────────────────────────────────────────────
ALTER TABLE "outlets"
  ADD CONSTRAINT "outlets_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "user_outlet_assignments"
  ADD CONSTRAINT "user_outlet_assignments_outlet_id_outlets_id_fk"
  FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE cascade ON UPDATE no action;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX "outlets_tenant_idx"
  ON "outlets" ("tenant_id");
CREATE UNIQUE INDEX "outlets_tenant_slug_unique"
  ON "outlets" ("tenant_id", "slug");

CREATE INDEX "user_outlet_assignments_user_idx"
  ON "user_outlet_assignments" ("user_id");
CREATE INDEX "user_outlet_assignments_outlet_idx"
  ON "user_outlet_assignments" ("outlet_id");
CREATE UNIQUE INDEX "user_outlet_assignments_unique"
  ON "user_outlet_assignments" ("user_id", "outlet_id");
