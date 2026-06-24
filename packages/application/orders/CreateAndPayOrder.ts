/**
 * CreateAndPayOrder Use Case (P0.2)
 *
 * True atomic create-order + record-payment flow. Persistence, database
 * transactions, row locks, and schema mapping are provided by an injected
 * application port so this layer stays independent from infrastructure.
 */

import type { SelectedOption, SelectedOptionGroup } from '@pos/domain/orders/types';
import type { CreateAndPayOrderRepositoryPort } from './ports';

export interface CreateAndPayOrderItemInput {
  product_id: string;
  product_name: string;
  base_price: number;
  quantity: number;
  variant_id?: string;
  variant_name?: string;
  variant_price_delta?: number;
  selected_options?: SelectedOption[];
  selected_option_groups?: SelectedOptionGroup[];
  notes?: string;
}

export interface CreateAndPayOrderInput {
  tenant_id: string;
  outlet_id?: string | null;
  items: CreateAndPayOrderItemInput[];
  order_type_id?: string;
  customer_name?: string;
  table_number?: string;
  notes?: string;
  tax_rate?: number;
  service_charge_rate?: number;
  amount: number;
  payment_method: 'CASH' | 'MANUAL_TRANSFER' | 'MANUAL_QRIS';
  payment_flow?: 'FULL' | 'DOWN_PAYMENT' | 'MULTI_PAYMENT' | 'SPLIT_BILL';
  payment_kind?: 'FULL_PAYMENT' | 'DOWN_PAYMENT' | 'REMAINING_PAYMENT' | 'MULTI_PAYMENT_LINE' | 'SPLIT_BILL_LINE';
  received_amount?: number;
  change_amount?: number;
  reference_note?: string;
  metadata?: Record<string, unknown>;
  client_payment_session_id?: string;
  transaction_ref?: string;
  payment_notes?: string;
  idempotency_key?: string;
  inventory_terminal_id?: string;
  fulfillment_mode?: 'standard' | 'instant';
}

export interface CreateAndPayOrderOutput {
  order: PersistedOrderResult;
  payment: PersistedPaymentResult;
  idempotent_replay?: boolean;
  remainingAmount: number;
  inventory_sync_error?: unknown;
}

export type PersistedOrderResult = {
  id: string;
  tenant_id?: string;
  order_number?: string;
  items?: unknown[];
  tax_amount?: number;
  service_charge_amount?: number;
  discount_amount?: number;
  total_amount?: number;
  paid_amount?: number;
  payment_status?: string;
  customer_name?: string;
  table_number?: string;
  created_at?: Date;
  updated_at?: Date;
  tenantId?: string | null;
  outletId?: string | null;
  orderTypeId?: string | null;
  salesChannel?: string | null;
  orderNumber?: string;
  orderDate?: Date;
  status?: string;
  subtotal?: number | string;
  taxAmount?: number | string;
  serviceCharge?: number | string;
  discountAmount?: number | string;
  total?: number | string;
  paidAmount?: number | string;
  paymentStatus?: string;
  customerName?: string | null;
  tableNumber?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  closedAt?: Date | null;
};

export type PersistedPaymentResult = {
  id: string;
  order_id?: string;
  payment_method?: string;
  payment_status?: string;
  transaction_ref?: string;
  paid_at?: Date;
  tenantId?: string | null;
  outletId?: string | null;
  orderId?: string;
  paymentFlow?: string;
  paymentKind?: string;
  paymentMethod?: string;
  amount?: number | string;
  receivedAmount?: number | string | null;
  changeAmount?: number | string | null;
  status?: string;
  paidAt?: Date | null;
  createdAt?: Date;
  referenceNote?: string | null;
};

export class CreateAndPayOrder {
  constructor(private readonly repository: CreateAndPayOrderRepositoryPort) {}

  async execute(input: CreateAndPayOrderInput): Promise<CreateAndPayOrderOutput> {
    if (!['standard', 'instant'].includes(input.fulfillment_mode ?? 'standard')) {
      throw new Error(`Invalid fulfillment_mode '${input.fulfillment_mode}'. Expected 'standard' or 'instant'.`);
    }

    return this.repository.createAndPay(input);
  }
}
