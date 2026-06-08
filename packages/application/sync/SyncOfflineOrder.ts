/**
 * SyncOfflineOrder Use Case (Sprint 4 + Sprint 5)
 *
 * Accepts a batch of offline orders from a terminal and processes each order
 * through an injected sync repository port. DB audit rows, conflict persistence,
 * and schema mapping are infrastructure responsibilities.
 */

import type { CreateAndPayOrderItemInput } from '../orders/CreateAndPayOrder';
import type { SyncOfflineOrderRepositoryPort } from './ports';

export interface SyncOrderItemInput {
  local_order_id: string;
  local_order_number: string;
  idempotency_key: string;
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
  fulfillment_mode?: 'standard' | 'instant';
  client_created_at?: string;
  source_terminal_id?: string;
}

export type SyncItemStatus = 'synced' | 'replayed' | 'conflict' | 'failed';

export interface SyncOrderItemResult {
  local_order_id: string;
  local_order_number: string;
  status: SyncItemStatus;
  server_order_id?: string;
  server_order_number?: string;
  warnings?: string[];
  error?: string;
}

export interface SyncBatchInput {
  tenant_id: string;
  terminal_id: string;
  outlet_id?: string | null;
  app_version?: string;
  orders: SyncOrderItemInput[];
}

export interface SyncBatchOutput {
  batch_id: string;
  processed: number;
  synced: number;
  replayed: number;
  failed: number;
  conflicts: number;
  results: SyncOrderItemResult[];
}

export class SyncOfflineOrder {
  constructor(private readonly repository: SyncOfflineOrderRepositoryPort) {}

  async execute(input: SyncBatchInput): Promise<SyncBatchOutput> {
    return this.repository.syncOfflineOrder(input);
  }
}
