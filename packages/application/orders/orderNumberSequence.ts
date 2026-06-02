import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { tenants } from '../../../shared/schema';
import type { DbClient } from '@pos/infrastructure/database';

const ORDER_NUMBER_PREFIX = 'ORD';
const DEFAULT_TIMEZONE = 'UTC';

type QueryClient = DbClient | { execute: (query: unknown) => Promise<unknown> } | any;

export function getBusinessDateForTimezone(date: Date, timezone: string | null | undefined): string {
  const safeTimezone = timezone || DEFAULT_TIMEZONE;

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: safeTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;

    if (!year || !month || !day) {
      throw new Error(`Unable to format business date for timezone ${safeTimezone}`);
    }

    return `${year}-${month}-${day}`;
  } catch (error) {
    if (safeTimezone === DEFAULT_TIMEZONE) throw error;
    return getBusinessDateForTimezone(date, DEFAULT_TIMEZONE);
  }
}

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
  if (!Number.isFinite(lastSeq) || lastSeq < 1) {
    throw new Error('Failed to allocate order number sequence');
  }

  return `${ORDER_NUMBER_PREFIX}-${businessDate.replace(/-/g, '')}-${lastSeq.toString().padStart(4, '0')}`;
}
