import '../register-paths';
import { db } from '../lib/db';
import { sql } from 'drizzle-orm';

async function main() {
  const r = await db.execute(sql`UPDATE tenants SET plan_tier = 'growth' WHERE plan_tier IN ('premium', 'standard')`);
  console.log('Fixed rows:', r.rowCount);
  const rows = await db.execute(sql`SELECT id, slug, plan_tier FROM tenants ORDER BY id`);
  for (const row of rows.rows) {
    console.log((row as any).slug, '->', (row as any).plan_tier);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
