import { logger } from './logging';
import type { Express, RequestHandler } from 'express';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { GetCurrentAuthUserProfile } from '@pos/application/auth';
import { DrizzleAuthUserProfileReader } from '@pos/infrastructure/repositories/auth';
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
  getCurrentAuthUserProfile?: GetCurrentAuthUserProfile;
};

export function registerAuthRoutes(app: Express, dependencies: AuthBootstrapDependencies = {}) {
  const authApi = dependencies.authApi ?? auth.api;
  const database = dependencies.database ?? authDb;
  const getCurrentAuthUserProfile = dependencies.getCurrentAuthUserProfile
    ?? new GetCurrentAuthUserProfile(new DrizzleAuthUserProfileReader(database));
  const authHandler = dependencies.authHandler ?? (toNodeHandler(auth) as unknown as RequestHandler);

  app.get('/api/auth/me', async (req, res) => {
    try {
      const session = await authApi.getSession({
        headers: fromNodeHeaders(req.headers),
      });
      const result = await getCurrentAuthUserProfile.execute(session?.user);

      if (!result.success) {
        return res.status(401).json({ success: false, error: 'Unauthenticated' });
      }

      return res.status(200).json({
        success: true,
        data: result.profile,
      });
    } catch (err) {
      logger.error('[auth/me]', err);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  app.all('/api/auth/*', authHandler);
}
