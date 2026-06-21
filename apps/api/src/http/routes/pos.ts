/**
 * POS Routes — P9.3
 * Dedicated POS payment endpoint separate from order CRUD routes.
 */

import { Router } from 'express';
import { requireCashier } from '../middleware/rbac';
import * as POSPaymentController from '../controllers/POSPaymentController';

const router = Router();

// POST /api/pos/payments/submit — unified POS payment submission (P9.3)
router.post('/payments/submit', requireCashier, POSPaymentController.submitPOSPayment);

export default router;
