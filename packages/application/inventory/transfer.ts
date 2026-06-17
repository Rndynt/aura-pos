/**
 * Stock Transfer Use Cases
 *
 * Business rules for the cross-outlet transfer workflow:
 *   draft → submitted (deducts source balance, writes TRANSFER_OUT movements)
 *   submitted → received (adds dest balance, writes TRANSFER_IN movements)
 *   draft | submitted → cancelled (reverses TRANSFER_OUT if submitted)
 *
 * Requires: inventory_advanced_stock + multi_location (enforced at API layer)
 */

import type { TransactionContext, UnitOfWorkPort } from '../shared/ports/UnitOfWorkPort';
import type {
  StockTransferRepositoryPort,
  StockTransferRecord,
  StockTransferWithItems,
  CreateTransferInput,
} from './ports/StockTransferRepositoryPort';
import type { InventoryBalanceRepositoryPort } from './ports/InventoryBalanceRepositoryPort';
import type { InventoryMovementWriterPort } from './ports/InventoryMovementWriterPort';

// ── Domain errors ────────────────────────────────────────────────────────────

export class TransferNotFoundError extends Error {
  readonly code = 'TRANSFER_NOT_FOUND';
  readonly statusCode = 404;
  constructor(id: string) {
    super(`Transfer ${id} tidak ditemukan`);
  }
}

export class TransferStatusError extends Error {
  readonly code = 'TRANSFER_STATUS_INVALID';
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
  }
}

export class TransferSameOutletError extends Error {
  readonly code = 'TRANSFER_SAME_OUTLET';
  readonly statusCode = 400;
  constructor() {
    super('Outlet asal dan tujuan tidak boleh sama');
  }
}

export class InsufficientTransferStockError extends Error {
  readonly code = 'INSUFFICIENT_TRANSFER_STOCK';
  readonly statusCode = 400;
  constructor(productId: string, available: number, requested: number) {
    super(
      `Stok tidak cukup untuk produk ${productId} di outlet asal (ada: ${available}, butuh: ${requested})`,
    );
  }
}

// ── Dependency types ─────────────────────────────────────────────────────────

export interface TransferDeps {
  transferRepo: StockTransferRepositoryPort;
  balanceRepo: InventoryBalanceRepositoryPort;
  movementWriter: InventoryMovementWriterPort;
  unitOfWork: UnitOfWorkPort;
}

// ── Use cases ────────────────────────────────────────────────────────────────

/**
 * Create a new draft transfer between two different outlets.
 */
export async function createTransfer(
  { transferRepo }: Pick<TransferDeps, 'transferRepo'>,
  input: CreateTransferInput,
): Promise<StockTransferWithItems> {
  if (input.fromOutletId === input.toOutletId) {
    throw new TransferSameOutletError();
  }
  return transferRepo.create(input);
}

/**
 * Submit a draft transfer.
 *
 * Atomically:
 *   - Checks available balance at source outlet for each item
 *   - Deducts source balance (applyDelta with negative delta)
 *   - Writes TRANSFER_OUT movement for each item
 *   - Updates transfer status to 'submitted'
 */
export async function submitTransfer(
  { transferRepo, balanceRepo, movementWriter, unitOfWork }: TransferDeps,
  input: { transferId: string; tenantId: string; submittedBy?: string },
): Promise<StockTransferWithItems | null> {
  const transfer = await transferRepo.findById(input.transferId, input.tenantId);
  if (!transfer) throw new TransferNotFoundError(input.transferId);
  if (transfer.status !== 'draft') {
    throw new TransferStatusError('Hanya transfer berstatus draft yang dapat disubmit');
  }

  await unitOfWork.transaction(async (ctx: TransactionContext) => {
    for (const item of transfer.items) {
      const balance = await balanceRepo.getBalance(
        input.tenantId,
        transfer.fromOutletId,
        item.productId,
        ctx,
      );
      const before = balance?.quantity ?? 0;

      if (before < item.quantity) {
        throw new InsufficientTransferStockError(item.productId, before, item.quantity);
      }

      const updatedBalance = await balanceRepo.applyDelta(
        {
          tenantId: input.tenantId,
          outletId: transfer.fromOutletId,
          productId: item.productId,
          quantityDelta: -item.quantity,
        },
        ctx,
      );

      await movementWriter.record(
        {
          tenantId: input.tenantId,
          outletId: transfer.fromOutletId,
          productId: item.productId,
          movementType: 'TRANSFER_OUT',
          quantityDelta: -item.quantity,
          quantityBefore: before,
          quantityAfter: updatedBalance.quantity,
          notes: `Transfer keluar — ${transfer.transferNumber}`,
          referenceType: 'transfer',
          referenceId: transfer.id,
          metadata: {
            transferId: transfer.id,
            transferNumber: transfer.transferNumber,
            toOutletId: transfer.toOutletId,
          },
        },
        ctx,
      );
    }

    await transferRepo.updateStatus(
      transfer.id,
      input.tenantId,
      'submitted',
      { submittedBy: input.submittedBy, submittedAt: new Date() },
      ctx,
    );
  });

  return transferRepo.findById(input.transferId, input.tenantId);
}

/**
 * Receive a submitted transfer.
 *
 * Atomically:
 *   - Adds destination balance for each item
 *   - Writes TRANSFER_IN movement for each item
 *   - Updates transfer status to 'received'
 */
export async function receiveTransfer(
  { transferRepo, balanceRepo, movementWriter, unitOfWork }: TransferDeps,
  input: { transferId: string; tenantId: string; receivedBy?: string },
): Promise<StockTransferWithItems | null> {
  const transfer = await transferRepo.findById(input.transferId, input.tenantId);
  if (!transfer) throw new TransferNotFoundError(input.transferId);
  if (transfer.status !== 'submitted') {
    throw new TransferStatusError('Hanya transfer berstatus submitted yang dapat diterima');
  }

  await unitOfWork.transaction(async (ctx: TransactionContext) => {
    for (const item of transfer.items) {
      const balance = await balanceRepo.getBalance(
        input.tenantId,
        transfer.toOutletId,
        item.productId,
        ctx,
      );
      const before = balance?.quantity ?? 0;

      const updatedBalance = await balanceRepo.applyDelta(
        {
          tenantId: input.tenantId,
          outletId: transfer.toOutletId,
          productId: item.productId,
          quantityDelta: item.quantity,
        },
        ctx,
      );

      await movementWriter.record(
        {
          tenantId: input.tenantId,
          outletId: transfer.toOutletId,
          productId: item.productId,
          movementType: 'TRANSFER_IN',
          quantityDelta: item.quantity,
          quantityBefore: before,
          quantityAfter: updatedBalance.quantity,
          notes: `Transfer masuk — ${transfer.transferNumber}`,
          referenceType: 'transfer',
          referenceId: transfer.id,
          metadata: {
            transferId: transfer.id,
            transferNumber: transfer.transferNumber,
            fromOutletId: transfer.fromOutletId,
          },
        },
        ctx,
      );
    }

    await transferRepo.updateStatus(
      transfer.id,
      input.tenantId,
      'received',
      { receivedBy: input.receivedBy, receivedAt: new Date() },
      ctx,
    );
  });

  return transferRepo.findById(input.transferId, input.tenantId);
}

/**
 * Cancel a transfer.
 *
 * If the transfer is still 'draft', simply marks it cancelled.
 * If 'submitted', reverses the TRANSFER_OUT by writing ADJUSTMENT_IN movements
 * and restoring source outlet balance before marking as cancelled.
 */
export async function cancelTransfer(
  { transferRepo, balanceRepo, movementWriter, unitOfWork }: TransferDeps,
  input: { transferId: string; tenantId: string; cancelledBy?: string },
): Promise<StockTransferWithItems | null> {
  const transfer = await transferRepo.findById(input.transferId, input.tenantId);
  if (!transfer) throw new TransferNotFoundError(input.transferId);
  if (transfer.status === 'received') {
    throw new TransferStatusError('Transfer yang sudah diterima tidak dapat dibatalkan');
  }
  if (transfer.status === 'cancelled') {
    throw new TransferStatusError('Transfer sudah dibatalkan');
  }

  await unitOfWork.transaction(async (ctx: TransactionContext) => {
    if (transfer.status === 'submitted') {
      for (const item of transfer.items) {
        const balance = await balanceRepo.getBalance(
          input.tenantId,
          transfer.fromOutletId,
          item.productId,
          ctx,
        );
        const before = balance?.quantity ?? 0;

        const updatedBalance = await balanceRepo.applyDelta(
          {
            tenantId: input.tenantId,
            outletId: transfer.fromOutletId,
            productId: item.productId,
            quantityDelta: item.quantity,
          },
          ctx,
        );

        await movementWriter.record(
          {
            tenantId: input.tenantId,
            outletId: transfer.fromOutletId,
            productId: item.productId,
            movementType: 'ADJUSTMENT_IN',
            quantityDelta: item.quantity,
            quantityBefore: before,
            quantityAfter: updatedBalance.quantity,
            notes: `Pembatalan transfer — ${transfer.transferNumber}`,
            referenceType: 'transfer',
            referenceId: transfer.id,
            metadata: {
              transferId: transfer.id,
              transferNumber: transfer.transferNumber,
              cancelReason: 'transfer_cancelled',
            },
          },
          ctx,
        );
      }
    }

    await transferRepo.updateStatus(
      transfer.id,
      input.tenantId,
      'cancelled',
      { cancelledBy: input.cancelledBy, cancelledAt: new Date() },
      ctx,
    );
  });

  return transferRepo.findById(input.transferId, input.tenantId);
}
