import type { WebSocket } from "ws";

export class CfdConnectionRegistry {
  private readonly clients = new Map<string, Set<WebSocket>>();

  addClient(tenantId: string, ws: WebSocket): void {
    if (!this.clients.has(tenantId)) this.clients.set(tenantId, new Set());
    this.clients.get(tenantId)!.add(ws);
  }

  removeClient(tenantId: string, ws: WebSocket): void {
    this.clients.get(tenantId)?.delete(ws);
  }

  getClientCount(tenantId: string): number {
    return this.clients.get(tenantId)?.size ?? 0;
  }

  isAtConnectionLimit(tenantId: string, maxConnections: number): boolean {
    return this.getClientCount(tenantId) >= maxConnections;
  }

  broadcastToTenant(tenantId: string, payload: string): void {
    const clients = this.clients.get(tenantId);
    if (!clients) return;

    for (const client of clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  }
}
