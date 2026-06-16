/**
 * Entitlement Guard Middleware
 *
 * Protects API routes that require a commercial entitlement. Effective
 * entitlements are resolved from the entitlement SOT + tenant_entitlements via
 * the shared tenantEntitlements service — no legacy feature/module table lookup
 * and no cached projection.
 */

import type { Request, Response, NextFunction } from 'express';
import type { EntitlementCode } from '@pos/application/entitlements';
import { getEffectiveEntitlementMap } from '../../services/tenantEntitlements';

export function requireEntitlement(entitlementCode: EntitlementCode) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ success: false, error: 'Tenant not identified', code: 'NO_TENANT' });
      return;
    }

    try {
      const map = await getEffectiveEntitlementMap(tenantId);
      if (map[entitlementCode]) {
        next();
        return;
      }
      res.status(403).json({
        success: false,
        error: `Fitur ini memerlukan entitlement '${entitlementCode}'. Aktifkan dari Marketplace atau upgrade paket.`,
        code: 'ENTITLEMENT_REQUIRED',
        entitlement_code: entitlementCode,
      });
    } catch (err) {
      console.error('[entitlementGuard] requireEntitlement error:', err);
      next(err);
    }
  };
}

export function requireAnyEntitlement(entitlementCodes: EntitlementCode[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ success: false, error: 'Tenant not identified', code: 'NO_TENANT' });
      return;
    }

    try {
      const map = await getEffectiveEntitlementMap(tenantId);
      if (entitlementCodes.some((code) => map[code] === true)) {
        next();
        return;
      }
      res.status(403).json({
        success: false,
        error: `Fitur ini memerlukan salah satu entitlement: ${entitlementCodes.join(', ')}.`,
        code: 'ENTITLEMENT_REQUIRED',
        entitlement_codes: entitlementCodes,
      });
    } catch (err) {
      console.error('[entitlementGuard] requireAnyEntitlement error:', err);
      next(err);
    }
  };
}
