import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { sql } from "drizzle-orm";
import { fromNodeHeaders } from "better-auth/node";
import { nanoid } from "nanoid";
import { auth, authDb } from "../../lib/auth";

export type CfdDeviceContext = {
  deviceId: string;
  tenantId: string;
  deviceName: string;
};

export type CfdAuthDependencies = {
  auth: typeof auth;
  authDb: typeof authDb;
};

export type CfdAdminSession = {
  userId: string;
  tenantId: string;
};

export function hashCfdApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey, 'utf8').digest('hex');
}

export function getHeaderValue(req: Request, headerName: string): string | null {
  const value = req.headers[headerName.toLowerCase()];
  const firstValue = Array.isArray(value) ? value[0] : value;
  return typeof firstValue === 'string' && firstValue.trim() ? firstValue.trim() : null;
}

function extractCfdTokenFromSubprotocol(req: Request): string | null {
  const protocols = getHeaderValue(req, 'sec-websocket-protocol')
    ?.split(',')
    .map((protocol) => protocol.trim())
    .filter(Boolean) ?? [];

  for (const protocol of protocols) {
    if (protocol.startsWith('cfd-key.')) return protocol.slice('cfd-key.'.length);
    if (protocol.startsWith('cfd_token.')) return protocol.slice('cfd_token.'.length);
  }

  return null;
}

export function extractCfdTokenFromRequest(req: Request, url?: URL): string | null {
  const queryToken = url?.searchParams.get('cfdKey')
    ?? url?.searchParams.get('cfdToken')
    ?? url?.searchParams.get('token')
    ?? null;
  return queryToken
    ?? getHeaderValue(req, 'x-cfd-key')
    ?? extractCfdTokenFromSubprotocol(req);
}

export class CfdAuthService {
  constructor(private readonly dependencies: CfdAuthDependencies = { auth, authDb }) {}

  async lookupDeviceByToken(token: string | null): Promise<CfdDeviceContext | null> {
    if (!token) return null;

    const apiKeyHash = hashCfdApiKey(token);
    const rows = await this.dependencies.authDb.execute(sql`
      SELECT id, tenant_id, device_name
      FROM cfd_devices
      WHERE api_key = ${apiKeyHash} AND status = 'active'
      LIMIT 1
    `);
    const device = (rows as any[])[0];
    if (!device) return null;

    this.dependencies.authDb
      .execute(sql`UPDATE cfd_devices SET last_seen_at = now() WHERE id = ${device.id}`)
      .catch(() => {});

    return {
      deviceId: device.id,
      tenantId: device.tenant_id,
      deviceName: device.device_name ?? 'CFD',
    };
  }

  requireHttpToken(req: Request): Promise<CfdDeviceContext | null> {
    return this.lookupDeviceByToken(extractCfdTokenFromRequest(req));
  }

  requireWebSocketToken(req: Request, url: URL): Promise<CfdDeviceContext | null> {
    return this.lookupDeviceByToken(extractCfdTokenFromRequest(req, url));
  }

  async requireAdminSession(req: Request, res: Response): Promise<CfdAdminSession | null> {
    try {
      const session = await this.dependencies.auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
      if (!session?.user) {
        res.status(401).json({ success: false, error: 'Unauthenticated' });
        return null;
      }

      const rows = await this.dependencies.authDb.execute(
        sql`SELECT tenant_id FROM "user" WHERE id = ${session.user.id} LIMIT 1`,
      );
      const tenantId = (rows as any[])[0]?.tenant_id ?? null;
      if (!tenantId) {
        res.status(403).json({ success: false, error: 'Akun tidak terkait dengan tenant manapun' });
        return null;
      }

      return { userId: session.user.id, tenantId };
    } catch (err) {
      console.error('[cfd requireSession]', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
      return null;
    }
  }

  async createSessionToken(session: CfdAdminSession, req: Request): Promise<{
    token: string;
    deviceId: string;
    deviceName: string;
    tenantId: string;
    scope: 'cfd:read_write';
  }> {
    const rawToken = nanoid(32);
    const tokenHash = hashCfdApiKey(rawToken);
    const deviceId = nanoid();
    const rawDeviceName = typeof req.body?.deviceName === 'string' ? req.body.deviceName.trim() : '';
    const deviceName = rawDeviceName ? rawDeviceName.slice(0, 120) : 'Customer Display';

    await this.dependencies.authDb.execute(sql`
      INSERT INTO cfd_devices (id, tenant_id, device_name, api_key, status, created_at, activated_at)
      VALUES (${deviceId}, ${session.tenantId}, ${deviceName}, ${tokenHash}, 'active', now(), now())
    `);

    return {
      token: rawToken,
      deviceId,
      deviceName,
      tenantId: session.tenantId,
      scope: 'cfd:read_write',
    };
  }
}
