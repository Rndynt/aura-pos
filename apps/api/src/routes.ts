import type { Express } from "express";
import { createServer, type Server } from "http";
import { tenantAuthGuard, tenantMiddleware } from "./http/middleware/tenant";
import { errorHandler } from "./http/middleware/errorHandler";
import routes from "./http/routes";
import { startCacheInvalidationSubscriber } from "./services/cacheInvalidation";
import {
  createCfdModule,
  registerCfdHttpRoutes,
  registerCfdWebSocketServer,
  startCfdPubSubBridge,
  type CfdModuleDependencies,
  CFD_MAX_PAYLOAD_BYTES,
  cfdMessageSchema,
} from "./realtime/cfd";

export { CFD_MAX_PAYLOAD_BYTES, cfdMessageSchema };

type RegisterRoutesDependencies = CfdModuleDependencies;

export async function registerRoutes(
  app: Express,
  dependencies: RegisterRoutesDependencies = {},
): Promise<Server> {
  startCacheInvalidationSubscriber();
  const cfdModule = createCfdModule(dependencies);
  startCfdPubSubBridge(cfdModule);
  registerCfdHttpRoutes(app, cfdModule);

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
  registerCfdWebSocketServer(httpServer, cfdModule);

  return httpServer;
}
