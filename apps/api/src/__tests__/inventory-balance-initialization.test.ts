import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ensureProductBalanceForOutlet,
  ensureTrackedProductBalancesForOutlet,
  type OutletContextPort,
  type ProductStockReaderPort,
} from '@pos/application/inventory';
import type { InventoryBalanceRecord, InventoryBalanceRepositoryPort, SetBalanceInput, UpsertBalanceInput } from '@pos/application/inventory/ports';

const now = new Date('2026-01-01T00:00:00Z');

function makeBalance(input: { tenantId: string; outletId: string; productId: string; quantity: number }): InventoryBalanceRecord {
  return {
    id: `${input.outletId}-${input.productId}`,
    tenantId: input.tenantId,
    outletId: input.outletId,
    productId: input.productId,
    quantity: input.quantity,
    reservedQuantity: 0,
    lowStockThreshold: null,
    lastMovementId: null,
    lastCountedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

class FakeBalanceRepo implements InventoryBalanceRepositoryPort {
  balances = new Map<string, InventoryBalanceRecord>();
  key(tenantId: string, outletId: string, productId: string) { return `${tenantId}:${outletId}:${productId}`; }
  async getBalance(tenantId: string, outletId: string, productId: string) { return this.balances.get(this.key(tenantId, outletId, productId)) ?? null; }
  async listBalances(tenantId: string, outletId: string) { return [...this.balances.values()].filter((b) => b.tenantId === tenantId && b.outletId === outletId); }
  async applyDelta(input: UpsertBalanceInput) {
    const existing = await this.getBalance(input.tenantId, input.outletId, input.productId);
    return this.setQuantity({ ...input, quantity: (existing?.quantity ?? 0) + input.quantityDelta });
  }
  async setQuantity(input: SetBalanceInput) {
    const balance = makeBalance(input);
    this.balances.set(this.key(input.tenantId, input.outletId, input.productId), balance);
    return balance;
  }
  async setThreshold() { return null; }
  async listLowStock() { return []; }
}

function deps(defaultOutletId: string, repo = new FakeBalanceRepo()) {
  const productReader: ProductStockReaderPort = {
    async getTrackedProductStock(tenantId, productId) {
      return { id: productId, tenantId, stockTrackingEnabled: true };
    },
    async listTrackedProductStocks(tenantId) {
      return [
        { id: 'product-a', tenantId, stockTrackingEnabled: true },
        { id: 'product-b', tenantId, stockTrackingEnabled: true },
      ];
    },
  };
  const outletContext: OutletContextPort = {
    async isDefaultOutlet(_tenantId, outletId) { return outletId === defaultOutletId; },
  };
  return { balanceRepo: repo, productReader, outletContext };
}

describe('inventory balance initialization', () => {
  it('initializes the default outlet from inventory SOT with zero until explicit opening stock', async () => {
    const balance = await ensureProductBalanceForOutlet(deps('outlet-a'), {
      tenantId: 'tenant-1',
      outletId: 'outlet-a',
      productId: 'product-a',
    });

    assert.equal(balance.quantity, 0);
  });

  it('does not clone catalog stock into non-default outlets', async () => {
    const balance = await ensureProductBalanceForOutlet(deps('outlet-a'), {
      tenantId: 'tenant-1',
      outletId: 'outlet-b',
      productId: 'product-a',
    });

    assert.equal(balance.quantity, 0);
  });

  it('ensures all tracked product balances for one outlet without copying to other outlets', async () => {
    const repo = new FakeBalanceRepo();
    const result = await ensureTrackedProductBalancesForOutlet(deps('outlet-a', repo), {
      tenantId: 'tenant-1',
      outletId: 'outlet-a',
    });

    assert.equal(result.get('product-a')?.quantity, 0);
    assert.equal(result.get('product-b')?.quantity, 0);
    assert.equal(repo.balances.size, 2);
    assert.equal(await repo.getBalance('tenant-1', 'outlet-b', 'product-a'), null);
  });
});

import { submitTransfer } from '@pos/application/inventory';
import type { InventoryMovementWriterPort, StockTransferRepositoryPort, StockTransferRecord, StockTransferWithItems } from '@pos/application/inventory/ports';
import type { UnitOfWorkPort } from '@pos/application/shared/ports/UnitOfWorkPort';

describe('transfer balance initialization', () => {
  it('ensures source outlet balance before submit availability check', async () => {
    const repo = new FakeBalanceRepo();
    const transfer: StockTransferWithItems = {
      id: 'transfer-1',
      tenantId: 'tenant-1',
      transferNumber: 'TRF-1',
      fromOutletId: 'outlet-a',
      toOutletId: 'outlet-b',
      status: 'draft',
      notes: null,
      createdBy: null,
      submittedBy: null,
      receivedBy: null,
      cancelledBy: null,
      submittedAt: null,
      receivedAt: null,
      cancelledAt: null,
      createdAt: now,
      updatedAt: now,
      items: [{ id: 'item-1', transferId: 'transfer-1', productId: 'product-a', quantity: 10, notes: null, createdAt: now, updatedAt: now }],
    };
    const transferRepo: StockTransferRepositoryPort = {
      async create() { return transfer; },
      async findById() { return transfer; },
      async list(): Promise<StockTransferRecord[]> { return [transfer]; },
      async updateStatus() { transfer.status = 'submitted'; return transfer; },
    };
    const movementWriter: InventoryMovementWriterPort = { async record() { return { id: 'movement-1' }; } };
    const unitOfWork: UnitOfWorkPort = { async transaction(fn) { return fn({} as never); } };
    let ensureCalls = 0;

    const result = await submitTransfer(
      {
        transferRepo,
        balanceRepo: repo,
        movementWriter,
        unitOfWork,
        ensureBalanceForOutlet: async (input) => {
          ensureCalls += 1;
          return repo.setQuantity({ ...input, quantity: 50 });
        },
      },
      { tenantId: 'tenant-1', transferId: 'transfer-1' },
    );

    assert.equal(ensureCalls, 1);
    assert.equal(result?.status, 'submitted');
    assert.equal((await repo.getBalance('tenant-1', 'outlet-a', 'product-a'))?.quantity, 40);
  });
});
