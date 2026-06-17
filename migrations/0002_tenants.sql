-- Tenants, tenant entitlements, Better Auth tables, and legacy users table.
-- Dependency order: business_types must exist first (tenants FK).

-- ── Legacy users (kept for Drizzle schema compatibility) ─────────────────────
CREATE TABLE "users" (
  "id"       uuid  PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "username" text  NOT NULL,
  "password" text  NOT NULL,
  CONSTRAINT "users_username_unique" UNIQUE ("username")
);

-- ── Better Auth: user ─────────────────────────────────────────────────────────
CREATE TABLE "user" (
  "id"               text      PRIMARY KEY NOT NULL,
  "name"             text      NOT NULL,
  "email"            text      NOT NULL,
  "email_verified"   boolean   NOT NULL,
  "image"            text,
  "created_at"       timestamp NOT NULL,
  "updated_at"       timestamp NOT NULL,
  "username"         text,
  "display_username" text,
  "role"             text,
  "banned"           boolean,
  "ban_reason"       text,
  "ban_expires"      timestamp,
  "tenant_id"        text,
  "is_anonymous"     boolean   DEFAULT false,
  CONSTRAINT "user_email_unique"    UNIQUE ("email"),
  CONSTRAINT "user_username_unique" UNIQUE ("username")
);

-- ── Better Auth: session ──────────────────────────────────────────────────────
CREATE TABLE "session" (
  "id"               text      PRIMARY KEY NOT NULL,
  "expires_at"       timestamp NOT NULL,
  "token"            text      NOT NULL,
  "created_at"       timestamp NOT NULL,
  "updated_at"       timestamp NOT NULL,
  "ip_address"       text,
  "user_agent"       text,
  "user_id"          text      NOT NULL,
  "impersonated_by"  text,
  CONSTRAINT "session_token_unique" UNIQUE ("token"),
  CONSTRAINT "session_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action
);

-- ── Better Auth: account ──────────────────────────────────────────────────────
CREATE TABLE "account" (
  "id"                       text      PRIMARY KEY NOT NULL,
  "account_id"               text      NOT NULL,
  "provider_id"              text      NOT NULL,
  "user_id"                  text      NOT NULL,
  "access_token"             text,
  "refresh_token"            text,
  "id_token"                 text,
  "access_token_expires_at"  timestamp,
  "refresh_token_expires_at" timestamp,
  "scope"                    text,
  "password"                 text,
  "created_at"               timestamp NOT NULL,
  "updated_at"               timestamp NOT NULL,
  CONSTRAINT "account_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action
);

-- ── Better Auth: verification ─────────────────────────────────────────────────
CREATE TABLE "verification" (
  "id"         text      PRIMARY KEY NOT NULL,
  "identifier" text      NOT NULL,
  "value"      text      NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp,
  "updated_at" timestamp
);

-- ── Tenants ───────────────────────────────────────────────────────────────────
CREATE TABLE "tenants" (
  "id"                  uuid         PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name"                text         NOT NULL,
  "slug"                text         NOT NULL,
  "business_name"       text,
  "business_address"    text,
  "business_phone"      text,
  "business_email"      text,
  "business_type"       varchar(50)  NOT NULL DEFAULT 'CAFE_RESTAURANT',
  "settings"            json,
  "plan_tier"           varchar(50)  NOT NULL DEFAULT 'free',
  "subscription_status" varchar(50)  NOT NULL DEFAULT 'active',
  "trial_ends_at"       timestamp,
  "timezone"            text         NOT NULL DEFAULT 'UTC',
  "currency"            varchar(3)   NOT NULL DEFAULT 'USD',
  "locale"              varchar(10)  NOT NULL DEFAULT 'en-US',
  "is_active"           boolean      NOT NULL DEFAULT true,
  "created_at"          timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenants_slug_unique" UNIQUE ("slug"),
  CONSTRAINT "tenants_business_type_business_types_code_fk"
    FOREIGN KEY ("business_type") REFERENCES "public"."business_types"("code") ON DELETE no action ON UPDATE no action
);

-- ── Tenant entitlements (replaces tenant_features + tenant_module_configs) ────
CREATE TABLE "tenant_entitlements" (
  "id"               uuid         PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"        uuid         NOT NULL,
  "entitlement_code" text         NOT NULL,
  "source"           varchar(50)  NOT NULL,
  "status"           varchar(50)  NOT NULL DEFAULT 'active',
  "starts_at"        timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at"       timestamp,
  "config"           jsonb,
  "created_at"       timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_entitlements_source_check" CHECK ("source" IN ('purchase', 'manual_grant', 'trial')),
  CONSTRAINT "tenant_entitlements_status_check" CHECK ("status" IN ('active', 'expired', 'cancelled')),
  CONSTRAINT "tenant_entitlements_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX "tenant_entitlements_tenant_idx"
  ON "tenant_entitlements" ("tenant_id");
CREATE INDEX "tenant_entitlements_entitlement_code_idx"
  ON "tenant_entitlements" ("entitlement_code");
CREATE INDEX "tenant_entitlements_status_idx"
  ON "tenant_entitlements" ("status");
CREATE INDEX "tenant_entitlements_expires_at_idx"
  ON "tenant_entitlements" ("expires_at");
CREATE UNIQUE INDEX "tenant_entitlements_active_tenant_entitlement_unique"
  ON "tenant_entitlements" ("tenant_id", "entitlement_code")
  WHERE "status" = 'active';
