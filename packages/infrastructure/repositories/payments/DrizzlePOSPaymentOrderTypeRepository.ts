/**
 * DrizzlePOSPaymentOrderTypeRepository
 *
 * Validates order_type_id before any order insert.
 * Returns user-safe results — never exposes FK or DB constraint names.
 *
 * Reusable guard for SubmitPOSPayment, CreateOrder, and CreateAndPayOrder.
 */

import type { Database } from "../../database";
import { orderTypes, tenantOrderTypes } from "@pos/infrastructure/db/schema";
import { eq, and } from "drizzle-orm";
import type { POSPaymentOrderTypePort, OrderTypeValidationResult } from "@pos/application/payments";

const USER_SAFE_INVALID_ORDER_TYPE =
  "Tipe pesanan tidak valid atau belum aktif untuk tenant ini. Muat ulang POS lalu coba lagi.";

export class DrizzlePOSPaymentOrderTypeRepository implements POSPaymentOrderTypePort {
  constructor(private readonly db: Database) {}

  async validateOrderTypeForTenant(
    tenantId: string,
    orderTypeId: string | null | undefined,
  ): Promise<OrderTypeValidationResult> {
    if (orderTypeId === null || orderTypeId === undefined || orderTypeId === "") {
      const enabled = await this.db
        .select({ id: orderTypes.id })
        .from(orderTypes)
        .innerJoin(
          tenantOrderTypes,
          and(
            eq(tenantOrderTypes.orderTypeId, orderTypes.id),
            eq(tenantOrderTypes.tenantId, tenantId),
            eq(tenantOrderTypes.isEnabled, true),
          ),
        )
        .where(eq(orderTypes.isActive, true));

      if (enabled.length === 1) {
        return { valid: true, orderTypeId: enabled[0].id };
      }

      return { valid: true, orderTypeId: null };
    }

    const rows = await this.db
      .select({
        id: orderTypes.id,
        isActive: orderTypes.isActive,
        isEnabled: tenantOrderTypes.isEnabled,
      })
      .from(orderTypes)
      .innerJoin(
        tenantOrderTypes,
        and(
          eq(tenantOrderTypes.orderTypeId, orderTypes.id),
          eq(tenantOrderTypes.tenantId, tenantId),
        ),
      )
      .where(eq(orderTypes.id, orderTypeId))
      .limit(1);

    if (!rows[0]) {
      return {
        valid: false,
        errorCode: "INVALID_ORDER_TYPE",
        message: USER_SAFE_INVALID_ORDER_TYPE,
      };
    }

    if (!rows[0].isActive || !rows[0].isEnabled) {
      return {
        valid: false,
        errorCode: "INVALID_ORDER_TYPE",
        message: USER_SAFE_INVALID_ORDER_TYPE,
      };
    }

    return { valid: true, orderTypeId: rows[0].id };
  }
}
