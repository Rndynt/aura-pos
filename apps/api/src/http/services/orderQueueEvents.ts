import { Response } from 'express';

type QueueListener = {
  tenantId: string;
  res: Response;
  lastPing: number;
};

const listeners = new Set<QueueListener>();

// Clean up stale listeners every 30 seconds
const CLEANUP_INTERVAL = 30_000;
const STALE_THRESHOLD = 60_000; // 60s without ping = stale

setInterval(() => {
  const now = Date.now();
  for (const listener of listeners) {
    if (now - listener.lastPing > STALE_THRESHOLD) {
      try { listener.res.end(); } catch {}
      listeners.delete(listener);
    }
  }
}, CLEANUP_INTERVAL);

export function subscribeOrderQueue(tenantId: string, res: Response) {
  const listener: QueueListener = { tenantId, res, lastPing: Date.now() };
  listeners.add(listener);

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, ts: Date.now() })}\n\n`);

  // Handle client disconnect
  res.on('close', () => {
    listeners.delete(listener);
  });

  res.on('error', () => {
    listeners.delete(listener);
  });

  // Send heartbeat every 15s to detect dead connections
  const heartbeat = setInterval(() => {
    if (!listeners.has(listener)) {
      clearInterval(heartbeat);
      return;
    }
    try {
      res.write(`: heartbeat\n\n`);
      listener.lastPing = Date.now();
    } catch {
      clearInterval(heartbeat);
      listeners.delete(listener);
    }
  }, 15_000);

  return () => {
    clearInterval(heartbeat);
    listeners.delete(listener);
  };
}

export function emitOrderQueueChanged(tenantId: string, payload: Record<string, unknown>) {
  const message = `event: order_queue_updated\ndata: ${JSON.stringify({
    tenantId,
    ...payload,
    ts: Date.now(),
  })}\n\n`;

  for (const listener of listeners) {
    if (listener.tenantId === tenantId) {
      try {
        listener.res.write(message);
      } catch {
        listeners.delete(listener);
      }
    }
  }
}
