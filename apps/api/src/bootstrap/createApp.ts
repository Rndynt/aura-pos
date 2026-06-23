import express, { type RequestHandler } from 'express';
import compression from 'compression';
import type { ApiConfig } from './env';
import { createCorsMiddleware } from './cors';
import { registerAuthRoutes } from './auth';
import { createErrorHandlingMiddleware } from './errorHandling';
import { log } from './logging';
import { registerReadinessRoutes } from './readiness';
import { mountApiRoutes, mountWebRoutes } from './routes';
import { runStartupChecks } from './startupChecks';

export async function createApiApp(config: ApiConfig) {
  runStartupChecks(config);

  const app = express();

  app.use(compression({ threshold: 1024, level: 6 }) as unknown as RequestHandler);
  app.set('trust proxy', 1);

  registerReadinessRoutes(app);
  app.use(createCorsMiddleware(config));
  registerAuthRoutes(app);

  app.use(express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }));

  app.use((req, res, next) => {
    const start = Date.now();
    const requestPath = req.path;

    res.on('finish', () => {
      const duration = Date.now() - start;
      if (requestPath.startsWith('/api')) {
        log(`${req.method} ${requestPath} ${res.statusCode} in ${duration}ms`);
      }
    });

    next();
  });

  const server = await mountApiRoutes(app);
  app.use(createErrorHandlingMiddleware());
  await mountWebRoutes(app, server);

  return { app, server };
}

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown;
  }
}
