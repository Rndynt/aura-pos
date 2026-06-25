import { logger } from '../../bootstrap/logging';
/**
 * Order Types Controller
 * Handles order type listing and management
 */

import { Request, Response, NextFunction } from 'express';
import { container } from '../../container';

/**
 * GET /api/order-types
 * List all order types for the current tenant
 */
export async function listOrderTypes(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const tenantId = req.tenantId;

    if (!tenantId) {
      res.status(400).json({
        success: false,
        error: 'Missing tenant_id',
      });
      return;
    }

    const orderTypes = await container.orderTypeHandlers.findOrBootstrapForTenant(tenantId);

    res.status(200).json({
      success: true,
      data: orderTypes,
    });
  } catch (error: any) {
    logger.error('Error listing order types:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list order types',
      message: error.message,
    });
  }
}

/**
 * GET /api/order-types/all
 * List all order types (master data)
 */
export async function listAllOrderTypes(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const orderTypes = await container.orderTypeHandlers.findAll();

    res.status(200).json({
      success: true,
      data: orderTypes,
    });
  } catch (error: any) {
    logger.error('Error listing all order types:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list all order types',
      message: error.message,
    });
  }
}

/**
 * POST /api/order-types/:orderTypeId/enable
 * Enable an order type for the current tenant
 */
export async function enableOrderType(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const tenantId = req.tenantId;
    const { orderTypeId } = req.params;
    const { config } = req.body;

    if (!tenantId) {
      res.status(400).json({
        success: false,
        error: 'Missing tenant_id',
      });
      return;
    }

    const tenantOrderType = await container.orderTypeHandlers.enableForTenant(
      tenantId,
      orderTypeId,
      config
    );

    res.status(200).json({
      success: true,
      data: tenantOrderType,
      message: 'Order type enabled successfully',
    });
  } catch (error: any) {
    logger.error('Error enabling order type:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to enable order type',
      message: error.message,
    });
  }
}

/**
 * POST /api/order-types/:orderTypeId/disable
 * Disable an order type for the current tenant
 */
export async function disableOrderType(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const tenantId = req.tenantId;
    const { orderTypeId } = req.params;

    if (!tenantId) {
      res.status(400).json({
        success: false,
        error: 'Missing tenant_id',
      });
      return;
    }

    await container.orderTypeHandlers.disableForTenant(tenantId, orderTypeId);

    res.status(200).json({
      success: true,
      message: 'Order type disabled successfully',
    });
  } catch (error: any) {
    logger.error('Error disabling order type:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disable order type',
      message: error.message,
    });
  }
}
