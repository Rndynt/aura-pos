import { sql, eq } from 'drizzle-orm';
import { tenants } from '../../../../shared/schema';
import type { DbClient } from '../../database';
import { formatOrderNumberForSequence, getBusinessDateForTimezone } from '@pos/application/orders/orderNumberSequence';

const DEFAULT_TIMEZONE = 'UTC';

type QueryClient = DbClient | { execute: (query: unknown) => Promise<unknown> } | any;

function normalizeRows(result: unknown): any[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object') {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows;
  }
  return [];
}

export async function getTenantTimezone(dbOrTx: QueryClient, tenantId: string): Promise<string> {
  const rows = await dbOrTx
    .select({ timezone: tenants.timezone })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  return rows[0]?.timezone || DEFAULT_TIMEZONE;
}

export async function nextOrderNumberForTenant(
  dbOrTx: QueryClient,
  tenantId: string,
  now = new Date(),
): Promise<string> {
  const timezone = await getTenantTimezone(dbOrTx, tenantId);
  const businessDate = getBusinessDateForTimezone(now, timezone);

  const result = await dbOrTx.execute(sql`
    INSERT INTO order_number_sequences (tenant_id, business_date, last_seq)
    VALUES (${tenantId}, ${businessDate}, 1)
    ON CONFLICT (tenant_id, business_date)
    DO UPDATE SET
      last_seq = order_number_sequences.last_seq + 1,
      updated_at = CURRENT_TIMESTAMP
    RETURNING last_seq
  `);

  const rows = normalizeRows(result);
  const lastSeq = Number(rows[0]?.last_seq ?? rows[0]?.lastSeq);

  return formatOrderNumberForSequence(businessDate, lastSeq);
}
