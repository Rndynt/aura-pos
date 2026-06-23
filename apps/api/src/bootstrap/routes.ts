import type { Express } from 'express';

export async function mountApiRoutes(app: Express) {
  const { registerRoutes } = await import('../routes');
  const server = await registerRoutes(app);
  const { startInventorySyncRetryJob } = await import('../jobs/inventorySyncRetryJob');
  startInventorySyncRetryJob();
  return server;
}

export async function mountWebRoutes(app: Express, server: Awaited<ReturnType<typeof mountApiRoutes>>) {
  if (app.get('env') === 'development') {
    const { setupVite } = await import('../vite.js');
    await setupVite(app, server);
    return;
  }

  const { serveStatic } = await import('../serveStatic.js');
  serveStatic(app);
}
