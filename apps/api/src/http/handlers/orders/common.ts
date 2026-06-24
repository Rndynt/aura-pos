import { Request } from 'express';
import { z } from 'zod';
import { container } from '../../../container';
import { createError } from '../../middleware/errorHandler';
import { getEffectiveEntitlementMap, loadTenantEntitlementContext } from '../../../services/tenantEntitlements';
import { withOrderLifecycleDtoFields } from '@pos/application/orders/mappers/orderLifecycleDtoMapper';
import { assertCanPerformOrderAction, resolveBusinessProfileFromBusinessType, type OrderActionPolicyError } from '@pos/application/business-flows';

export type OrderActionPolicyBase = { businessProfile: ReturnType<typeof resolveBusinessProfileFromBusinessType> | 'core_standard'; entitlements: string[] };

let orderActionPolicyBaseOverride: ((tenantId: string, options?: { requireEntitlements?: boolean }) => Promise<OrderActionPolicyBase> | OrderActionPolicyBase) | null = null;

export function __setOrderActionPolicyBaseOverrideForTests(
  override: ((tenantId: string, options?: { requireEntitlements?: boolean }) => Promise<OrderActionPolicyBase> | OrderActionPolicyBase) | null,
): void {
  orderActionPolicyBaseOverride = override;
}

export async function getOrderActionPolicyBase(tenantId: string, options: { requireEntitlements?: boolean } = {}) {
  if (orderActionPolicyBaseOverride) return orderActionPolicyBaseOverride(tenantId, options);
  if (!options.requireEntitlements) return { businessProfile: 'core_standard' as const, entitlements: [] };
  const context = await loadTenantEntitlementContext(tenantId);
  const entitlementMap = await getEffectiveEntitlementMap(tenantId);
  const businessType = context?.businessType ?? null;
  return {
    businessProfile: resolveBusinessProfileFromBusinessType({ businessType, businessTypeCode: businessType }),
    entitlements: Object.entries(entitlementMap).filter(([, enabled]) => enabled).map(([code]) => code),
  };
}

export function throwPolicyHttpError(error: OrderActionPolicyError): never {
  throw createError(error.message, error.statusCode ?? 409, error.code);
}

export function getIdempotencyKey(req: Request, bodyValue?: string): string | undefined {
  const bodyKey = bodyValue?.trim();
  const headerKey = req.get('x-idempotency-key')?.trim();
  return bodyKey || headerKey || undefined;
}

export async function assertOrderBelongsToOutlet(orderId: string, tenantId: string, outletId?: string | null): Promise<any> {
  const order = await container.orderQueries.findById(orderId, tenantId);
  if (!order) throw createError('Order not found', 404, 'ORDER_NOT_FOUND');
  if (outletId && order.outletId !== outletId) throw createError('Order not found for this outlet', 404, 'ORDER_NOT_FOUND');
  return order;
}

export async function requirePaymentEntitlement(tenantId: string, entitlementCode: string): Promise<void> {
  if (orderActionPolicyBaseOverride) {
    const policyBase = await orderActionPolicyBaseOverride(tenantId, { requireEntitlements: true });
    if (policyBase.entitlements.includes(entitlementCode)) return;
  }
  const entitlements = await getEffectiveEntitlementMap(tenantId);
  if (entitlements[entitlementCode] === true) return;
  throw createError(`Fitur pembayaran ini memerlukan entitlement '${entitlementCode}'.`, 403, 'ENTITLEMENT_REQUIRED');
}

export async function resolveOrderTypeForTenant(tenantId: string, orderTypeId: string | null | undefined): Promise<string | null> {
  const result = await container.orderTypePaymentHandlers.validateOrderTypeForTenant(tenantId, orderTypeId);
  if (!result.valid) throw createError(result.message, 400, result.errorCode);
  return result.orderTypeId;
}

export async function attachLifecycleFields(orders: any[], tenantId: string): Promise<any[]> {
  if (orders.length === 0) return orders;
  const lockStates = await container.orderQueries.getEditLockStates?.(orders.map((order) => order.id), tenantId);
  return orders.map((order) => withOrderLifecycleDtoFields(order, lockStates?.[order.id]));
}

export async function attachLifecycleField(order: any, tenantId: string): Promise<any> {
  const lockState = await container.orderQueries.getEditLockState?.(order.id, tenantId);
  return withOrderLifecycleDtoFields(order, lockState);
}

export const selectedOptionSchema = z.object({
  group_id: z.string(), group_name: z.string(), option_id: z.string(), option_name: z.string(), price_delta: z.number(),
});

export const orderItemSchema = z.object({
  product_id: z.string(), product_name: z.string(), base_price: z.number(), quantity: z.number().int().positive(),
  variant_id: z.string().optional(), variant_name: z.string().optional(), variant_price_delta: z.number().optional(),
  selected_options: z.array(selectedOptionSchema).optional(), notes: z.string().optional(),
});

export const paymentFlowSchema = z.enum(['FULL', 'DOWN_PAYMENT', 'MULTI_PAYMENT', 'SPLIT_BILL']);
export const paymentKindSchema = z.enum(['FULL_PAYMENT', 'DOWN_PAYMENT', 'REMAINING_PAYMENT', 'MULTI_PAYMENT_LINE', 'SPLIT_BILL_LINE']);
export const paymentMethodSchema = z.enum(['CASH', 'MANUAL_TRANSFER', 'MANUAL_QRIS']);
export { assertCanPerformOrderAction };
