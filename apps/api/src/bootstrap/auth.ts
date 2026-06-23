import type { Express, RequestHandler } from 'express';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { sql } from 'drizzle-orm';
import { auth, authDb } from '../lib/auth';

type AuthSessionApi = {
  getSession(input: { headers: Headers }): Promise<{ user?: { id: string; name?: string | null; email?: string | null } } | null>;
};

type AuthDb = {
  execute(query: unknown): Promise<unknown>;
};

export type AuthBootstrapDependencies = {
  authApi?: AuthSessionApi;
  database?: AuthDb;
  authHandler?: RequestHandler;
};

export function registerAuthRoutes(app: Express, dependencies: AuthBootstrapDependencies = {}) {
  const authApi = dependencies.authApi ?? auth.api;
  const database = dependencies.database ?? authDb;
  const authHandler = dependencies.authHandler ?? (toNodeHandler(auth) as unknown as RequestHandler);

  app.get('/api/auth/me', async (req, res) => {
    try {
      const session = await authApi.getSession({
        headers: fromNodeHeaders(req.headers),
      });
      if (!session?.user) {
        return res.status(401).json({ success: false, error: 'Unauthenticated' });
      }

      const rows = await database.execute(
        sql`SELECT tenant_id, username, role FROM "user" WHERE id = ${session.user.id} LIMIT 1`,
      );
      const extra = (rows as any[])[0] ?? {};

      return res.status(200).json({
        success: true,
        data: {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          username: extra.username ?? null,
          tenantId: extra.tenant_id ?? null,
          role: extra.role ?? null,
        },
      });
    } catch (err) {
      console.error('[auth/me]', err);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  app.all('/api/auth/*', authHandler);
}
