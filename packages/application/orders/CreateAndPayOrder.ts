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
  payment_method: 'cash' | 'card' | 'ewallet' | 'other';
  transaction_ref?: string;
  payment_notes?: string;
  idempotency_key?: string;
  inventory_terminal_id?: string;
  fulfillment_mode?: 'standard' | 'instant';
}

export interface CreateAndPayOrderOutput {
  order: any;
  payment: any;
  idempotent_replay?: boolean;
  remainingAmount: number;
  inventory_sync_error?: any;
}

export class CreateAndPayOrder {
  constructor(private readonly repository: CreateAndPayOrderRepositoryPort) {}

  async execute(input: CreateAndPayOrderInput): Promise<CreateAndPayOrderOutput> {
    if (!['standard', 'instant'].includes(input.fulfillment_mode ?? 'standard')) {
      throw new Error(`Invalid fulfillment_mode '${input.fulfillment_mode}'. Expected 'standard' or 'instant'.`);
    }

    return this.repository.createAndPay(input);
  }
}
