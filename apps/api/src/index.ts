import 'dotenv/config';
import '../register-paths.ts';
import express, { type Request, Response, NextFunction } from "express";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import { auth, authDb } from "./lib/auth";
// `log` is duplicated here so this file has no static dependency on ./vite.
// ./vite imports vite.config.ts → vite-plugin-pwa (a devDependency).
// A static top-level import would crash the production server at startup.
// Instead, ./vite is loaded dynamically only in the branch that needs it.
function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

// Trust proxy headers (Nginx, Cloudflare, etc.)
// Set to 1 to trust only the first proxy hop (prevents X-Forwarded-For spoofing)
app.set('trust proxy', 1);

// Health check endpoint — must be registered before any auth/tenant middleware
// so Coolify / load-balancers can reach it without credentials
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  log("DATABASE_URL environment variable is not set. Exiting.", "fatal");
  process.exit(1);
}

// /api/auth/me HARUS didaftarkan SEBELUM toNodeHandler(auth) agar tidak
// diambil alih oleh better-auth wildcard handler.
app.get("/api/auth/me", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session?.user) {
      return res.status(401).json({ success: false, error: "Unauthenticated" });
    }

    // Ambil custom fields (tenant_id, username, role) langsung dari DB
    // karena better-auth additionalFields tidak selalu reliable.
    const rows = await authDb.execute(
      sql`SELECT tenant_id, username, role FROM "user" WHERE id = ${session.user.id} LIMIT 1`
    );
    const extra = (rows as any[])[0] ?? {};

    return res.status(200).json({
      success: true,
      data: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        username: extra.username ?? null,
        tenantId: extra.tenant_id ?? null,
        role: extra.role ?? null,
      },
    });
  } catch (err) {
    console.error("[auth/me]", err);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// better-auth menangani semua route /api/auth/* lainnya (sign-in, sign-up, dsb.)
app.all("/api/auth/*", toNodeHandler(auth));

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

// ── CORS — allow *.aurapos.my.id + localhost + replit ────────────────────────
const BASE_DOMAIN = process.env.BASE_DOMAIN || 'aurapos.my.id';
app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  const allowed =
    origin.endsWith(`.${BASE_DOMAIN}`) ||
    origin === `https://${BASE_DOMAIN}` ||
    origin === 'http://localhost:5000' ||
    origin === 'http://localhost:5173' ||
    origin === 'http://localhost:3000' ||
    origin.endsWith('.replit.dev') ||
    origin.endsWith('.repl.co');
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-tenant-id,x-kds-key');
  }
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // ── Auto-migrate on every startup ─────────────────────────────────────────
  // Strategy:
  //   1. Try full drizzle migrate (works on fresh DBs).
  //   2. If it fails because tables already exist (existing DB without
  //      migration tracking), fall back to creating only the Better Auth
  //      tables using CREATE TABLE IF NOT EXISTS — safe to run repeatedly.
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const migrationsFolder = path.resolve(__dirname, "../../../migrations");
    const { db } = await import("@pos/infrastructure/database");
    log(`Running DB migrations from ${migrationsFolder}...`);
    await migrate(db, { migrationsFolder });
    log("DB migrations complete.");
  } catch (err) {
    const msg = (err as Error).message ?? "";
    const isExistingDb = msg.includes("already exists");
    if (isExistingDb) {
      // DB has existing POS tables (no migration tracking). Just ensure
      // the Better Auth tables exist — POS tables are already in place.
      log("Existing DB detected — ensuring Better Auth schema...", "warn");
      try {
        await authDb.execute(sql`
          -- Better Auth core tables
          CREATE TABLE IF NOT EXISTS "user" (
            "id" text PRIMARY KEY NOT NULL,
            "name" text NOT NULL,
            "email" text NOT NULL UNIQUE,
            "email_verified" boolean NOT NULL DEFAULT false,
            "image" text,
            "created_at" timestamp NOT NULL DEFAULT now(),
            "updated_at" timestamp NOT NULL DEFAULT now(),
            "username" text UNIQUE,
            "display_username" text,
            "role" text,
            "banned" boolean,
            "ban_reason" text,
            "ban_expires" timestamp,
            "tenant_id" text
          );
          CREATE TABLE IF NOT EXISTS "session" (
            "id" text PRIMARY KEY NOT NULL,
            "expires_at" timestamp NOT NULL,
            "token" text NOT NULL UNIQUE,
            "created_at" timestamp NOT NULL,
            "updated_at" timestamp NOT NULL,
            "ip_address" text,
            "user_agent" text,
            "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
            "impersonated_by" text
          );
          CREATE TABLE IF NOT EXISTS "account" (
            "id" text PRIMARY KEY NOT NULL,
            "account_id" text NOT NULL,
            "provider_id" text NOT NULL,
            "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
            "access_token" text,
            "refresh_token" text,
            "id_token" text,
            "access_token_expires_at" timestamp,
            "refresh_token_expires_at" timestamp,
            "scope" text,
            "password" text,
            "created_at" timestamp NOT NULL,
            "updated_at" timestamp NOT NULL
          );
          CREATE TABLE IF NOT EXISTS "verification" (
            "id" text PRIMARY KEY NOT NULL,
            "identifier" text NOT NULL,
            "value" text NOT NULL,
            "expires_at" timestamp NOT NULL,
            "created_at" timestamp DEFAULT now(),
            "updated_at" timestamp DEFAULT now()
          );
        `);
        // Add is_anonymous column if missing (anonymous plugin)
        await authDb.execute(sql`
          ALTER TABLE IF EXISTS "user"
            ADD COLUMN IF NOT EXISTS "is_anonymous" boolean DEFAULT false;
        `);
        // KDS device pairing table
        await authDb.execute(sql`
          CREATE TABLE IF NOT EXISTS kds_devices (
            id                   text PRIMARY KEY,
            tenant_id            text NOT NULL,
            device_name          text,
            api_key              text UNIQUE,
            activation_code      text,
            activation_expires_at timestamp,
            status               text NOT NULL DEFAULT 'pending',
            created_at           timestamp NOT NULL DEFAULT now(),
            activated_at         timestamp,
            last_seen_at         timestamp
          );
          CREATE INDEX IF NOT EXISTS kds_devices_tenant_idx ON kds_devices (tenant_id);
          CREATE INDEX IF NOT EXISTS kds_devices_api_key_idx ON kds_devices (api_key);
        `);

        // ── Multi-outlet schema (Sprint 6) ────────────────────────────────────
        await authDb.execute(sql`
          CREATE TABLE IF NOT EXISTS outlets (
            id         varchar PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id  varchar NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            name       text NOT NULL DEFAULT 'Cabang Utama',
            slug       varchar(100) NOT NULL DEFAULT 'main',
            address    text,
            phone      varchar(50),
            is_default boolean NOT NULL DEFAULT false,
            is_active  boolean NOT NULL DEFAULT true,
            created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX IF NOT EXISTS outlets_tenant_idx ON outlets (tenant_id);
          CREATE UNIQUE INDEX IF NOT EXISTS outlets_tenant_slug_unique ON outlets (tenant_id, slug);

          CREATE TABLE IF NOT EXISTS user_outlet_assignments (
            id         varchar PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id    varchar NOT NULL,
            outlet_id  varchar NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
            role       varchar(50) NOT NULL DEFAULT 'staff',
            is_active  boolean NOT NULL DEFAULT true,
            created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX IF NOT EXISTS user_outlet_assignments_user_idx ON user_outlet_assignments (user_id);
          CREATE INDEX IF NOT EXISTS user_outlet_assignments_outlet_idx ON user_outlet_assignments (outlet_id);
          CREATE UNIQUE INDEX IF NOT EXISTS user_outlet_assignments_unique ON user_outlet_assignments (user_id, outlet_id);

          CREATE TABLE IF NOT EXISTS outlet_product_configs (
            id           varchar PRIMARY KEY DEFAULT gen_random_uuid(),
            outlet_id    varchar NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
            product_id   varchar NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            is_available boolean NOT NULL DEFAULT true,
            created_at   timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at   timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX IF NOT EXISTS outlet_product_configs_outlet_idx ON outlet_product_configs (outlet_id);
          CREATE UNIQUE INDEX IF NOT EXISTS outlet_product_configs_unique ON outlet_product_configs (outlet_id, product_id);
        `);

        // Seed 1 default outlet per existing tenant that doesn't have one yet
        await authDb.execute(sql`
          INSERT INTO outlets (id, tenant_id, name, slug, address, phone, is_default, is_active)
          SELECT gen_random_uuid(), id, 'Cabang Utama', 'main',
                 business_address, business_phone, true, true
          FROM tenants
          WHERE NOT EXISTS (
            SELECT 1 FROM outlets o WHERE o.tenant_id = tenants.id
          );
        `);

        // Fix outlets whose id is not a valid UUID (e.g. slug-based ids from old code).
        // Strategy: insert new row with UUID, cascade-update all FK children, delete old row.
        // This avoids FK constraint violations that occur when updating a PK in-place.
        await authDb.execute(sql`
          DO $$
          DECLARE
            bad RECORD;
            new_uuid TEXT;
          BEGIN
            FOR bad IN
              SELECT id, tenant_id, name, slug, address, phone, is_default, is_active, created_at, updated_at
              FROM outlets
              WHERE id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            LOOP
              new_uuid := gen_random_uuid()::text;
              -- Insert new row with proper UUID; use temp slug to avoid unique constraint collision
              INSERT INTO outlets (id, tenant_id, name, slug, address, phone, is_default, is_active, created_at, updated_at)
              VALUES (new_uuid, bad.tenant_id, bad.name, '__migrating_' || new_uuid, bad.address, bad.phone, bad.is_default, bad.is_active, bad.created_at, bad.updated_at);
              -- Cascade update all FK children to point to new UUID
              UPDATE outlet_product_configs  SET outlet_id = new_uuid WHERE outlet_id = bad.id;
              UPDATE "tables"                SET outlet_id = new_uuid WHERE outlet_id = bad.id;
              UPDATE orders                  SET outlet_id = new_uuid WHERE outlet_id = bad.id;
              UPDATE kitchen_tickets         SET outlet_id = new_uuid WHERE outlet_id = bad.id;
              UPDATE terminals               SET outlet_id = new_uuid WHERE outlet_id = bad.id;
              UPDATE user_outlet_assignments SET outlet_id = new_uuid WHERE outlet_id = bad.id;
              UPDATE inventory_movements     SET outlet_id = new_uuid WHERE outlet_id = bad.id;
              UPDATE sync_batches            SET outlet_id = new_uuid WHERE outlet_id = bad.id;
              UPDATE sync_events             SET outlet_id = new_uuid WHERE outlet_id = bad.id;
              UPDATE server_sync_conflicts   SET outlet_id = new_uuid WHERE outlet_id = bad.id;
              UPDATE tenant_order_types      SET outlet_id = new_uuid WHERE outlet_id = bad.id;
              -- Remove old row (no FK references remain)
              DELETE FROM outlets WHERE id = bad.id;
              -- Restore original slug
              UPDATE outlets SET slug = bad.slug WHERE id = new_uuid;
              RAISE NOTICE 'Fixed outlet id: % -> %', bad.id, new_uuid;
            END LOOP;
          END;
          $$;
        `);

        // Migrate all uuid-intended id/FK columns from varchar to uuid type.
        // Guard: skip if outlets.id is already uuid type.
        await authDb.execute(sql`
          DO $$
          DECLARE col_type text;
          BEGIN
            SELECT data_type INTO col_type FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'outlets' AND column_name = 'id';
            IF col_type <> 'character varying' THEN
              RAISE NOTICE 'UUID column migration already applied, skipping.';
              RETURN;
            END IF;

            -- Drop FK constraints (Drizzle naming: {table}_{col}_{ref_table}_{ref_col}_fk)
            -- Also try legacy _fkey variants with IF EXISTS so both name styles are handled
            ALTER TABLE outlet_product_configs  DROP CONSTRAINT IF EXISTS outlet_product_configs_outlet_id_outlets_id_fk;
            ALTER TABLE outlet_product_configs  DROP CONSTRAINT IF EXISTS outlet_product_configs_outlet_id_fkey;
            ALTER TABLE outlet_product_configs  DROP CONSTRAINT IF EXISTS outlet_product_configs_product_id_products_id_fk;
            ALTER TABLE outlet_product_configs  DROP CONSTRAINT IF EXISTS outlet_product_configs_product_id_fkey;
            ALTER TABLE user_outlet_assignments DROP CONSTRAINT IF EXISTS user_outlet_assignments_outlet_id_outlets_id_fk;
            ALTER TABLE user_outlet_assignments DROP CONSTRAINT IF EXISTS user_outlet_assignments_outlet_id_fkey;
            ALTER TABLE "tables"               DROP CONSTRAINT IF EXISTS tables_outlet_id_outlets_id_fk;
            ALTER TABLE "tables"               DROP CONSTRAINT IF EXISTS tables_outlet_id_fkey;
            ALTER TABLE tenant_order_types     DROP CONSTRAINT IF EXISTS tenant_order_types_outlet_id_outlets_id_fk;
            ALTER TABLE tenant_order_types     DROP CONSTRAINT IF EXISTS tenant_order_types_outlet_id_fkey;
            ALTER TABLE tenant_order_types     DROP CONSTRAINT IF EXISTS tenant_order_types_order_type_id_order_types_id_fk;
            ALTER TABLE tenant_order_types     DROP CONSTRAINT IF EXISTS tenant_order_types_order_type_id_fkey;
            ALTER TABLE orders                 DROP CONSTRAINT IF EXISTS orders_outlet_id_outlets_id_fk;
            ALTER TABLE orders                 DROP CONSTRAINT IF EXISTS orders_outlet_id_fkey;
            ALTER TABLE orders                 DROP CONSTRAINT IF EXISTS orders_order_type_id_order_types_id_fk;
            ALTER TABLE orders                 DROP CONSTRAINT IF EXISTS orders_order_type_id_fkey;
            ALTER TABLE order_items            DROP CONSTRAINT IF EXISTS order_items_order_id_orders_id_fk;
            ALTER TABLE order_items            DROP CONSTRAINT IF EXISTS order_items_order_id_fkey;
            ALTER TABLE order_items            DROP CONSTRAINT IF EXISTS order_items_product_id_products_id_fk;
            ALTER TABLE order_items            DROP CONSTRAINT IF EXISTS order_items_product_id_fkey;
            ALTER TABLE order_item_modifiers   DROP CONSTRAINT IF EXISTS order_item_modifiers_order_item_id_order_items_id_fk;
            ALTER TABLE order_item_modifiers   DROP CONSTRAINT IF EXISTS order_item_modifiers_order_item_id_fkey;
            ALTER TABLE order_payments         DROP CONSTRAINT IF EXISTS order_payments_order_id_orders_id_fk;
            ALTER TABLE order_payments         DROP CONSTRAINT IF EXISTS order_payments_order_id_fkey;
            ALTER TABLE kitchen_tickets        DROP CONSTRAINT IF EXISTS kitchen_tickets_outlet_id_outlets_id_fk;
            ALTER TABLE kitchen_tickets        DROP CONSTRAINT IF EXISTS kitchen_tickets_outlet_id_fkey;
            ALTER TABLE kitchen_tickets        DROP CONSTRAINT IF EXISTS kitchen_tickets_order_id_orders_id_fk;
            ALTER TABLE kitchen_tickets        DROP CONSTRAINT IF EXISTS kitchen_tickets_order_id_fkey;
            ALTER TABLE terminals              DROP CONSTRAINT IF EXISTS terminals_outlet_id_outlets_id_fk;
            ALTER TABLE terminals              DROP CONSTRAINT IF EXISTS terminals_outlet_id_fkey;
            ALTER TABLE inventory_movements    DROP CONSTRAINT IF EXISTS inventory_movements_outlet_id_outlets_id_fk;
            ALTER TABLE inventory_movements    DROP CONSTRAINT IF EXISTS inventory_movements_outlet_id_fkey;
            ALTER TABLE inventory_movements    DROP CONSTRAINT IF EXISTS inventory_movements_product_id_products_id_fk;
            ALTER TABLE inventory_movements    DROP CONSTRAINT IF EXISTS inventory_movements_product_id_fkey;
            ALTER TABLE inventory_movements    DROP CONSTRAINT IF EXISTS inventory_movements_order_id_orders_id_fk;
            ALTER TABLE inventory_movements    DROP CONSTRAINT IF EXISTS inventory_movements_order_id_fkey;
            ALTER TABLE sync_batches           DROP CONSTRAINT IF EXISTS sync_batches_outlet_id_outlets_id_fk;
            ALTER TABLE sync_batches           DROP CONSTRAINT IF EXISTS sync_batches_outlet_id_fkey;
            ALTER TABLE sync_events            DROP CONSTRAINT IF EXISTS sync_events_outlet_id_outlets_id_fk;
            ALTER TABLE sync_events            DROP CONSTRAINT IF EXISTS sync_events_outlet_id_fkey;
            ALTER TABLE server_sync_conflicts  DROP CONSTRAINT IF EXISTS server_sync_conflicts_outlet_id_outlets_id_fk;
            ALTER TABLE server_sync_conflicts  DROP CONSTRAINT IF EXISTS server_sync_conflicts_outlet_id_fkey;
            ALTER TABLE product_option_groups  DROP CONSTRAINT IF EXISTS product_option_groups_product_id_products_id_fk;
            ALTER TABLE product_option_groups  DROP CONSTRAINT IF EXISTS product_option_groups_product_id_fkey;
            ALTER TABLE product_options        DROP CONSTRAINT IF EXISTS product_options_option_group_id_product_option_groups_id_fk;
            ALTER TABLE product_options        DROP CONSTRAINT IF EXISTS product_options_option_group_id_fkey;
            ALTER TABLE products               DROP CONSTRAINT IF EXISTS products_category_id_product_categories_id_fk;
            ALTER TABLE products               DROP CONSTRAINT IF EXISTS products_category_id_fkey;

            -- Alter all PK id columns to uuid type
            ALTER TABLE outlets               ALTER COLUMN id TYPE uuid USING id::uuid;
            ALTER TABLE user_outlet_assignments ALTER COLUMN id TYPE uuid USING id::uuid;
            ALTER TABLE "tables"              ALTER COLUMN id TYPE uuid USING id::uuid;
            ALTER TABLE product_categories    ALTER COLUMN id TYPE uuid USING id::uuid;
            ALTER TABLE products              ALTER COLUMN id TYPE uuid USING id::uuid;
            ALTER TABLE outlet_product_configs ALTER COLUMN id TYPE uuid USING id::uuid;
            ALTER TABLE product_option_groups  ALTER COLUMN id TYPE uuid USING id::uuid;
            ALTER TABLE product_options        ALTER COLUMN id TYPE uuid USING id::uuid;
            ALTER TABLE order_types            ALTER COLUMN id TYPE uuid USING id::uuid;
            ALTER TABLE tenant_order_types     ALTER COLUMN id TYPE uuid USING id::uuid;
            ALTER TABLE orders                 ALTER COLUMN id TYPE uuid USING id::uuid;
            ALTER TABLE order_items            ALTER COLUMN id TYPE uuid USING id::uuid;
            ALTER TABLE order_item_modifiers   ALTER COLUMN id TYPE uuid USING id::uuid;
            ALTER TABLE order_payments         ALTER COLUMN id TYPE uuid USING id::uuid;
            ALTER TABLE kitchen_tickets        ALTER COLUMN id TYPE uuid USING id::uuid;
            ALTER TABLE tenant_features        ALTER COLUMN id TYPE uuid USING id::uuid;
            ALTER TABLE terminals              ALTER COLUMN id TYPE uuid USING id::uuid;
            ALTER TABLE sync_batches           ALTER COLUMN id TYPE uuid USING id::uuid;
            ALTER TABLE sync_events            ALTER COLUMN id TYPE uuid USING id::uuid;
            ALTER TABLE server_sync_conflicts  ALTER COLUMN id TYPE uuid USING id::uuid;
            ALTER TABLE inventory_movements    ALTER COLUMN id TYPE uuid USING id::uuid;

            -- Alter FK columns (outlet_id, product_id, order_id, etc.) to uuid
            ALTER TABLE user_outlet_assignments ALTER COLUMN outlet_id TYPE uuid USING outlet_id::uuid;
            ALTER TABLE "tables"               ALTER COLUMN outlet_id TYPE uuid USING outlet_id::uuid;
            ALTER TABLE tenant_order_types     ALTER COLUMN outlet_id TYPE uuid USING outlet_id::uuid;
            ALTER TABLE tenant_order_types     ALTER COLUMN order_type_id TYPE uuid USING order_type_id::uuid;
            ALTER TABLE orders                 ALTER COLUMN outlet_id TYPE uuid USING outlet_id::uuid;
            ALTER TABLE orders                 ALTER COLUMN order_type_id TYPE uuid USING order_type_id::uuid;
            ALTER TABLE order_items            ALTER COLUMN order_id TYPE uuid USING order_id::uuid;
            ALTER TABLE order_items            ALTER COLUMN product_id TYPE uuid USING product_id::uuid;
            ALTER TABLE order_item_modifiers   ALTER COLUMN order_item_id TYPE uuid USING order_item_id::uuid;
            ALTER TABLE order_payments         ALTER COLUMN order_id TYPE uuid USING order_id::uuid;
            ALTER TABLE kitchen_tickets        ALTER COLUMN outlet_id TYPE uuid USING outlet_id::uuid;
            ALTER TABLE kitchen_tickets        ALTER COLUMN order_id TYPE uuid USING order_id::uuid;
            ALTER TABLE terminals              ALTER COLUMN outlet_id TYPE uuid USING outlet_id::uuid;
            ALTER TABLE inventory_movements    ALTER COLUMN outlet_id TYPE uuid USING outlet_id::uuid;
            ALTER TABLE inventory_movements    ALTER COLUMN product_id TYPE uuid USING product_id::uuid;
            ALTER TABLE inventory_movements    ALTER COLUMN order_id TYPE uuid USING order_id::uuid;
            ALTER TABLE sync_batches           ALTER COLUMN outlet_id TYPE uuid USING outlet_id::uuid;
            ALTER TABLE sync_events            ALTER COLUMN outlet_id TYPE uuid USING outlet_id::uuid;
            ALTER TABLE server_sync_conflicts  ALTER COLUMN outlet_id TYPE uuid USING outlet_id::uuid;
            ALTER TABLE outlet_product_configs ALTER COLUMN outlet_id TYPE uuid USING outlet_id::uuid;
            ALTER TABLE outlet_product_configs ALTER COLUMN product_id TYPE uuid USING product_id::uuid;
            ALTER TABLE product_option_groups  ALTER COLUMN product_id TYPE uuid USING product_id::uuid;
            ALTER TABLE product_options        ALTER COLUMN option_group_id TYPE uuid USING option_group_id::uuid;
            ALTER TABLE products               ALTER COLUMN category_id TYPE uuid USING category_id::uuid;

            -- Re-add FK constraints
            ALTER TABLE outlet_product_configs  ADD CONSTRAINT outlet_product_configs_outlet_id_fkey  FOREIGN KEY (outlet_id)  REFERENCES outlets(id) ON DELETE CASCADE;
            ALTER TABLE outlet_product_configs  ADD CONSTRAINT outlet_product_configs_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
            ALTER TABLE user_outlet_assignments ADD CONSTRAINT user_outlet_assignments_outlet_id_fkey FOREIGN KEY (outlet_id)  REFERENCES outlets(id) ON DELETE CASCADE;
            ALTER TABLE "tables"               ADD CONSTRAINT tables_outlet_id_fkey               FOREIGN KEY (outlet_id)  REFERENCES outlets(id) ON DELETE CASCADE;
            ALTER TABLE tenant_order_types     ADD CONSTRAINT tenant_order_types_outlet_id_fkey    FOREIGN KEY (outlet_id)  REFERENCES outlets(id) ON DELETE CASCADE;
            ALTER TABLE tenant_order_types     ADD CONSTRAINT tenant_order_types_order_type_id_fkey FOREIGN KEY (order_type_id) REFERENCES order_types(id) ON DELETE CASCADE;
            ALTER TABLE orders                 ADD CONSTRAINT orders_outlet_id_fkey               FOREIGN KEY (outlet_id)  REFERENCES outlets(id) ON DELETE CASCADE;
            ALTER TABLE orders                 ADD CONSTRAINT orders_order_type_id_fkey            FOREIGN KEY (order_type_id) REFERENCES order_types(id);
            ALTER TABLE order_items            ADD CONSTRAINT order_items_order_id_fkey            FOREIGN KEY (order_id)   REFERENCES orders(id) ON DELETE CASCADE;
            ALTER TABLE order_items            ADD CONSTRAINT order_items_product_id_fkey          FOREIGN KEY (product_id) REFERENCES products(id);
            ALTER TABLE order_item_modifiers   ADD CONSTRAINT order_item_modifiers_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE;
            ALTER TABLE order_payments         ADD CONSTRAINT order_payments_order_id_fkey         FOREIGN KEY (order_id)   REFERENCES orders(id) ON DELETE CASCADE;
            ALTER TABLE kitchen_tickets        ADD CONSTRAINT kitchen_tickets_outlet_id_fkey       FOREIGN KEY (outlet_id)  REFERENCES outlets(id) ON DELETE CASCADE;
            ALTER TABLE kitchen_tickets        ADD CONSTRAINT kitchen_tickets_order_id_fkey        FOREIGN KEY (order_id)   REFERENCES orders(id) ON DELETE CASCADE;
            ALTER TABLE terminals              ADD CONSTRAINT terminals_outlet_id_fkey             FOREIGN KEY (outlet_id)  REFERENCES outlets(id) ON DELETE SET NULL;
            ALTER TABLE inventory_movements    ADD CONSTRAINT inventory_movements_outlet_id_fkey   FOREIGN KEY (outlet_id)  REFERENCES outlets(id) ON DELETE SET NULL;
            ALTER TABLE inventory_movements    ADD CONSTRAINT inventory_movements_product_id_fkey  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
            ALTER TABLE inventory_movements    ADD CONSTRAINT inventory_movements_order_id_fkey    FOREIGN KEY (order_id)   REFERENCES orders(id) ON DELETE SET NULL;
            ALTER TABLE sync_batches           ADD CONSTRAINT sync_batches_outlet_id_fkey          FOREIGN KEY (outlet_id)  REFERENCES outlets(id) ON DELETE SET NULL;
            ALTER TABLE sync_events            ADD CONSTRAINT sync_events_outlet_id_fkey           FOREIGN KEY (outlet_id)  REFERENCES outlets(id) ON DELETE SET NULL;
            ALTER TABLE server_sync_conflicts  ADD CONSTRAINT server_sync_conflicts_outlet_id_fkey FOREIGN KEY (outlet_id)  REFERENCES outlets(id) ON DELETE SET NULL;
            ALTER TABLE product_option_groups  ADD CONSTRAINT product_option_groups_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
            ALTER TABLE product_options        ADD CONSTRAINT product_options_option_group_id_fkey FOREIGN KEY (option_group_id) REFERENCES product_option_groups(id) ON DELETE CASCADE;
            ALTER TABLE products               ADD CONSTRAINT products_category_id_fkey            FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE SET NULL;

            RAISE NOTICE 'UUID column migration completed successfully.';
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'UUID column migration failed: %. Manual intervention may be needed.', SQLERRM;
          END;
          $$;
        `);

        // Add outlet_id columns to operational tables (all nullable, safe to re-run)
        await authDb.execute(sql`
          ALTER TABLE "tables"              ADD COLUMN IF NOT EXISTS outlet_id varchar REFERENCES outlets(id) ON DELETE CASCADE;
          ALTER TABLE tenant_order_types    ADD COLUMN IF NOT EXISTS outlet_id varchar REFERENCES outlets(id) ON DELETE CASCADE;
          ALTER TABLE orders                ADD COLUMN IF NOT EXISTS outlet_id varchar REFERENCES outlets(id) ON DELETE CASCADE;
          ALTER TABLE kitchen_tickets       ADD COLUMN IF NOT EXISTS outlet_id varchar REFERENCES outlets(id) ON DELETE CASCADE;
          ALTER TABLE terminals             ADD COLUMN IF NOT EXISTS outlet_id varchar REFERENCES outlets(id) ON DELETE SET NULL;
          ALTER TABLE sync_batches          ADD COLUMN IF NOT EXISTS outlet_id varchar REFERENCES outlets(id) ON DELETE SET NULL;
          ALTER TABLE sync_events           ADD COLUMN IF NOT EXISTS outlet_id varchar REFERENCES outlets(id) ON DELETE SET NULL;
          ALTER TABLE server_sync_conflicts ADD COLUMN IF NOT EXISTS outlet_id varchar REFERENCES outlets(id) ON DELETE SET NULL;
          ALTER TABLE inventory_movements   ADD COLUMN IF NOT EXISTS outlet_id varchar REFERENCES outlets(id) ON DELETE SET NULL;
          ALTER TABLE kds_devices           ADD COLUMN IF NOT EXISTS outlet_id varchar;
        `);

        // Indexes for outlet_id
        await authDb.execute(sql`
          CREATE INDEX IF NOT EXISTS tables_outlet_idx               ON "tables" (outlet_id);
          CREATE INDEX IF NOT EXISTS tenant_order_types_outlet_idx   ON tenant_order_types (outlet_id);
          CREATE INDEX IF NOT EXISTS orders_outlet_idx               ON orders (outlet_id);
          CREATE INDEX IF NOT EXISTS kitchen_tickets_outlet_idx      ON kitchen_tickets (outlet_id);
          CREATE INDEX IF NOT EXISTS terminals_outlet_idx            ON terminals (outlet_id);
          CREATE INDEX IF NOT EXISTS sync_batches_outlet_idx         ON sync_batches (outlet_id);
          CREATE INDEX IF NOT EXISTS sync_events_outlet_idx          ON sync_events (outlet_id);
          CREATE INDEX IF NOT EXISTS server_sync_conflicts_outlet_idx ON server_sync_conflicts (outlet_id);
          CREATE INDEX IF NOT EXISTS inventory_movements_outlet_idx  ON inventory_movements (outlet_id);
          CREATE INDEX IF NOT EXISTS kds_devices_outlet_idx          ON kds_devices (outlet_id);
        `);

        // Backfill outlet_id for existing rows using each tenant's default outlet
        await authDb.execute(sql`
          UPDATE "tables" t
          SET outlet_id = (SELECT o.id FROM outlets o WHERE o.tenant_id = t.tenant_id AND o.is_default = true LIMIT 1)
          WHERE t.outlet_id IS NULL;

          UPDATE orders ord
          SET outlet_id = (SELECT o.id FROM outlets o WHERE o.tenant_id = ord.tenant_id AND o.is_default = true LIMIT 1)
          WHERE ord.outlet_id IS NULL;

          UPDATE kitchen_tickets kt
          SET outlet_id = (SELECT o.id FROM outlets o WHERE o.tenant_id = kt.tenant_id AND o.is_default = true LIMIT 1)
          WHERE kt.outlet_id IS NULL;

          UPDATE terminals trm
          SET outlet_id = (SELECT o.id FROM outlets o WHERE o.tenant_id = trm.tenant_id AND o.is_default = true LIMIT 1)
          WHERE trm.outlet_id IS NULL;

          UPDATE inventory_movements im
          SET outlet_id = (SELECT o.id FROM outlets o WHERE o.tenant_id = im.tenant_id AND o.is_default = true LIMIT 1)
          WHERE im.outlet_id IS NULL;

          UPDATE kds_devices kd
          SET outlet_id = (SELECT o.id FROM outlets o WHERE o.tenant_id = kd.tenant_id AND o.is_default = true LIMIT 1)
          WHERE kd.outlet_id IS NULL;
        `);

        log("Multi-outlet schema ensured.");
      } catch (authErr) {
        log(`Better Auth schema setup failed: ${(authErr as Error).message}`, "warn");
      }
    } else {
      log(`DB migration failed: ${msg}`, "warn");
    }
  }

  const { registerRoutes } = await import("./routes");

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Log error in development for debugging
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[error-handler] ${status} ${message}`, err.stack);
    }

    if (!res.headersSent) {
      res.status(status).json({ message });
    }
    // Do NOT throw after sending response — causes unhandled rejection crash
  });

  if (app.get("env") === "development") {
    // Dynamic import keeps vite.ts (and its transitive vite-plugin-pwa
    // dependency) out of the module graph at production startup.
    const { setupVite } = await import("./vite.js");
    await setupVite(app, server);
  } else {
    // serveStatic.ts has zero Vite/devDependency imports — safe in production.
    const { serveStatic } = await import("./serveStatic.js");
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
