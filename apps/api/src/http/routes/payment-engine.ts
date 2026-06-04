import { Router } from 'express';
import * as PaymentEngineController from '../controllers/PaymentEngineController';

const router = Router();

// POST /api/payment-engine/intents — Create a new payment intent
router.post('/intents', PaymentEngineController.createIntent);

// GET /api/payment-engine/intents/:id — Get payment intent by id
router.get('/intents/:id', PaymentEngineController.getIntent);

// GET /api/payment-engine/intents/:id/transactions — List transactions for intent
router.get('/intents/:id/transactions', PaymentEngineController.listTransactions);

// POST /api/payment-engine/intents/:id/manual-payments — Record manual payment
router.post('/intents/:id/manual-payments', PaymentEngineController.recordManualPayment);

export default router;
