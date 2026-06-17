import type { TransactionContext } from '../../shared/ports/UnitOfWorkPort';

export interface RecordMovementInput {
  tenantId: string;
  outletId: string;
  productId: string;
  movementType: string;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  notes?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface MovementRecord {
  id: string;
}

export interface InventoryMovementWriterPort {
  record(input: RecordMovementInput, ctx?: TransactionContext): Promise<MovementRecord>;
}
