/**
 * rbac.ts — Role-Based Access Control skeleton (Sprint 7)
 *
 * Defines POS roles and a `requireRole` middleware factory.
 * In production this will validate roles from the authenticated session/JWT.
 * During development, role can be overridden via `x-pos-role` header
 * (only when NODE_ENV !== "production").
 *
 * Roles:
 *  owner    — full access (billing, config, reports)
 *  manager  — refund, void, conflict resolution, reports
 *  cashier  — create order, payment, reprint, draft
 *  kitchen  — update fulfillment status only
 *  viewer   — read-only (reports, queue)
 */

import { Request, Response, NextFunction } from 'express';
import { auth, authDb } from '../../lib/auth';
import { fromNodeHeaders } from 'better-auth/node';
import { sql } from 'drizzle-orm';

// ── Role type ─────────────────────────────────────────────────────────────────

export type PosRole = 'owner' | 'manager' | 'cashier' | 'kitchen' | 'viewer';

const ROLE_HIERARCHY: Record<PosRole, number> = {
  owner:   50,
  manager: 40,
  cashier: 30,
  kitchen: 20,
  viewer:  10,
};

// ── Extend Express Request ────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      posRole?: PosRole;
      userId?: string;
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function hasRole(userRole: PosRole, required: PosRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[required];
}

const VALID_ROLES = new Set(Object.keys(ROLE_HIERARCHY));

/**
 * Resolve role from authenticated session.
 * Queries the user table for the role field set during registration/linking.
 */
async function resolveRoleFromRequest(req: Request): Promise<PosRole> {
  // Dev override via header (non-production only)
  if (process.env.NODE_ENV !== 'production') {
    const devRole = req.headers['x-pos-role'] as string | undefined;
    if (devRole && devRole in ROLE_HIERARCHY) {
      return devRole as PosRole;
    }
  }

  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (session?.user?.id) {
      req.userId = session.user.id;

      const rows = await authDb.execute(
        sql`SELECT role FROM "user" WHERE id = ${session.user.id} LIMIT 1`
      );
      const dbRole = (rows as any[])[0]?.role;

      if (dbRole && VALID_ROLES.has(dbRole)) {
        return dbRole as PosRole;
      }
    }
  } catch {
    // Session resolution failed — fall through to default
  }

  // Default: cashier (lowest privileged authenticated role)
  return 'cashier';
}

// ── Middleware factory ────────────────────────────────────────────────────────

/**
 * Attach `req.posRole` so downstream handlers can check permissions.
 * Call this early in the pipeline (after tenantMiddleware).
 */
export async function attachRole(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    req.posRole = await resolveRoleFromRequest(req);
    next();
  } catch {
    req.posRole = 'cashier';
    next();
  }
}

/**
 * Require a minimum role. Returns 403 if the caller's role is insufficient.
 *
 * @example
 *   router.post('/refunds', requireRole('manager'), RefundController.create)
 */
export function requireRole(minimumRole: PosRole) {
  return async function roleGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
    // Resolve role lazily if attachRole wasn't called
    const role = req.posRole ?? await resolveRoleFromRequest(req);
    if (!hasRole(role, minimumRole)) {
      res.status(403).json({
        error: 'Forbidden',
        message: `Tindakan ini membutuhkan role minimal "${minimumRole}". Role Anda: "${role}".`,
        code: 'INSUFFICIENT_ROLE',
      });
      return;
    }
    next();
  };
}

/**
 * Convenience guards for common permission gates.
 */
export const requireOwner   = requireRole('owner');
export const requireManager = requireRole('manager');
export const requireCashier = requireRole('cashier');
export const requireKitchen = requireRole('kitchen');
