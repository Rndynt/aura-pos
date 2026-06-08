import '../../register-paths';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://user:pass@127.0.0.1:5432/aurapos_test';
process.env.BETTER_AUTH_SECRET ||= 'test-secret-with-at-least-32-characters';

const { CreateAndPayOrder } = await import('@pos/application/orders/CreateAndPayOrder');
const { SyncOfflineOrder } = await import('@pos/application/sync/SyncOfflineOrder');
const { DrizzleCreateAndPayOrderRepository } = await import('@pos/infrastructure/repositories/orders/DrizzleCreateAndPayOrderRepository');
const { DrizzleSyncOfflineOrderRepository } = await import('@pos/infrastructure/repositories/sync/DrizzleSyncOfflineOrderRepository');
const { inventoryMovements, orderItems, orderPayments, orders, products, tenants, syncBatches, syncEvents, serverSyncConflicts, tables } = await import('@shared/schema');
const { getBusinessDateForTimezone } = await import('@pos/application/orders/orderNumberSequence');

type ProductRow = {
  id: string;
  tenantId: string;
  isActive: boolean;
  stockTrackingEnabled: boolean;
  stockQty: number;
};

type Store = {
  product: ProductRow;
  orders: any[];
  orderItems: any[];
  payments: any[];
  movements: any[];
  tenantTimezone: string;
  orderNumberSequences: Record<string, number>;
};

class AsyncMutex {
  private current = Promise.resolve();

  async runExclusive<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.current;
    let release!: () => void;
    this.current = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }
}

class FakeDb {
  readonly mutex = new AsyncMutex();

  constructor(readonly store: Store) {}

  async transaction<T>(work: (tx: FakeTx) => Promise<T>): Promise<T> {
    return this.mutex.runExclusive(async () => {
      const snapshot: Store = structuredClone(this.store);
      const tx = new FakeTx(this.store);
      try {
        return await work(tx);
      } catch (error) {
        this.store.product = snapshot.product;
        this.store.orders = snapshot.orders;
        this.store.orderItems = snapshot.orderItems;
        this.store.payments = snapshot.payments;
        this.store.movements = snapshot.movements;
        this.store.tenantTimezone = snapshot.tenantTimezone;
        this.store.orderNumberSequences = snapshot.orderNumberSequences;
        throw error;
      }
    });
  }

  select(fields: Record<string, unknown>) {
    return new FakeSelect(this.store, fields);
  }

  insert(table: unknown) {
    return new FakeInsert(this.store, table);
  }

  update(table: unknown) {
    return new FakeUpdate(this.store, table);
  }

  async execute(query: any): Promise<any[]> {
    const chunks = query?.queryChunks ?? [];
    const tenantId = chunks.find((chunk: any) => typeof chunk === 'string' && chunk.startsWith('tenant-')) ?? 'tenant-1';
    const businessDate = chunks.find((chunk: any) => typeof chunk === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(chunk))
      ?? getBusinessDateForTimezone(new Date(), this.store.tenantTimezone);
    const key = `${tenantId}:${businessDate}`;
    const lastSeq = (this.store.orderNumberSequences[key] ?? 0) + 1;
    this.store.orderNumberSequences[key] = lastSeq;
    return [{ last_seq: lastSeq }];
  }
}

class FakeTx extends FakeDb {
  async transaction<T>(work: (tx: FakeTx) => Promise<T>): Promise<T> {
    return work(this);
  }
}

class FakeSelect {
  private table: unknown;
  private limitCount: number | undefined;
  private conditionValues: unknown[] = [];

  constructor(private readonly store: Store, private readonly fields: Record<string, unknown> = {}) {}

  from(table: unknown) {
    this.table = table;
    return this;
  }

  innerJoin() {
    return this;
  }

  where(condition?: unknown) {
    this.conditionValues = collectConditionValues(condition);
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  for() {
    return this.execute();
  }

  then<TResult1 = any[], TResult2 = never>(
    onfulfilled?: ((value: any[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<any[]> {
    let rows: any[];

    if (this.table === tenants) {
      rows = [{ id: 'tenant-1', timezone: this.store.tenantTimezone }];
    } else if (this.table === products) {
      rows = [this.store.product].map((product) => ({
        id: product.id,
        isActive: product.isActive,
        stockQty: product.stockQty,
        stockTrackingEnabled: product.stockTrackingEnabled,
        name: 'Limited Product',
        basePrice: '10',
      }));
    } else if (this.table === orders) {
      if ('value' in this.fields) {
        rows = [{ value: this.store.orders.length }];
      } else {
        rows = [...this.store.orders];
        const orderId = this.conditionValues.find((value) => typeof value === 'string' && value.startsWith('order-'));
        if (orderId) rows = rows.filter((order) => order.id === orderId);
      }
    } else if (this.table === tables) {
      rows = [];
    } else if (this.table === orderPayments) {
      rows = [...this.store.payments];
      const idempotencyKey = this.conditionValues.find((value) =>
        typeof value === 'string'
        && ((value as string).startsWith('retry-')
          || (value as string).startsWith('parallel-')
          || (value as string).startsWith('paid-')
          || (value as string).startsWith('sync-'))
      );
      if (idempotencyKey) rows = rows.filter((payment) => payment.idempotencyKey === idempotencyKey);
      const orderId = this.conditionValues.find((value) => typeof value === 'string' && (value as string).startsWith('order-'));
      if (orderId) rows = rows.filter((payment) => payment.orderId === orderId);
    } else {
      rows = [];
    }

    if (this.limitCount !== undefined) return rows.slice(0, this.limitCount);
    return rows;
  }
}


function collectConditionValues(value: unknown, seen = new WeakSet<object>()): unknown[] {
  if (value == null) return [];
  if (['string', 'number', 'boolean'].includes(typeof value)) return [value];
  if (Array.isArray(value)) return value.flatMap((item) => collectConditionValues(item, seen));
  if (typeof value === 'object') {
    if (seen.has(value as object)) return [];
    seen.add(value as object);
    return Object.values(value as Record<string, unknown>).flatMap((item) => collectConditionValues(item, seen));
  }
  return [];
}

class FakeInsert {
  private pendingValues: any;

  constructor(private readonly store: Store, private readonly table: unknown) {}

  values(value: any) {
    this.pendingValues = value;
    return this;
  }

  async returning() {
    if (this.table === orders) {
      const row = {
        id: `order-${this.store.orders.length + 1}`,
        ...this.pendingValues,
        orderNumber: this.pendingValues.orderNumber,
      };
      this.store.orders.push(row);
      return [row];
    }

    if (this.table === orderItems) {
      const rows = this.pendingValues.map((value: any, index: number) => ({
        id: `item-${this.store.orderItems.length + index + 1}`,
        ...value,
      }));
      this.store.orderItems.push(...rows);
      return rows;
    }

    if (this.table === orderPayments) {
      const row = { id: `payment-${this.store.payments.length + 1}`, ...this.pendingValues };
      this.store.payments.push(row);
      return [row];
    }

    if (this.table === syncBatches) {
      return [{ id: `batch-${Date.now()}`, ...this.pendingValues }];
    }

    return [];
  }

  async then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  async catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
  ) {
    return this.execute().catch(onrejected);
  }

  private async execute(): Promise<void> {
    if (this.table === inventoryMovements) {
      this.store.movements.push({ id: `movement-${this.store.movements.length + 1}`, ...this.pendingValues });
    }

    if (this.table === syncEvents || this.table === serverSyncConflicts) {
      return;
    }
  }
}

class FakeUpdate {
  private pendingSet: Record<string, any> = {};
  private conditionValues: unknown[] = [];

  constructor(private readonly store: Store, private readonly table: unknown) {}

  set(value: Record<string, any>) {
    this.pendingSet = value;
    return this;
  }

  where(condition?: unknown) {
    this.conditionValues = collectConditionValues(condition);
    return this;
  }

  async returning() {
    if (this.table === products) {
      const quantityDelta = this.extractQuantityDelta(this.pendingSet.stockQty);
      if (this.store.product.stockQty + quantityDelta < 0) return [];
      this.store.product.stockQty += quantityDelta;
      return [{ stockQty: this.store.product.stockQty }];
    }

    if (this.table === orders) {
      const order = this.store.orders.at(-1);
      Object.assign(order, this.pendingSet);
      return [order];
    }

    return [];
  }


  async then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  async catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
  ) {
    return this.execute().catch(onrejected);
  }

  private async execute(): Promise<void> {
    if (this.table === orders) {
      const orderId = this.conditionValues.find((value) => typeof value === 'string' && (value as string).startsWith('order-'));
      const order = orderId
        ? this.store.orders.find((candidate) => candidate.id === orderId)
        : this.store.orders.at(-1);
      if (order) Object.assign(order, this.pendingSet);
    }
  }

  private extractQuantityDelta(sqlExpression: any): number {
    const chunks = sqlExpression?.queryChunks ?? [];
    const operator = chunks.some((chunk: any) => Array.isArray(chunk.value) && chunk.value.some((value: string) => value.includes('+')))
      ? 1
      : -1;
    const amount = chunks.find((chunk: any) => typeof chunk === 'number') ?? 0;
    return operator * amount;
  }
}

function buildUseCase(initialStockQty: number) {
  const store: Store = {
    product: {
      id: 'product-1',
      tenantId: 'tenant-1',
      isActive: true,
      stockTrackingEnabled: true,
      stockQty: initialStockQty,
    },
    orders: [],
    orderItems: [],
    payments: [],
    movements: [],
    tenantTimezone: 'Asia/Jakarta',
    orderNumberSequences: {},
  };

  const db = new FakeDb(store) as any;
  return {
    store,
    db,
    useCase: new CreateAndPayOrder(new DrizzleCreateAndPayOrderRepository(db)),
    syncUseCase: new SyncOfflineOrder(new DrizzleSyncOfflineOrderRepository(db)),
  };
}

const orderInput = (idempotencyKey: string) => ({
  tenant_id: 'tenant-1',
  outlet_id: null,
  items: [
    {
      product_id: 'product-1',
      product_name: 'Limited Product',
      base_price: 10,
      quantity: 1,
    },
  ],
  tax_rate: 0,
  service_charge_rate: 0,
  amount: 10,
  payment_method: 'cash' as const,
  idempotency_key: idempotencyKey,
});

describe('CreateAndPayOrder stock concurrency', () => {
  it('allows only one of two parallel quick-pay orders when tracked stock has one unit', async () => {
    const { store, useCase } = buildUseCase(1);

    const results = await Promise.allSettled([
      useCase.execute(orderInput('parallel-order-a')),
      useCase.execute(orderInput('parallel-order-b')),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
    assert.equal(rejectionReason?.name, 'InsufficientStockError');
    assert.equal(rejectionReason?.code, 'INSUFFICIENT_STOCK');
    assert.equal(store.product.stockQty, 0);
    assert.equal(store.orders.length, 1);
    assert.equal(store.payments.length, 1);
    assert.equal(store.movements.length, 1);
    assert.equal(store.movements[0].quantityBefore, 1);
    assert.equal(store.movements[0].quantityAfter, 0);
  });


  it('allocates unique sequential order numbers for many parallel orders on the same tenant business date', async () => {
    const { store, useCase } = buildUseCase(50);
    const parallelCount = 25;

    const results = await Promise.all(
      Array.from({ length: parallelCount }, (_, index) =>
        useCase.execute(orderInput(`parallel-sequence-${index + 1}`)),
      ),
    );

    const orderNumbers = results.map((result) => result.order.orderNumber);
    const uniqueOrderNumbers = new Set(orderNumbers);
    const businessDate = getBusinessDateForTimezone(new Date(), store.tenantTimezone).replace(/-/g, '');

    assert.equal(uniqueOrderNumbers.size, parallelCount);
    assert.deepEqual(
      orderNumbers.sort(),
      Array.from({ length: parallelCount }, (_, index) =>
        `ORD-${businessDate}-${String(index + 1).padStart(4, '0')}`,
      ),
    );
    assert.equal(store.orders.length, parallelCount);
    assert.equal(store.orderNumberSequences[`tenant-1:${getBusinessDateForTimezone(new Date(), store.tenantTimezone)}`], parallelCount);
  });

  it('derives business date from tenant timezone instead of UTC server date', () => {
    const utcLateNight = new Date('2026-06-02T17:30:00.000Z');

    assert.equal(getBusinessDateForTimezone(utcLateNight, 'Asia/Jakarta'), '2026-06-03');
    assert.equal(getBusinessDateForTimezone(utcLateNight, 'UTC'), '2026-06-02');
  });

  it('keeps a fully paid quick-pay order operationally confirmed by default', async () => {
    const { store, useCase } = buildUseCase(2);

    const result = await useCase.execute(orderInput('paid-confirmed-default'));

    assert.equal(result.order.paymentStatus, 'paid');
    assert.equal(result.order.paidAmount, '10');
    assert.equal(result.order.status, 'confirmed');
    assert.equal(result.order.closedAt, undefined);
    assert.equal(store.orders.length, 1);
  });

  it('replays create-and-pay retries without creating a second order or payment', async () => {
    const { store, useCase } = buildUseCase(2);

    const first = await useCase.execute(orderInput('retry-create-and-pay'));
    const retry = await useCase.execute(orderInput('retry-create-and-pay'));

    assert.equal(first.order.id, retry.order.id);
    assert.equal(retry.idempotent_replay, true);
    assert.equal(store.orders.length, 1);
    assert.equal(store.payments.length, 1);
    assert.equal(store.movements.length, 1);
    assert.equal(store.product.stockQty, 1);
  });

  it('only auto-completes create-and-pay when explicit instant fulfillment mode is requested', async () => {
    const { useCase } = buildUseCase(2);

    const result = await useCase.execute({
      ...orderInput('paid-instant-fulfillment'),
      fulfillment_mode: 'instant',
    });

    assert.equal(result.order.paymentStatus, 'paid');
    assert.equal(result.order.status, 'completed');
    assert.ok(result.order.closedAt instanceof Date);
  });

  it('syncing an offline order creates exactly one stock deduction and one ledger entry per product', async () => {
    const { store, syncUseCase } = buildUseCase(5);

    const result = await syncUseCase.execute({
      tenant_id: 'tenant-1',
      terminal_id: 'terminal-sync-1',
      outlet_id: null,
      orders: [
        {
          local_order_id: 'local-order-1',
          local_order_number: 'OFF-0001',
          idempotency_key: 'sync-offline-order-1',
          items: [
            {
              product_id: 'product-1',
              product_name: 'Limited Product',
              base_price: 10,
              quantity: 2,
            },
          ],
          tax_rate: 0,
          service_charge_rate: 0,
          amount: 20,
          payment_method: 'cash',
          source_terminal_id: 'terminal-sync-1',
        },
      ],
    });

    assert.equal(result.synced, 1);
    assert.equal(result.failed, 0);
    assert.equal(store.product.stockQty, 3);
    assert.equal(store.orders.length, 1);
    assert.equal(store.payments.length, 1);
    assert.equal(store.movements.length, 1);
    assert.equal(store.movements[0].movementType, 'SALE');
    assert.equal(store.movements[0].quantityDelta, -2);
    assert.equal(store.movements[0].quantityBefore, 5);
    assert.equal(store.movements[0].quantityAfter, 3);
    assert.equal(store.movements[0].terminalId, 'terminal-sync-1');
  });

});
