import type { Request } from "express";
import type { Server } from "http";
import { WebSocket, WebSocketServer } from "ws";
import type { CfdDeviceContext } from "./CfdAuthService";
import { getCfdOutletKey } from "./CfdStateStore";
import type { CfdConnectionRegistry } from "./CfdConnectionRegistry";
import type { CfdStateStore } from "./CfdStateStore";

const MAX_CONNECTIONS_PER_TENANT = 100;
const HEARTBEAT_INTERVAL_MS = 30_000;

type RequireCfdWebSocketToken = (req: Request, url: URL) => Promise<CfdDeviceContext | null>;

type AliveWebSocket = WebSocket & { _isAlive?: boolean };

export class CfdWebSocketServer {
  constructor(
    private readonly registry: CfdConnectionRegistry,
    private readonly stateStore: CfdStateStore,
    private readonly requireCfdWebSocketToken: RequireCfdWebSocketToken,
  ) {}

  register(httpServer: Server): WebSocketServer {
    const wss = new WebSocketServer({ server: httpServer, path: '/ws/cfd' });

    // Prevent memory leaks from too many listeners on the shared server
    wss.setMaxListeners(50);

    wss.on('connection', async (ws, req) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const tenantId = url.searchParams.get('tenantId') ?? '';

      if (!tenantId) {
        ws.close(1008, 'Missing tenantId');
        return;
      }

      const device = await this.requireCfdWebSocketToken(req as Request, url);
      if (!device) {
        ws.close(1008, 'Invalid CFD token');
        return;
      }

      if (device.tenantId !== tenantId) {
        ws.close(1008, 'CFD token tenant mismatch');
        return;
      }

      if (this.registry.isAtConnectionLimit(device.tenantId, MAX_CONNECTIONS_PER_TENANT)) {
        ws.close(1013, 'Too many connections for tenant');
        return;
      }

      (ws as AliveWebSocket)._isAlive = true;
      this.registry.addClient(device.tenantId, ws);

      // Send the latest Redis-cached state immediately so CFD does not start blank.
      // State is scoped by tenant/outlet/device; outlet defaults to "global" for legacy clients.
      const outletId = getCfdOutletKey(req as Request, url);
      const latest = await this.stateStore.getLatestState(device, outletId);
      if (latest && ws.readyState === WebSocket.OPEN) {
        ws.send(latest);
      }

      ws.on('pong', () => {
        (ws as AliveWebSocket)._isAlive = true;
      });

      ws.on('close', () => {
        this.registry.removeClient(device.tenantId, ws);
      });
      ws.on('error', () => {
        this.registry.removeClient(device.tenantId, ws);
      });
    });

    const heartbeatInterval = setInterval(() => {
      wss.clients.forEach((ws) => {
        const aliveWs = ws as AliveWebSocket;
        if (aliveWs._isAlive === false) {
          return ws.terminate();
        }
        aliveWs._isAlive = false;
        ws.ping();
      });
    }, HEARTBEAT_INTERVAL_MS);

    const clearCfdHeartbeat = () => {
      clearInterval(heartbeatInterval);
    };
    wss.on('close', clearCfdHeartbeat);
    httpServer.on('close', clearCfdHeartbeat);

    return wss;
  }
}
