/**
 * Tenant Middleware
 * Extracts tenant_id from request and validates tenant exists
 * Rejects requests without valid tenant_id
 */

import { Request, Response, NextFunction } from 'express';
import { db } from '@pos/infrastructure/database';
import { tenants } from '@shared/schema';
import { eq } from 'drizzle-orm';

declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
    }
  }
}

export async function tenantMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract tenant_id from header or query param
    const tenantId = 
      req.headers['x-tenant-id'] as string || 
      req.query.tenant_id as string;

    if (!tenantId) {
      res.status(400).json({
        error: 'Missing tenant_id',
        message: 'tenant_id is required in x-tenant-id header or tenant_id query parameter',
      });
      return;
    }

    // Try to validate tenant exists and is active (optional for now)
    try {
      const result = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      // If database validation succeeds, check tenant status
      if (result && Array.isArray(result) && result.length > 0) {
        const tenant = result[0];
        if (!tenant.isActive) {
          res.status(403).json({
            error: 'Tenant inactive',
            message: `Tenant ${tenantId} is not active`,
          });
          return;
        }
      }
      // Tenant must exist in every environment so local/dev catches isolation bugs early.
      else {
        res.status(404).json({
          error: 'Tenant not found',
          message: `Tenant ${tenantId} does not exist`,
        });
        return;
      }
    } catch (dbError) {
      throw dbError;
    }

    // Inject tenant_id into request context
    req.tenantId = tenantId;
    next();
  } catch (error) {
    console.error('Tenant middleware error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to validate tenant',
    });
  }
}
