import type { Express } from 'express';
import type { ApiConfig } from './env';
import type { AppContainer } from '../composition/createAppContainer';

export interface MountApiRoutesDependencies {
  app: Express;
  container: AppContainer;
  config: ApiConfig;
}

export async function mountApiRoutes({ app, container, config }: MountApiRoutesDependencies) {
  const { registerRoutes } = await import('../routes');
  return registerRoutes(app, { container, config });
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
