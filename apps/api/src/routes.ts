import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { tenantMiddleware } from "./http/middleware/tenant";
import { errorHandler } from "./http/middleware/errorHandler";
import routes from "./http/routes";

// ─── Per-tenant CFD state (in-memory) ────────────────────────────────────────
// Key: tenantId, Value: latest CFD message JSON string
const cfdLatestState = new Map<string, string>();

// Key: tenantId, Value: Set of connected WebSocket clients
const cfdClients = new Map<string, Set<WebSocket>>();

const MAX_CONNECTIONS_PER_TENANT = 100;
const HEARTBEAT_INTERVAL_MS = 30_000;

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

export async function registerRoutes(app: Express): Promise<Server> {
  // ── CFD push endpoint — BEFORE tenant middleware (handles tenantId itself) ──
  // POS calls this to push state; receiver (CFD on another device) gets it via WS
  app.post('/api/cfd/update', (req, res) => {
    const tenantId = req.headers['x-tenant-id'] as string | undefined;
    const message = req.body;

    if (!tenantId) {
      res.status(400).json({ error: 'Missing x-tenant-id header' });
      return;
    }
    if (!message || typeof message !== 'object') {
      res.status(400).json({ error: 'Invalid message body' });
      return;
    }

    const payload = JSON.stringify(message);

    // Cache latest state so newly connected CFD gets it immediately
    cfdLatestState.set(tenantId, payload);

    // Broadcast only to clients of THIS tenant
    broadcastToTenant(tenantId, payload);

    res.json({ success: true, clientCount: cfdClients.get(tenantId)?.size ?? 0 });
  });

  // Apply tenant middleware to all other /api routes
  app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/auth/')) return next();
    if (req.path.startsWith('/register')) return next();          // public registration
    if (req.path.startsWith('/tenants/by-slug/')) return next();  // public slug lookup
    if (req.path === '/tenants/register') return next();
    if (req.path === '/cfd/update') return next();
    // KDS public + device-key routes bypass tenant middleware
    if (req.path === '/kds/check-code') return next();
    if (req.path === '/kds/verify-code') return next();
    if (req.path.startsWith('/kds/orders')) return next(); // uses X-KDS-Key
    if (req.path === '/kds/generate-code') return next(); // uses Better Auth session
    if (req.path === '/kds/devices') return next();       // uses Better Auth session
    if (req.path.startsWith('/kds/devices/')) return next();
    return tenantMiddleware(req, res, next);
  });

  app.use('/api', routes);
  app.use('/api', errorHandler);

  const httpServer = createServer(app);

  // ── WebSocket server — path /ws/cfd?tenantId=xxx ──────────────────────────
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/cfd' });

  // Prevent memory leaks from too many listeners on the shared server
  wss.setMaxListeners(50);

  wss.on('connection', (ws, req) => {
    // Parse tenantId from query string
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const tenantId = url.searchParams.get('tenantId') ?? '';

    if (!tenantId) {
      ws.close(1008, 'Missing tenantId');
      return;
    }

    // Enforce max connections per tenant
    const tenantClients = cfdClients.get(tenantId);
    if (tenantClients && tenantClients.size >= MAX_CONNECTIONS_PER_TENANT) {
      ws.close(1013, 'Too many connections for tenant');
      return;
    }

    // Mark connection as alive for heartbeat tracking
    (ws as any)._isAlive = true;

    addCfdClient(tenantId, ws);

    // Send the latest cached state immediately so CFD doesn't start blank
    const latest = cfdLatestState.get(tenantId);
    if (latest && ws.readyState === WebSocket.OPEN) {
      ws.send(latest);
    }

    // Heartbeat: mark alive on pong
    ws.on('pong', () => {
      (ws as any)._isAlive = true;
    });

    // Clean up heartbeat interval and client tracking on close
    ws.on('close', () => {
      removeCfdClient(tenantId, ws);
    });
    ws.on('error', () => {
      removeCfdClient(tenantId, ws);
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

  // Clean up heartbeat interval when server shuts down
  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  return httpServer;
}
