import type {
  InventoryMovementWriterPort,
  MovementRecord,
  RecordMovementInput,
} from '@pos/application/inventory/ports';
import { inventoryMovements } from '@pos/infrastructure/db/schema';
import { db } from '../../database';
import { DrizzleUnitOfWork } from '../../unit-of-work';
import type { TransactionContext } from '@pos/application/shared/ports/UnitOfWorkPort';

export class DrizzleInventoryMovementWriter implements InventoryMovementWriterPort {
  async record(input: RecordMovementInput, ctx?: TransactionContext): Promise<MovementRecord> {
    const client = DrizzleUnitOfWork.fromContext(ctx) ?? db;

    const [row] = await client
      .insert(inventoryMovements)
      .values({
        tenantId: input.tenantId,
        outletId: input.outletId,
        productId: input.productId,
        movementType: input.movementType,
        quantityDelta: input.quantityDelta,
        quantityBefore: input.quantityBefore,
        quantityAfter: input.quantityAfter,
        notes: input.notes ?? null,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        metadata: (input.metadata ?? null) as any,
      })
      .returning({ id: inventoryMovements.id });

    return { id: row.id };
  }
}
