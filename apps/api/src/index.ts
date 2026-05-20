import 'dotenv/config';
import '../register-paths.ts';
import express, { type Request, Response, NextFunction } from "express";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import { auth, authDb } from "./lib/auth";
import { setupVite, serveStatic, log } from "./vite";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

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
        log("Better Auth schema ensured.");
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

    res.status(status).json({ message });
    throw err;
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
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
