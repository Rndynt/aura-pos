import type { Express } from 'express';

export function registerReadinessRoutes(app: Express) {
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });
}
