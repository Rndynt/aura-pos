/**
 * POSPaymentOrderTypePort
 *
 * Port for validating order_type_id before any order insert.
 * Returns user-safe errors — never exposes FK or DB error messages.
 *
 * Can be reused by CreateOrder and CreateAndPayOrder in future phases.
 */

export type OrderTypeValidationResult =
  | { valid: true; orderTypeId: string | null }
  | { valid: false; errorCode: "INVALID_ORDER_TYPE"; message: string };

export interface POSPaymentOrderTypePort {
  /**
   * Validate that order_type_id:
   * - exists in order_types
   * - is active (is_active = true)
   * - is enabled for the tenant via tenant_order_types (is_enabled = true)
   *
   * If orderTypeId is null/undefined and the tenant has exactly one enabled
   * active order type, that type is returned as a safe fallback.
   *
   * If orderTypeId is null/undefined and the tenant has zero or multiple enabled
   * types, returns { valid: true, orderTypeId: null } (no forced selection).
   */
  validateOrderTypeForTenant(
    tenantId: string,
    orderTypeId: string | null | undefined,
  ): Promise<OrderTypeValidationResult>;
}
