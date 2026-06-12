/**
 * Orders Routes
 * Order management and payment endpoints
 */

import { Router } from 'express';
import * as OrdersController from '../controllers/OrdersController';
import * as OrderTypesController from '../controllers/OrderTypesController';
import { requireEntitlement } from '../middleware/entitlementGuard';
import { requireCashier, requireKitchen, requireManager } from '../middleware/rbac';

const router = Router();

// Order Types Routes
// GET /api/orders/order-types - List order types for tenant
router.get('/order-types', OrderTypesController.listOrderTypes);

// GET /api/orders/order-types/all - List all order types (master data)
router.get('/order-types/all', OrderTypesController.listAllOrderTypes);

// POST /api/orders/order-types/:orderTypeId/enable - Enable order type for tenant
router.post('/order-types/:orderTypeId/enable', requireManager, OrderTypesController.enableOrderType);

// POST /api/orders/order-types/:orderTypeId/disable - Disable order type for tenant
router.post('/order-types/:orderTypeId/disable', requireManager, OrderTypesController.disableOrderType);

// Order Routes (MUST be before /:id routes)
// GET /api/orders/queue/stream - SSE order queue updates
router.get('/queue/stream', OrdersController.streamOrderQueue);

// POST /api/orders/create-and-pay - Create order and record payment atomically [P3]
router.post('/create-and-pay', requireCashier, OrdersController.createAndPay);

// POST /api/orders - Create new order
router.post('/', requireCashier, OrdersController.createOrder);

// GET /api/orders/open - List open orders (must be before /:id)
router.get('/open', OrdersController.listOpenOrders);

// GET /api/orders/history - List order history (must be before /:id)
router.get('/history', OrdersController.listOrderHistory);

// GET /api/orders - List orders with filters
router.get('/', OrdersController.listOrders);

// GET /api/orders/:id - Get single order (MUST be last in GET routes)
router.get('/:id', OrdersController.getOrderById);

// PATCH /api/orders/:id - Update order
router.patch('/:id', requireCashier, OrdersController.updateOrder);

// PATCH /api/orders/:id/status - Update only the status (kitchen display use)
router.patch('/:id/status', requireKitchen, OrdersController.updateOrderStatus);

// POST /api/orders/:id/confirm - Confirm draft order
router.post('/:id/confirm', requireCashier, OrdersController.confirmOrder);

// POST /api/orders/:id/complete - Complete order
router.post('/:id/complete', requireCashier, OrdersController.completeOrder);

// POST /api/orders/:id/cancel - Cancel order
router.post('/:id/cancel', requireCashier, OrdersController.cancelOrder);

// POST /api/orders/:id/payments - Record payment
router.post('/:id/payments', requireCashier, OrdersController.recordPayment);

// POST /api/orders/:id/kitchen-ticket - Create kitchen ticket (requires restaurant kitchen ops entitlement)
router.post('/:id/kitchen-ticket', requireCashier, requireEntitlement('restaurant_kitchen_ops'), OrdersController.createKitchenTicket);

export default router;
