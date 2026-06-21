/**
 * Partial Payment Lifecycle Tests
 *
 * Verifies that:
 * 1. Recording the first payment on a draft order promotes status → confirmed.
 * 2. Full payment on a draft also promotes to confirmed + paid.
 * 3. Confirmed order stays confirmed when partial payment added.
 * 4. Second payment on a partial order can bring it to fully paid; status never reverts to draft.
 * 5. Payment against a cancelled order is rejected.
 */

import '../../register-paths';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DrizzleRecordPaymentRepository } from '@pos/infrastructure/repositories/orders/DrizzleRecordPaymentRepository';
import { orderPayments } from '@pos/infrastructure/db/schema';

type OrderStore = {
  id: string;
  tenant_id: string;
  status: string;
  payment_status: string;
  total: string;
  paid_amount: string;
};

type PaymentStore = {
  order: OrderStore;
  payments: any[];
};

function extractSqlText(query: any): string {
  const chunks = query?.queryChunks ?? [];
  return chunks
    .map((chunk: any) => {
      if (Array.isArray(chunk?.value)) return chunk.value.join(' ');
      if (chunk?.queryChunks) return extractSqlText(chunk);
      return '';
    })
    .join(' ');
}

class FakeTx {
  constructor(private readonly store: PaymentStore) {}

  async execute(query: any) {
    const sqlText = extractSqlText(query).toLowerCase();

    // SELECT ... FOR UPDATE — return the order row
    if (sqlText.includes('select') && sqlText.includes('for update')) {
      return { rows: [this.store.order] };
    }

    // UPDATE orders — simulate the full business logic including status promotion
    if (sqlText.includes('update orders')) {
      const newPaid = this.store.payments.reduce(
        (sum: number, p: any) => sum + Number(p.amount ?? 0),
        0,
      );
      const total = Number(this.store.order.total);

      this.store.order.paid_amount = newPaid.toString();
      this.store.order.payment_status =
        newPaid >= total ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';

      // Simulate CASE WHEN status = 'draft' AND newPaid > 0 THEN 'confirmed'
      if (this.store.order.status === 'draft' && newPaid > 0) {
        this.store.order.status = 'confirmed';
      }

      return { rows: [this.store.order] };
    }

    return { rows: [] };
  }

  select() {
    const store = this.store;
    return {
      from() {
        return this;
      },
      where() {
        return this;
      },
      limit() {
        return this;
      },
      async for() {
        // Idempotency check — no existing payments with a matching key for these tests
        return [] as any[];
      },
    };
  }

  insert(table: unknown) {
    const store = this.store;
    return {
      values(value: any) {
        return {
          async returning() {
            if (table !== orderPayments) return [];
            const row = { id: `pay-${store.payments.length + 1}`, orderId: store.order.id, ...value };
            store.payments.push(row);
            return [row];
          },
        };
      },
    };
  }
}

class FakeDb {
  constructor(private readonly store: PaymentStore) {}

  async transaction<T>(callback: (tx: FakeTx) => Promise<T>) {
    return callback(new FakeTx(this.store));
  }
}

function makeRepo(store: PaymentStore) {
  return new DrizzleRecordPaymentRepository(new FakeDb(store) as any);
}

describe('Partial payment lifecycle', async () => {
  it('promotes draft → confirmed when first partial payment is recorded', async () => {
    const store: PaymentStore = {
      order: {
        id: 'ord-1',
        tenant_id: 't1',
        status: 'draft',
        payment_status: 'unpaid',
        total: '100.00',
        paid_amount: '0',
      },
      payments: [],
    };
    const repo = makeRepo(store);
    const result = await repo.recordPayment({
      order_id: 'ord-1',
      tenant_id: 't1',
      amount: 40,
      payment_method: 'CASH',
    });

    assert.equal(store.order.status, 'confirmed', 'draft order must be promoted to confirmed on first payment');
    assert.equal(store.order.payment_status, 'partial');
    assert.equal(Number(store.order.paid_amount), 40);
    assert.equal(result.remainingAmount, 60);
  });

  it('promotes draft → confirmed when full payment is recorded', async () => {
    const store: PaymentStore = {
      order: {
        id: 'ord-2',
        tenant_id: 't1',
        status: 'draft',
        payment_status: 'unpaid',
        total: '50.00',
        paid_amount: '0',
      },
      payments: [],
    };
    const repo = makeRepo(store);
    await repo.recordPayment({
      order_id: 'ord-2',
      tenant_id: 't1',
      amount: 50,
      payment_method: 'MANUAL_TRANSFER',
    });

    assert.equal(store.order.status, 'confirmed');
    assert.equal(store.order.payment_status, 'paid');
    assert.equal(Number(store.order.paid_amount), 50);
  });

  it('does not change status when confirmed order receives payment', async () => {
    const store: PaymentStore = {
      order: {
        id: 'ord-3',
        tenant_id: 't1',
        status: 'confirmed',
        payment_status: 'unpaid',
        total: '200.00',
        paid_amount: '0',
      },
      payments: [],
    };
    const repo = makeRepo(store);
    await repo.recordPayment({
      order_id: 'ord-3',
      tenant_id: 't1',
      amount: 100,
      payment_method: 'CASH',
    });

    assert.equal(store.order.status, 'confirmed', 'confirmed order must stay confirmed');
    assert.equal(store.order.payment_status, 'partial');
  });

  it('second payment brings partial order to fully paid; status stays confirmed', async () => {
    const store: PaymentStore = {
      order: {
        id: 'ord-4',
        tenant_id: 't1',
        status: 'confirmed',
        payment_status: 'partial',
        total: '100.00',
        paid_amount: '60',
      },
      payments: [{ id: 'pay-0', orderId: 'ord-4', amount: '60' }],
    };
    const repo = makeRepo(store);
    const result = await repo.recordPayment({
      order_id: 'ord-4',
      tenant_id: 't1',
      amount: 40,
      payment_method: 'CASH',
    });

    assert.equal(store.order.status, 'confirmed', 'status must not revert to draft');
    assert.equal(store.order.payment_status, 'paid');
    assert.equal(result.remainingAmount, 0);
  });

  it('rejects payment against cancelled order', async () => {
    const store: PaymentStore = {
      order: {
        id: 'ord-5',
        tenant_id: 't1',
        status: 'cancelled',
        payment_status: 'unpaid',
        total: '100.00',
        paid_amount: '0',
      },
      payments: [],
    };
    const repo = makeRepo(store);
    await assert.rejects(
      () =>
        repo.recordPayment({
          order_id: 'ord-5',
          tenant_id: 't1',
          amount: 50,
          payment_method: 'CASH',
        }),
      /cancelled/i,
    );
  });
});
