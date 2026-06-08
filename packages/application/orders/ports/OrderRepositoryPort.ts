import type { Order, OrderItem } from '@pos/domain/orders/types';
import type { TransactionContext } from '../../shared/ports/UnitOfWorkPort';

export interface OrderFilters {
  status?: string[];
  paymentStatus?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
  outletId?: string;
}

export interface OrderDraft {
  tenant_id: string;
  outlet_id?: string | null;
  order_type_id?: string | null;
  order_number: string;
  subtotal: number;
  tax_amount: number;
  service_charge_amount: number;
  discount_amount: number;
  total_amount: number;
  paid_amount: number;
  payment_status: Order['payment_status'];
  status: Order['status'];
  customer_name?: string | null;
  table_number?: string | null;
  notes?: string | null;
  idempotency_key?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface OrderItemDraft extends Omit<OrderItem, 'id'> {
  id?: string;
}

export interface OrderRepositoryPort {
  findByTenant(tenantId: string, filters?: OrderFilters, context?: TransactionContext): Promise<Order[]>;
  countByTenant(tenantId: string, filters?: Omit<OrderFilters, 'limit' | 'offset'>, context?: TransactionContext): Promise<number>;
  findById(id: string, tenantId: string, context?: TransactionContext): Promise<Order | null>;
  findByIdempotencyKey(tenantId: string, idempotencyKey: string, context?: TransactionContext): Promise<Order | null>;
  create(order: OrderDraft, items: OrderItemDraft[], tenantId: string, context?: TransactionContext): Promise<Order>;
  update(id: string, order: Partial<OrderDraft>, tenantId: string, context?: TransactionContext): Promise<Order>;
  updateWithItems(id: string, order: Partial<OrderDraft>, items: OrderItemDraft[], tenantId: string, context?: TransactionContext): Promise<Order>;
  updatePaymentStatus(id: string, paidAmount: number, paymentStatus: Order['payment_status'], tenantId: string, context?: TransactionContext): Promise<Order>;
}
