import { CalculateOrderPricing, type OrderItemForPricing } from './CalculateOrderPricing';

export type CreateAndPayPaymentFlow = 'FULL' | 'DOWN_PAYMENT' | 'MULTI_PAYMENT' | 'SPLIT_BILL';

export async function calculateCreateAndPayTotal(input: {
  items: OrderItemForPricing[];
  tax_rate?: number;
  service_charge_rate?: number;
}): Promise<number> {
  const calculator = new CalculateOrderPricing();
  const { pricing } = await calculator.execute(input);
  return pricing.total_amount;
}

export function resolveCreateAndPayPaymentFlow(input: {
  requestedFlow?: CreateAndPayPaymentFlow;
  amount: number;
  estimatedTotal: number;
}): { paymentFlow: CreateAndPayPaymentFlow; isPartialPayment: boolean } {
  const paymentFlow = input.requestedFlow ?? (input.amount < input.estimatedTotal - 0.01 ? 'DOWN_PAYMENT' : 'FULL');
  return {
    paymentFlow,
    isPartialPayment: paymentFlow === 'DOWN_PAYMENT' || input.amount < input.estimatedTotal - 0.01,
  };
}
