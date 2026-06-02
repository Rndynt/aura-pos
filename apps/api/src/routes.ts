import { createHash } from "node:crypto";
import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { fromNodeHeaders } from "better-auth/node";
import { nanoid } from "nanoid";
import { tenantAuthGuard, tenantMiddleware } from "./http/middleware/tenant";
import { errorHandler } from "./http/middleware/errorHandler";
import routes from "./http/routes";
import { auth, authDb } from "./lib/auth";
import { cacheChannels, cacheKeys, getCacheString, publishEvent, setCacheString, subscribeEvent } from "./services/distributedCache";
import { startCacheInvalidationSubscriber } from "./services/cacheInvalidation";

// Key: tenantId, Value: Set of connected WebSocket clients
const cfdClients = new Map<string, Set<WebSocket>>();

const MAX_CONNECTIONS_PER_TENANT = 100;
const HEARTBEAT_INTERVAL_MS = 30_000;
const CFD_LATEST_STATE_TTL_SECONDS = Number(process.env.CFD_STATE_TTL_SECONDS ?? 60 * 60 * 12);
const CFD_DEFAULT_OUTLET_KEY = "global";
let cfdPubSubStarted = false;
export const CFD_MAX_PAYLOAD_BYTES = 16 * 1024;

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const optionalBoundedString = (max: number) => z.string().trim().max(max).optional();
const moneyAmount = z.number().finite().nonnegative().max(1_000_000_000);

const cfdItemSchema = z.object({
  id: boundedString(128),
  name: boundedString(160),
  category: optionalBoundedString(120),
  variantName: optionalBoundedString(120),
  optionsSummary: optionalBoundedString(500),
  quantity: z.number().finite().positive().max(10_000),
  unitPrice: moneyAmount,
  itemTotal: moneyAmount,
}).strict();

const cfdBaseSchema = z.object({
  tenantName: boundedString(160),
});

export const cfdMessageSchema = z.discriminatedUnion('type', [
  cfdBaseSchema.extend({
    type: z.literal('idle'),
    logoText: optionalBoundedString(80),
  }).strict(),
  cfdBaseSchema.extend({
    type: z.literal('ordering'),
    orderNumber: boundedString(80),
    items: z.array(cfdItemSchema).max(100),
    subtotal: moneyAmount,
    tax: moneyAmount,
    serviceCharge: moneyAmount,
    total: moneyAmount,
    customerName: optionalBoundedString(160),
    tableNumber: optionalBoundedString(40),
    orderTypeName: optionalBoundedString(80),
  }).strict(),
  cfdBaseSchema.extend({
    type: z.literal('payment'),
    orderNumber: boundedString(80),
    total: moneyAmount,
    method: boundedString(80),
    items: z.array(cfdItemSchema).max(100),
    subtotal: moneyAmount,
    tax: moneyAmount,
    serviceCharge: moneyAmount,
    customerName: optionalBoundedString(160),
    tableNumber: optionalBoundedString(40),
  }).strict(),
  cfdBaseSchema.extend({
    type: z.literal('completed'),
    orderNumber: boundedString(80),
    total: moneyAmount,
    amountPaid: moneyAmount,
    change: moneyAmount,
    items: z.array(cfdItemSchema).max(100),
    subtotal: moneyAmount,
    tax: moneyAmount,
    serviceCharge: moneyAmount,
    customerName: optionalBoundedString(160),
  }).strict(),
  z.object({ type: z.literal('ping') }).strict(),
]);

type CfdDeviceContext = {
  deviceId: string;
  tenantId: string;
  deviceName: string;
};

type CfdAuthDependencies = {
  auth: typeof auth;
  authDb: typeof authDb;
};

type RegisterRoutesDependencies = {
  cfdAuthDependencies?: CfdAuthDependencies;
  requireCfdToken?: (req: Request) => Promise<CfdDeviceContext | null>;
  requireCfdWebSocketToken?: (req: Request, url: URL) => Promise<CfdDeviceContext | null>;
};

function addCfdClient(tenantId: string, ws: WebSocket) {
  if (!cfdClients.has(tenantId)) cfdClients.set(tenantId, new Set());
  cfdClients.get(tenantId)!.add(ws);
}

function removeCfdClient(tenantId: string, ws: WebSocket) {
  cfdClients.get(tenantId)?.delete(ws);
}

function broadcastToTenant(tenantId: string, payload: string) {
  const clients = cfdClients.get(tenantId);
  if (!clients) return;
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

function ensureCfdPubSubStarted(): void {
  if (cfdPubSubStarted) return;
  cfdPubSubStarted = true;

  void subscribeEvent(cacheChannels.cfd, (payload, meta) => {
    if (meta.isLocalEcho) return;
    const tenantId = typeof payload.tenantId === 'string' ? payload.tenantId : null;
    const message = typeof payload.message === 'string' ? payload.message : null;
    if (!tenantId || !message) return;
    broadcastToTenant(tenantId, message);
  });
}

function getCfdOutletKey(req: Request, url?: URL): string {
  return getHeaderValue(req, 'x-outlet-id')
    ?? url?.searchParams.get('outletId')?.trim()
    ?? CFD_DEFAULT_OUTLET_KEY;
}

function cfdLatestStateKey(device: CfdDeviceContext, outletId: string): string {
  return cacheKeys.cfdLatest(device.tenantId, outletId || CFD_DEFAULT_OUTLET_KEY, device.deviceId);
}

async function storeCfdLatestState(device: CfdDeviceContext, outletId: string, payload: string): Promise<void> {
  await setCacheString(cfdLatestStateKey(device, outletId), payload, CFD_LATEST_STATE_TTL_SECONDS);
}

async function getCfdLatestState(device: CfdDeviceContext, outletId: string): Promise<string | null> {
  return getCacheString(cfdLatestStateKey(device, outletId));
}

function hashCfdApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey, 'utf8').digest('hex');
}

function getHeaderValue(req: Request, headerName: string): string | null {
  const value = req.headers[headerName.toLowerCase()];
  const firstValue = Array.isArray(value) ? value[0] : value;
  return typeof firstValue === 'string' && firstValue.trim() ? firstValue.trim() : null;
}

function extractCfdTokenFromSubprotocol(req: Request): string | null {
  const protocols = getHeaderValue(req, 'sec-websocket-protocol')
    ?.split(',')
    .map((protocol) => protocol.trim())
    .filter(Boolean) ?? [];

  for (const protocol of protocols) {
    if (protocol.startsWith('cfd-key.')) return protocol.slice('cfd-key.'.length);
    if (protocol.startsWith('cfd_token.')) return protocol.slice('cfd_token.'.length);
  }

  return null;
}

function extractCfdTokenFromRequest(req: Request, url?: URL): string | null {
  const queryToken = url?.searchParams.get('cfdKey')
    ?? url?.searchParams.get('cfdToken')
    ?? url?.searchParams.get('token')
    ?? null;
  return queryToken
    ?? getHeaderValue(req, 'x-cfd-key')
    ?? extractCfdTokenFromSubprotocol(req);
}

async function lookupCfdDeviceByToken(
  token: string | null,
  authDependencies: CfdAuthDependencies,
): Promise<CfdDeviceContext | null> {
  if (!token) return null;

  const apiKeyHash = hashCfdApiKey(token);
  const rows = await authDependencies.authDb.execute(sql`
    SELECT id, tenant_id, device_name
    FROM cfd_devices
    WHERE api_key = ${apiKeyHash} AND status = 'active'
    LIMIT 1
  `);
  const device = (rows as any[])[0];
  if (!device) return null;

  authDependencies.authDb
    .execute(sql`UPDATE cfd_devices SET last_seen_at = now() WHERE id = ${device.id}`)
    .catch(() => {});

  return {
    deviceId: device.id,
    tenantId: device.tenant_id,
    deviceName: device.device_name ?? 'CFD',
  };
}

async function requireCfdHttpToken(
  req: Request,
  authDependencies: CfdAuthDependencies,
): Promise<CfdDeviceContext | null> {
  return lookupCfdDeviceByToken(extractCfdTokenFromRequest(req), authDependencies);
}

async function requireCfdWsToken(
  req: Request,
  url: URL,
  authDependencies: CfdAuthDependencies,
): Promise<CfdDeviceContext | null> {
  return lookupCfdDeviceByToken(extractCfdTokenFromRequest(req, url), authDependencies);
}

function getRawBodySize(req: Request): number | null {
  const rawBody = (req as Request & { rawBody?: unknown }).rawBody;
  if (Buffer.isBuffer(rawBody)) return rawBody.length;
  const contentLength = getHeaderValue(req, 'content-length');
  if (!contentLength) return null;
  const parsedLength = Number(contentLength);
  return Number.isFinite(parsedLength) ? parsedLength : null;
}

function serializeValidatedCfdMessage(message: unknown, res: Response): string | null {
  const rawSize = getRawBodySize(res.req);
  if (rawSize !== null && rawSize > CFD_MAX_PAYLOAD_BYTES) {
    res.status(413).json({ success: false, error: 'CFD payload too large' });
    return null;
  }

  const parsed = cfdMessageSchema.safeParse(message);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid CFD message body' });
    return null;
  }

  const payload = JSON.stringify(parsed.data);
  if (Buffer.byteLength(payload, 'utf8') > CFD_MAX_PAYLOAD_BYTES) {
    res.status(413).json({ success: false, error: 'CFD payload too large' });
    return null;
  }

  return payload;
}

async function requireCfdAdminSession(
  req: Request,
  res: Response,
  authDependencies: CfdAuthDependencies,
): Promise<{ userId: string; tenantId: string } | null> {
  try {
    const session = await authDependencies.auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session?.user) {
      res.status(401).json({ success: false, error: 'Unauthenticated' });
      return null;
    }

    const rows = await authDependencies.authDb.execute(
      sql`SELECT tenant_id FROM "user" WHERE id = ${session.user.id} LIMIT 1`,
    );
    const tenantId = (rows as any[])[0]?.tenant_id ?? null;
    if (!tenantId) {
      res.status(403).json({ success: false, error: 'Akun tidak terkait dengan tenant manapun' });
      return null;
    }

    return { userId: session.user.id, tenantId };
  } catch (err) {
    console.error('[cfd requireSession]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
    return null;
  }
}

export async function registerRoutes(
  app: Express,
  dependencies: RegisterRoutesDependencies = {},
): Promise<Server> {
  startCacheInvalidationSubscriber();
  ensureCfdPubSubStarted();
  const cfdAuthDependencies = dependencies.cfdAuthDependencies ?? { auth, authDb };
  const requireHttpCfdDevice = dependencies.requireCfdToken
    ?? ((req: Request) => requireCfdHttpToken(req, cfdAuthDependencies));
  const requireWsCfdDevice = dependencies.requireCfdWebSocketToken
    ?? ((req: Request, url: URL) => requireCfdWsToken(req, url, cfdAuthDependencies));

  // ── CFD device/session token endpoint — read/write CFD scope only ─────────
  app.post('/api/cfd/session-token', async (req, res) => {
    try {
      const session = await requireCfdAdminSession(req, res, cfdAuthDependencies);
      if (!session) return;

      const rawToken = nanoid(32);
      const tokenHash = hashCfdApiKey(rawToken);
      const deviceId = nanoid();
      const rawDeviceName = typeof req.body?.deviceName === 'string' ? req.body.deviceName.trim() : '';
      const deviceName = rawDeviceName ? rawDeviceName.slice(0, 120) : 'Customer Display';

      await cfdAuthDependencies.authDb.execute(sql`
        INSERT INTO cfd_devices (id, tenant_id, device_name, api_key, status, created_at, activated_at)
        VALUES (${deviceId}, ${session.tenantId}, ${deviceName}, ${tokenHash}, 'active', now(), now())
      `);

      res.json({
        success: true,
        data: {
          token: rawToken,
          deviceId,
          deviceName,
          tenantId: session.tenantId,
          scope: 'cfd:read_write',
        },
      });
    } catch (err) {
      console.error('[cfd/session-token]', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ── CFD push endpoint — BEFORE tenant middleware (uses CFD token tenant) ──
  app.post('/api/cfd/update', async (req, res) => {
    try {
      const requestedTenantId = getHeaderValue(req, 'x-tenant-id');
      const device = await requireHttpCfdDevice(req);

      if (!device) {
        res.status(401).json({ success: false, error: 'Missing or invalid X-CFD-Key' });
        return;
      }

      if (requestedTenantId && requestedTenantId !== device.tenantId) {
        res.status(403).json({ success: false, error: 'CFD token does not belong to requested tenant' });
        return;
      }

      const payload = serializeValidatedCfdMessage(req.body, res);
      if (!payload) return;

      const outletId = getCfdOutletKey(req);
      await storeCfdLatestState(device, outletId, payload);
      broadcastToTenant(device.tenantId, payload);
      void publishEvent(cacheChannels.cfd, { tenantId: device.tenantId, outletId, deviceId: device.deviceId, message: payload });

      res.json({ success: true, clientCount: cfdClients.get(device.tenantId)?.size ?? 0 });
    } catch (err) {
      console.error('[cfd/update]', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // Apply tenant middleware to all other /api routes
  app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/auth/')) return next();
    if (req.path.startsWith('/register')) return next();          // public registration
    if (req.path.startsWith('/tenants/by-slug/')) return next();  // public slug lookup
    if (req.path === '/tenants/register') return next();
    if (req.path === '/cfd/update') return next();
    if (req.path === '/cfd/session-token') return next();
    // KDS public + device-key routes bypass tenant middleware
    if (req.path === '/kds/check-code') return next();
    if (req.path === '/kds/verify-code') return next();
    if (req.path.startsWith('/kds/orders')) return next(); // uses X-KDS-Key
    if (req.path === '/kds/generate-code') return next(); // uses Better Auth session
    if (req.path === '/kds/devices') return next();       // uses Better Auth session
    if (req.path.startsWith('/kds/devices/')) return next();
    return tenantMiddleware(req, res, (err?: unknown) => {
      if (err) return next(err);
      return tenantAuthGuard(req, res, next);
    });
  });

  app.use('/api', routes);
  app.use('/api', errorHandler);

  const httpServer = createServer(app);

  // ── WebSocket server — path /ws/cfd?tenantId=xxx&cfdKey=xxx ───────────────
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/cfd' });

  // Prevent memory leaks from too many listeners on the shared server
  wss.setMaxListeners(50);

  wss.on('connection', async (ws, req) => {
    // Parse tenantId and token from query string / header / subprotocol
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const tenantId = url.searchParams.get('tenantId') ?? '';

    if (!tenantId) {
      ws.close(1008, 'Missing tenantId');
      return;
    }

    const device = await requireWsCfdDevice(req as Request, url);
    if (!device) {
      ws.close(1008, 'Invalid CFD token');
      return;
    }

    if (device.tenantId !== tenantId) {
      ws.close(1008, 'CFD token tenant mismatch');
      return;
    }

    // Enforce max connections per tenant
    const tenantClients = cfdClients.get(device.tenantId);
    if (tenantClients && tenantClients.size >= MAX_CONNECTIONS_PER_TENANT) {
      ws.close(1013, 'Too many connections for tenant');
      return;
    }

    // Mark connection as alive for heartbeat tracking
    (ws as any)._isAlive = true;

    addCfdClient(device.tenantId, ws);

    // Send the latest Redis-cached state immediately so CFD does not start blank.
    // State is scoped by tenant/outlet/device; outlet defaults to "global" for legacy clients.
    const outletId = getCfdOutletKey(req as Request, url);
    const latest = await getCfdLatestState(device, outletId);
    if (latest && ws.readyState === WebSocket.OPEN) {
      ws.send(latest);
    }

    // Heartbeat: mark alive on pong
    ws.on('pong', () => {
      (ws as any)._isAlive = true;
    });

    // Clean up heartbeat interval and client tracking on close
    ws.on('close', () => {
      removeCfdClient(device.tenantId, ws);
    });
    ws.on('error', () => {
      removeCfdClient(device.tenantId, ws);
    });
  });

  // Ping all connected clients every 30 seconds; terminate unresponsive ones
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if ((ws as any)._isAlive === false) {
        return ws.terminate();
      }
      (ws as any)._isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL_MS);

  // Clean up heartbeat interval when WebSocket or HTTP server shuts down
  const clearCfdHeartbeat = () => {
    clearInterval(heartbeatInterval);
  };
  wss.on('close', clearCfdHeartbeat);
  httpServer.on('close', clearCfdHeartbeat);

  return httpServer;
}
