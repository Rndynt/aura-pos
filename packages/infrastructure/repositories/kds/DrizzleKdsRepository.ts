import { sql } from 'drizzle-orm';
import type {
  ActivateKdsDeviceInput,
  CreateKdsActivationInput,
  KdsActivatedDeviceRow,
  KdsActivationFailureRow,
  KdsDeviceListRow,
  KdsDeviceRow,
  KdsRepositoryPort,
  KdsSessionTenantRow,
} from '@pos/application/kds/ports/KdsRepositoryPort';

type SqlExecutor = {
  execute(query: unknown): Promise<unknown>;
};

function rowsOf<T>(result: unknown): T[] {
  return Array.isArray(result) ? (result as T[]) : [];
}

export class DrizzleKdsRepository implements KdsRepositoryPort {
  constructor(private readonly db: SqlExecutor) {}

  async findSessionTenantByUserId(userId: string): Promise<KdsSessionTenantRow | null> {
    const rows = await this.db.execute(sql`
      SELECT tenant_id AS "tenantId"
      FROM "user"
      WHERE id = ${userId}
      LIMIT 1
    `);
    return rowsOf<KdsSessionTenantRow>(rows)[0] ?? null;
  }

  async findDeviceByApiKeyHash(apiKeyHash: string): Promise<KdsDeviceRow | null> {
    const rows = await this.db.execute(sql`
      SELECT id,
             tenant_id AS "tenantId",
             device_name AS "deviceName",
             outlet_id AS "outletId",
             status
      FROM kds_devices
      WHERE api_key = ${apiKeyHash}
        AND status = 'active'
      LIMIT 1
    `);
    return rowsOf<KdsDeviceRow>(rows)[0] ?? null;
  }

  async touchDeviceLastSeen(deviceId: string): Promise<void> {
    await this.db.execute(sql`
      UPDATE kds_devices
      SET last_seen_at = now()
      WHERE id = ${deviceId}
    `);
  }

  async orderBelongsToOutlet(input: { orderId: string; tenantId: string; outletId: string }): Promise<boolean> {
    const rows = await this.db.execute(sql`
      SELECT id
      FROM orders
      WHERE id = ${input.orderId}
        AND tenant_id = ${input.tenantId}
        AND outlet_id = ${input.outletId}
      LIMIT 1
    `);
    return rowsOf<{ id: string }>(rows).length > 0;
  }

  async createActivation(input: CreateKdsActivationInput): Promise<void> {
    await this.db.execute(sql`
      INSERT INTO kds_devices (id, tenant_id, activation_code, activation_expires_at, status, created_at)
      VALUES (${input.id}, ${input.tenantId}, ${input.activationCode}, ${input.activationExpiresAt.toISOString()}, 'pending', now())
    `);
  }

  async listDevicesByTenant(tenantId: string): Promise<KdsDeviceListRow[]> {
    const rows = await this.db.execute(sql`
      SELECT id,
             device_name AS "deviceName",
             status,
             created_at AS "createdAt",
             activated_at AS "activatedAt",
             last_seen_at AS "lastSeenAt",
             activation_code AS "activationCode",
             activation_expires_at AS "activationExpiresAt"
      FROM kds_devices
      WHERE tenant_id = ${tenantId}
        AND status != 'revoked'
      ORDER BY created_at DESC
    `);
    return rowsOf<KdsDeviceListRow>(rows);
  }

  async revokeDevice(input: { deviceId: string; tenantId: string }): Promise<void> {
    await this.db.execute(sql`
      UPDATE kds_devices
      SET status = 'revoked', api_key = null
      WHERE id = ${input.deviceId}
        AND tenant_id = ${input.tenantId}
    `);
  }

  async pendingActivationExists(code: string): Promise<boolean> {
    const rows = await this.db.execute(sql`
      SELECT id
      FROM kds_devices
      WHERE activation_code = ${code}
        AND status = 'pending'
        AND activation_expires_at > now()
        AND (activation_locked_until IS NULL OR activation_locked_until <= now())
      LIMIT 1
    `);
    return rowsOf<{ id: string }>(rows).length > 0;
  }

  async registerActivationFailure(code: string): Promise<KdsActivationFailureRow | null> {
    const rows = await this.db.execute(sql`
      UPDATE kds_devices
      SET activation_attempts = COALESCE(activation_attempts, 0) + 1,
          activation_locked_until = CASE
            WHEN COALESCE(activation_attempts, 0) + 1 >= 5
              THEN now() + (10 * interval '1 minute')
            ELSE activation_locked_until
          END
      WHERE activation_code = ${code}
        AND status = 'pending'
        AND activation_expires_at > now()
      RETURNING activation_locked_until AS "lockedUntil"
    `);
    return rowsOf<KdsActivationFailureRow>(rows)[0] ?? null;
  }

  async activateDevice(input: ActivateKdsDeviceInput): Promise<KdsActivatedDeviceRow | null> {
    const rows = await this.db.execute(sql`
      UPDATE kds_devices
      SET api_key = ${input.apiKeyHash},
          device_name = ${input.deviceName},
          status = 'active',
          activated_at = now(),
          activation_code = null,
          activation_expires_at = null,
          activation_locked_until = null
      WHERE activation_code = ${input.activationCode}
        AND status = 'pending'
        AND activation_expires_at > now()
        AND (activation_locked_until IS NULL OR activation_locked_until <= now())
      RETURNING id, tenant_id AS "tenantId"
    `);
    return rowsOf<KdsActivatedDeviceRow>(rows)[0] ?? null;
  }
}
