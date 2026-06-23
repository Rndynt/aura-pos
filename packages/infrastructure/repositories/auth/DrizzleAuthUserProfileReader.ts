import { sql } from 'drizzle-orm';
import type { AuthUserProfileReaderPort } from '@pos/application/auth';

type AuthUserProfileRow = {
  tenant_id: string | null;
  username: string | null;
  role: string | null;
};

export class DrizzleAuthUserProfileReader implements AuthUserProfileReaderPort {
  constructor(private readonly db: { execute(query: unknown): unknown }) {}

  async findById(userId: string): Promise<{ username: string | null; tenantId: string | null; role: string | null } | null> {
    const rows = await this.db.execute(
      sql`SELECT tenant_id, username, role FROM "user" WHERE id = ${userId} LIMIT 1`,
    );
    const row = (rows as unknown as AuthUserProfileRow[])[0];

    if (!row) {
      return null;
    }

    return {
      username: row.username ?? null,
      tenantId: row.tenant_id ?? null,
      role: row.role ?? null,
    };
  }
}
