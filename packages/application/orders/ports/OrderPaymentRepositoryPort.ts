import type { OrderPayment } from '@pos/domain/orders/types';
import type { TransactionContext } from '../../shared/ports/UnitOfWorkPort';

export interface OrderPaymentDraft {
  order_id: string;
  amount: number;
  payment_method: OrderPayment['payment_method'];
  payment_status: OrderPayment['payment_status'];
  transaction_ref?: string | null;
  paid_at?: Date | null;
  notes?: string | null;
}

export interface OrderPaymentRepositoryPort {
  create(payment: OrderPaymentDraft, tenantId: string, context?: TransactionContext): Promise<OrderPayment>;
  findByOrderId(orderId: string, tenantId: string, context?: TransactionContext): Promise<OrderPayment[]>;
}
