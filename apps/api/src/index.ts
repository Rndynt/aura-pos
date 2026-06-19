import 'dotenv/config';
import '../register-paths.ts';
import express, { type Request, Response, NextFunction, type RequestHandler } from "express";
import compression from "compression";
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
import { runDbMigrations } from "./migrations/migrationRunner";

const app = express();

// Compress HTTP responses (gzip/brotli) for payloads > 1KB
app.use(compression({ threshold: 1024, level: 6 }) as unknown as RequestHandler);

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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-tenant-id,x-tenant-service-token,x-tenant-context-token,x-terminal-token,x-outlet-id,x-kds-key,x-cfd-key');
  }
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

// Optimized request logger — log method, path, status, duration (no response body)
app.use((req, res, next) => {
  const start = Date.now();
  const requestPath = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (requestPath.startsWith("/api")) {
      const logLine = `${req.method} ${requestPath} ${res.statusCode} in ${duration}ms`;
      log(logLine);
    }
  });

  next();
});

(async () => {
  const { registerRoutes } = await import("./routes");

  const server = await registerRoutes(app);
  const { startInventorySyncRetryJob } = await import("./jobs/inventorySyncRetryJob");
  startInventorySyncRetryJob();

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
    // Run DB migrations asynchronously after server is listening (non-blocking).
    // If migrations fail, stop applying later migrations and expose failure via logs/exitCode.
    void runMigrationAsync();
  });
})();

/**
 * Run DB migrations in the background after the server starts.
 *
 * The migration runner is fail-fast for real migration errors: it records a
 * non-zero error summary, stops before later dependent migrations, and sets
 * process.exitCode so deployment/runtime supervision can detect the failure.
 */
async function runMigrationAsync() {
  try {
    await runDbMigrations(log);
  } catch (error) {
    process.exitCode = 1;
    log(error instanceof Error ? error.message : String(error), "migrate");
  }
}
