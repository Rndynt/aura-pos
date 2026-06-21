import '../../register-paths';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import http from 'node:http';
import express, { type NextFunction, type Request, type Response } from 'express';
import { RecordPayment } from '@pos/application/orders/RecordPayment';
import { DrizzleRecordPaymentRepository } from '@pos/infrastructure/repositories/orders/DrizzleRecordPaymentRepository';
import { orderPayments } from '@pos/infrastructure/db/schema';

process.env.DATABASE_URL ||= 'postgres://user:pass@127.0.0.1:5432/aurapos_test';
process.env.BETTER_AUTH_SECRET ||= 'test-secret-with-at-least-32-characters';

type PaymentStore = {
  order: {
    id: string;
    tenant_id: string;
    status: string;
    payment_status: string;
    total: string;
    paid_amount: string;
  };
  payments: any[];
};

class FakePaymentSelect {
  constructor(private readonly store: PaymentStore) {}

  from() {
    return this;
  }

  where() {
    return this;
  }

  limit() {
    return this;
  }

  async for() {
    return this.store.payments.filter((payment) => payment.orderId === this.store.order.id).slice(0, 1);
  }
}

class FakePaymentInsert {
  private pendingValues: any;

  constructor(private readonly store: PaymentStore, private readonly table: unknown) {}

  values(value: any) {
    this.pendingValues = value;
    return this;
  }

  async returning() {
    if (this.table !== orderPayments) return [];

    const row = {
      id: `payment-${this.store.payments.length + 1}`,
      ...this.pendingValues,
    };
    this.store.payments.push(row);
    return [row];
  }
}

class FakePaymentTx {
  constructor(private readonly store: PaymentStore) {}

  async execute(query: any) {
    const sqlText = extractSqlText(query).toLowerCase();
    if (sqlText.includes('update orders')) {
      const paidAmount = this.store.payments
        .reduce((total, payment) => total + Number(payment.amount ?? 0), 0)
        .toString();
      this.store.order.paid_amount = paidAmount;
      this.store.order.payment_status = Number(paidAmount) >= Number(this.store.order.total) ? 'paid' : 'partial';
      return { rows: [this.store.order] };
    }

    return { rows: [this.store.order] };
  }

  select() {
    return new FakePaymentSelect(this.store);
  }

  insert(table: unknown) {
    return new FakePaymentInsert(this.store, table);
  }
}

class FakePaymentDb {
  constructor(private readonly store: PaymentStore) {}

  async transaction<T>(callback: (tx: FakePaymentTx) => Promise<T>) {
    return callback(new FakePaymentTx(this.store));
  }
}

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

async function request(app: express.Express, body: Record<string, unknown>) {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert(address && typeof address === 'object');

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/orders/order-1/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const responseBody = await response.json().catch(() => null);
    return { status: response.status, body: responseBody };
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

after(async () => {
  const { sql: postgresSql } = await import('@pos/infrastructure/database');
  await postgresSql.end({ timeout: 1 });
});

describe('POST /api/orders/:id/payments idempotency retry', async () => {
  const { container } = await import('../container');
  const { recordPayment } = await import('../http/controllers/OrdersController');

  function buildApp(store: PaymentStore) {
    (container as any).recordPayment = new RecordPayment(new DrizzleRecordPaymentRepository(new FakePaymentDb(store) as any));
    (container as any).orderRepository = {
      findById: async (orderId: string, tenantId: string) =>
        store.order.id === orderId && store.order.tenant_id === tenantId ? store.order : null,
    };

    const app = express();
    app.use(express.json());
    app.use('/api', (req: Request, _res: Response, next: NextFunction) => {
      req.tenantId = 'tenant-1';
      next();
    });
    app.post('/api/orders/:id/payments', recordPayment);
    app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
      res.status(error?.statusCode ?? 500).json({ code: error?.code ?? 'ERROR', message: error?.message });
    });
    return app;
  }

  it('returns replay result and does not insert or apply paid amount twice for the same key', async () => {
    const store: PaymentStore = {
      order: {
        id: 'order-1',
        tenant_id: 'tenant-1',
        status: 'confirmed',
        payment_status: 'unpaid',
        total: '100.00',
        paid_amount: '0',
      },
      payments: [],
    };
    const app = buildApp(store);

    const body = {
      amount: 40,
      payment_method: 'MANUAL_TRANSFER',
      transaction_ref: 'CARD-AUTH-123',
      idempotency_key: 'retry-key-12345',
    };

    const first = await request(app, body);
    const second = await request(app, body);

    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    assert.equal(store.payments.length, 1);
    assert.equal(store.order.paid_amount, '40');
    assert.equal(first.body?.data?.payment?.id, second.body?.data?.payment?.id);
    assert.equal(first.body?.data?.payment?.referenceNumber, 'CARD-AUTH-123');
    assert.equal(first.body?.data?.payment?.idempotencyKey, 'retry-key-12345');
    assert.equal(second.body?.data?.idempotent_replay, true);
  });
});
