/**
 * CalculateOrderPricing Use Case
 * Thin application wrapper around the canonical pure pricing engine in @pos/core.
 */

import type { SelectedOption, SelectedOptionGroup } from '@pos/domain/orders/types';
import type { PriceCalculation, AppliedDiscount } from '@pos/domain/pricing/types';
import { DEFAULT_TAX_RATE, DEFAULT_SERVICE_CHARGE_RATE, calculateItemPricing, calculateOrderPricing } from '@pos/core/pricing';

export interface OrderItemForPricing {
  base_price: number;
  variant_price_delta?: number;
  selected_options?: SelectedOption[];
  selected_option_groups?: SelectedOptionGroup[];
  quantity: number;
}

export interface CalculateOrderPricingInput {
  items: OrderItemForPricing[];
  tax_rate?: number;
  service_charge_rate?: number;
  discounts?: AppliedDiscount[];
}

export interface CalculateOrderPricingOutput {
  pricing: PriceCalculation;
}

export class CalculateOrderPricing {
  async execute(input: CalculateOrderPricingInput): Promise<CalculateOrderPricingOutput> {
    try {
      const result = calculateOrderPricing({
        ...input,
        tax_rate: input.tax_rate ?? DEFAULT_TAX_RATE,
        service_charge_rate: input.service_charge_rate ?? DEFAULT_SERVICE_CHARGE_RATE,
        discounts: input.discounts?.map((discount) => ({ amount: discount.amount_saved })),
      });

      const pricing: PriceCalculation = {
        base_price: 0,
        variant_delta: 0,
        options_delta: 0,
        item_price: 0,
        quantity: 0,
        item_subtotal: 0,
        order_subtotal: result.order_subtotal,
        discounts: input.discounts ?? [],
        total_discount: result.total_discount,
        subtotal_after_discount: result.subtotal_after_discount,
        tax_amount: result.tax_amount,
        service_charge_amount: result.service_charge_amount,
        total_amount: result.total_amount,
      };

      return { pricing };
    } catch (error) {
      throw new Error(`Failed to calculate order pricing: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  calculateItemPrice(item: OrderItemForPricing): number {
    return calculateItemPricing(item).item_price;
  }

  calculateItemSubtotal(item: OrderItemForPricing): number {
    return calculateItemPricing(item).item_subtotal;
  }
}
