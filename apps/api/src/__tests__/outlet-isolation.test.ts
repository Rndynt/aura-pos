import '../../register-paths';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NextFunction, Request, Response } from 'express';

process.env.DATABASE_URL ||= 'postgres://user:pass@127.0.0.1:5432/aurapos_test';
process.env.BETTER_AUTH_SECRET ||= 'test-secret-with-at-least-32-characters';

const { outlets, userOutletAssignments } = await import('@shared/schema');
const { createOutletMiddleware } = await import('../http/middleware/outlet');
const { ListOrderHistory } = await import('@pos/application/orders/ListOrderHistory');

type FakeDbOptions = {
  activeOutletId: string;
  assignedOutletIds?: string[];
};

function createFakeOutletDb(options: FakeDbOptions) {
  return {
    select: () => {
      const query: any = {
        table: null,
        from(table: unknown) {
          this.table = table;
          return this;
        },
        where() {
          return this;
        },
        limit() {
          if (this.table === outlets) {
            return Promise.resolve([{ id: options.activeOutletId }]);
          }
          if (this.table === userOutletAssignments) {
            const assigned = options.assignedOutletIds?.includes(options.activeOutletId);
            return Promise.resolve(assigned ? [{ id: 'assignment-1' }] : []);
          }
          return Promise.resolve([]);
        },
      };
      return query;
    },
  };
}

function createResponseRecorder() {
  let statusCode = 0;
  let payload: any = null;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(body: any) {
      payload = body;
      return this;
    },
  } as Response;
  return { res, statusCode: () => statusCode, payload: () => payload };
}

async function runOutletMiddleware(input: {
  role: string;
  outletId: string;
  assignedOutletIds?: string[];
}) {
  const middleware = createOutletMiddleware({
    db: createFakeOutletDb({
      activeOutletId: input.outletId,
      assignedOutletIds: input.assignedOutletIds,
    }) as any,
  });
  const req = {
    tenantId: 'tenant-1',
    headers: { 'x-outlet-id': input.outletId },
    query: {},
    authTenantUser: { id: `${input.role}-1`, tenantId: 'tenant-1', role: input.role },
  } as unknown as Request;
  const recorder = createResponseRecorder();
  let nextCalled = false;
  await middleware(req, recorder.res, (() => {
    nextCalled = true;
  }) as NextFunction);
  return { req, nextCalled, statusCode: recorder.statusCode(), payload: recorder.payload() };
}

describe('outlet isolation for authenticated POS roles', () => {
  it('rejects a manager who requests an outlet without an active assignment', async () => {
    const result = await runOutletMiddleware({ role: 'manager', outletId: '00000000-0000-0000-0000-000000000101' });

    assert.equal(result.nextCalled, false);
    assert.equal(result.statusCode, 403);
    assert.equal(result.payload?.code, 'OUTLET_ACCESS_DENIED');
  });

  it('allows a cashier who is assigned to the requested outlet', async () => {
    const outletId = '00000000-0000-0000-0000-000000000102';
    const result = await runOutletMiddleware({ role: 'cashier', outletId, assignedOutletIds: [outletId] });

    assert.equal(result.nextCalled, true);
    assert.equal(result.statusCode, 0);
    assert.equal(result.req.outletId, outletId);
  });

  it('allows an owner to access any active outlet without user_outlet_assignments', async () => {
    const outletId = '00000000-0000-0000-0000-000000000103';
    const result = await runOutletMiddleware({ role: 'owner', outletId });

    assert.equal(result.nextCalled, true);
    assert.equal(result.statusCode, 0);
    assert.equal(result.req.outletId, outletId);
  });

  it('passes the active outlet into ListOrderHistory repository filters and counts', async () => {
    const findFilters: any[] = [];
    const countFilters: any[] = [];
    const orderRepository = {
      findByTenant: async (_tenantId: string, filters: any) => {
        findFilters.push(filters);
        return [];
      },
      countByTenant: async (_tenantId: string, filters: any) => {
        countFilters.push(filters);
        return 0;
      },
    };
    const tenantRepository = {
      findById: async () => ({ id: 'tenant-1', is_active: true }),
    };

    const useCase = new ListOrderHistory(orderRepository, tenantRepository);
    await useCase.execute({ tenant_id: 'tenant-1', outlet_id: 'outlet-history-1' });

    assert.equal(findFilters[0]?.outletId, 'outlet-history-1');
    assert.equal(countFilters[0]?.outletId, 'outlet-history-1');
  });
});
