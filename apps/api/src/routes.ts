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
    if (req.path === '/tenants/register') return next();
    if (req.path === '/cfd/update') return next(); // already handled above
    return tenantMiddleware(req, res, next);
  });

  app.use('/api', routes);
  app.use('/api', errorHandler);

  const httpServer = createServer(app);

  // ── WebSocket server — path /ws/cfd?tenantId=xxx ──────────────────────────
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/cfd' });

  wss.on('connection', (ws, req) => {
    // Parse tenantId from query string
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const tenantId = url.searchParams.get('tenantId') ?? '';

    if (!tenantId) {
      ws.close(1008, 'Missing tenantId');
      return;
    }

    addCfdClient(tenantId, ws);

    // Send the latest cached state immediately so CFD doesn't start blank
    const latest = cfdLatestState.get(tenantId);
    if (latest && ws.readyState === WebSocket.OPEN) {
      ws.send(latest);
    }

    ws.on('close', () => removeCfdClient(tenantId, ws));
    ws.on('error', () => removeCfdClient(tenantId, ws));
  });

  return httpServer;
}
