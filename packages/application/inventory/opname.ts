/**
 * Stock Opname Use Cases
 *
 * Business rules for the opname workflow:
 *   draft → submitted → approved (writes OPNAME_ADJUSTMENT movements + updates balances)
 *   draft | submitted → cancelled
 *
 * The use cases accept ports (not concrete implementations) so infrastructure
 * concerns (Drizzle, DB) never leak into this layer.
 */

import type { TransactionContext, UnitOfWorkPort } from '../shared/ports/UnitOfWorkPort';
import type {
  StockOpnameRepositoryPort,
  StockOpnameRecord,
  StockOpnameItemRecord,
  StockOpnameWithItems,
  CreateOpnameInput,
} from './ports/StockOpnameRepositoryPort';
import type { InventoryBalanceRepositoryPort } from './ports/InventoryBalanceRepositoryPort';
import type { InventoryMovementWriterPort } from './ports/InventoryMovementWriterPort';

// ── Domain errors ────────────────────────────────────────────────────────────

export class OpnameNotFoundError extends Error {
  readonly code = 'OPNAME_NOT_FOUND';
  readonly statusCode = 404;
  constructor(id: string) {
    super(`Opname ${id} tidak ditemukan`);
  }
}

export class OpnameStatusError extends Error {
  readonly code = 'OPNAME_STATUS_INVALID';
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
  }
}

// ── Dependency types ─────────────────────────────────────────────────────────

export interface OpnameDeps {
  opnameRepo: StockOpnameRepositoryPort;
  balanceRepo: InventoryBalanceRepositoryPort;
  movementWriter: InventoryMovementWriterPort;
  unitOfWork: UnitOfWorkPort;
}

// ── Use cases ────────────────────────────────────────────────────────────────

/**
 * Create a new draft opname for an outlet.
 * Auto-populates items via the caller (route creates items after calling this).
 */
export async function createOpname(
  { opnameRepo }: Pick<OpnameDeps, 'opnameRepo'>,
  input: CreateOpnameInput,
): Promise<StockOpnameRecord> {
  return opnameRepo.create(input);
}

/**
 * Update the counted quantity for a single opname item.
 * Only allowed when opname is in 'draft' status.
 */
export async function updateOpnameItem(
  { opnameRepo }: Pick<OpnameDeps, 'opnameRepo'>,
  input: {
    opnameId: string;
    tenantId: string;
    productId: string;
    countedQuantity: number;
    notes?: string | null;
  },
): Promise<StockOpnameItemRecord> {
  const opname = await opnameRepo.findById(input.opnameId, input.tenantId);
  if (!opname) throw new OpnameNotFoundError(input.opnameId);
  if (opname.status !== 'draft') {
    throw new OpnameStatusError('Hanya opname berstatus draft yang dapat diubah');
  }

  const existingItem = opname.items.find((i) => i.productId === input.productId);
  const systemQty = existingItem?.systemQuantity ?? 0;

  return opnameRepo.upsertItem({
    opnameId: input.opnameId,
    productId: input.productId,
    systemQuantity: systemQty,
    countedQuantity: input.countedQuantity,
    notes: input.notes ?? null,
  });
}

/**
 * Submit a draft opname for approval.
 */
export async function submitOpname(
  { opnameRepo }: Pick<OpnameDeps, 'opnameRepo'>,
  input: { opnameId: string; tenantId: string; submittedBy?: string },
): Promise<StockOpnameRecord | null> {
  const opname = await opnameRepo.findById(input.opnameId, input.tenantId);
  if (!opname) throw new OpnameNotFoundError(input.opnameId);
  if (opname.status !== 'draft') {
    throw new OpnameStatusError('Hanya opname berstatus draft yang dapat disubmit');
  }

  return opnameRepo.updateStatus(input.opnameId, input.tenantId, 'submitted', {
    submittedBy: input.submittedBy,
    submittedAt: new Date(),
  });
}

/**
 * Approve a submitted opname.
 *
 * For each item with non-zero variance:
 *   1. Writes an OPNAME_ADJUSTMENT movement (atomic, within transaction)
 *   2. Sets inventory_balances to the counted quantity
 *
 * Returns the approved opname with items.
 */
export async function approveOpname(
  { opnameRepo, balanceRepo, movementWriter, unitOfWork }: OpnameDeps,
  input: { opnameId: string; tenantId: string; approvedBy?: string },
): Promise<StockOpnameWithItems | null> {
  const opname = await opnameRepo.findById(input.opnameId, input.tenantId);
  if (!opname) throw new OpnameNotFoundError(input.opnameId);
  if (opname.status !== 'submitted') {
    throw new OpnameStatusError('Hanya opname berstatus submitted yang dapat disetujui');
  }

  const itemsWithVariance = opname.items.filter((i) => i.varianceQuantity !== 0);

  await unitOfWork.transaction(async (ctx: TransactionContext) => {
    for (const item of itemsWithVariance) {
      const balance = await balanceRepo.getBalance(
        input.tenantId,
        opname.outletId,
        item.productId,
        ctx,
      );
      const before = balance?.quantity ?? item.systemQuantity;
      const after = item.countedQuantity;
      const delta = item.varianceQuantity;
      const sign = delta > 0 ? '+' : '';

      const movement = await movementWriter.record(
        {
          tenantId: input.tenantId,
          outletId: opname.outletId,
          productId: item.productId,
          movementType: 'OPNAME_ADJUSTMENT',
          quantityDelta: delta,
          quantityBefore: before,
          quantityAfter: after,
          notes: `Opname ${opname.opnameNumber} — selisih ${sign}${delta}`,
          referenceType: 'opname',
          referenceId: opname.id,
          metadata: { opnameId: opname.id, opnameNumber: opname.opnameNumber },
        },
        ctx,
      );

      await balanceRepo.setQuantity(
        {
          tenantId: input.tenantId,
          outletId: opname.outletId,
          productId: item.productId,
          quantity: after,
          lastMovementId: movement.id,
          lastCountedAt: new Date(),
        },
        ctx,
      );
    }

    await opnameRepo.updateStatus(
      input.opnameId,
      input.tenantId,
      'approved',
      { approvedBy: input.approvedBy, approvedAt: new Date() },
      ctx,
    );
  });

  return opnameRepo.findById(input.opnameId, input.tenantId);
}

/**
 * Cancel an opname. Only allowed if not yet approved.
 */
export async function cancelOpname(
  { opnameRepo }: Pick<OpnameDeps, 'opnameRepo'>,
  input: { opnameId: string; tenantId: string },
): Promise<StockOpnameRecord | null> {
  const opname = await opnameRepo.findById(input.opnameId, input.tenantId);
  if (!opname) throw new OpnameNotFoundError(input.opnameId);
  if (opname.status === 'approved') {
    throw new OpnameStatusError('Opname yang sudah disetujui tidak dapat dibatalkan');
  }

  return opnameRepo.updateStatus(input.opnameId, input.tenantId, 'cancelled', {
    cancelledAt: new Date(),
  });
}
