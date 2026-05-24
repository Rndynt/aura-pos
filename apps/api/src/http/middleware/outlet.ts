import { Request, Response, NextFunction } from 'express';
import { db } from '@pos/infrastructure/database';
import { outlets } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

declare global {
  namespace Express {
    interface Request {
      outletId?: string;
    }
  }
}

/**
 * Resolves the active outlet for the current request.
 * Priority: x-outlet-id header → ?outlet_id query param → tenant's default outlet
 *
 * Must run AFTER tenantMiddleware (requires req.tenantId).
 */
export async function outletMiddleware(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return next();
    }

    const outletIdParam =
      (req.headers['x-outlet-id'] as string) ||
      (req.query.outlet_id as string);

    if (outletIdParam) {
      const rows = await db
        .select({ id: outlets.id })
        .from(outlets)
        .where(and(eq(outlets.tenantId, tenantId), eq(outlets.id, outletIdParam), eq(outlets.isActive, true)))
        .limit(1);

      if (rows.length) {
        req.outletId = rows[0].id;
        return next();
      }
    }

    const defaultRows = await db
      .select({ id: outlets.id })
      .from(outlets)
      .where(and(eq(outlets.tenantId, tenantId), eq(outlets.isDefault, true), eq(outlets.isActive, true)))
      .limit(1);

    if (defaultRows.length) {
      req.outletId = defaultRows[0].id;
    }

    next();
  } catch (err) {
    console.error('Outlet middleware error:', err);
    next();
  }
}
