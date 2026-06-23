export type PricingSelectedOption = {
  group_id: string;
  group_name: string;
  option_id: string;
  option_name: string;
  price_delta: number;
  child_groups?: PricingSelectedOptionGroup[];
};

export type PricingSelectedOptionGroup = {
  group_id: string;
  group_name: string;
  selected_options: PricingSelectedOption[];
};

export type PricingDiscount = {
  scope?: 'order' | 'item';
  type?: 'percent' | 'nominal' | 'fixed' | string;
  value?: number;
  amount?: number;
};

export type OrderPricingItemInput = {
  base_price: number;
  quantity: number;
  variant_price_delta?: number;
  selected_options?: PricingSelectedOption[];
  selected_option_groups?: PricingSelectedOptionGroup[];
  discounts?: PricingDiscount[];
};

export type CalculateOrderPricingInput = {
  items: OrderPricingItemInput[];
  tax_rate?: number;
  service_charge_rate?: number;
  discounts?: PricingDiscount[];
};

export type OrderPricingItemResult = {
  base_price: number;
  variant_delta: number;
  options_delta: number;
  item_price: number;
  quantity: number;
  item_subtotal: number;
  discount_amount: number;
  item_total: number;
};

export type OrderPricingResult = {
  items: OrderPricingItemResult[];
  order_subtotal: number;
  items_discount_total: number;
  order_discount_amount: number;
  total_discount: number;
  subtotal_after_discount: number;
  tax_amount: number;
  service_charge_amount: number;
  total_amount: number;
};

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function clampNonNegative(value: number): number {
  return Math.max(0, value);
}

function sumOptionPrice(option: PricingSelectedOption): number {
  const childrenDelta = option.child_groups?.reduce((sum, group) => sum + sumGroupPrice(group), 0) ?? 0;
  return option.price_delta + childrenDelta;
}

function sumGroupPrice(group: PricingSelectedOptionGroup): number {
  return group.selected_options.reduce((sum, option) => sum + sumOptionPrice(option), 0);
}

export function calculateSelectedOptionsDelta(
  selectedOptions?: PricingSelectedOption[],
  selectedOptionGroups?: PricingSelectedOptionGroup[],
): number {
  const directDelta = selectedOptions?.reduce((sum, option) => sum + sumOptionPrice(option), 0) ?? 0;
  const groupDelta = selectedOptionGroups?.reduce((sum, group) => sum + sumGroupPrice(group), 0) ?? 0;
  return directDelta + groupDelta;
}

export function flattenSelectedOptions(
  selectedOptions?: PricingSelectedOption[],
  selectedOptionGroups?: PricingSelectedOptionGroup[],
): PricingSelectedOption[] {
  const flattened: PricingSelectedOption[] = [];

  const walkOption = (option: PricingSelectedOption): void => {
    flattened.push({ ...option, child_groups: option.child_groups });
    option.child_groups?.forEach((group) => {
      group.selected_options.forEach((childOption) => walkOption(childOption));
    });
  };

  selectedOptions?.forEach((option) => walkOption(option));
  selectedOptionGroups?.forEach((group) => {
    group.selected_options.forEach((option) => walkOption(option));
  });

  return flattened;
}

export function calculateDiscountAmount(discounts: PricingDiscount[] | undefined, baseAmount: number): number {
  if (!discounts?.length || baseAmount <= 0) return 0;

  return roundCurrency(discounts.reduce((sum, discount) => {
    if ('amount' in discount && typeof discount.amount === 'number') {
      return sum + Math.min(Math.max(0, discount.amount), baseAmount);
    }

    const value = Math.max(0, discount.value ?? 0);
    if (discount.type === 'percent') {
      return sum + baseAmount * (Math.min(value, 100) / 100);
    }

    return sum + Math.min(value, baseAmount);
  }, 0));
}

export function calculateItemPricing(item: OrderPricingItemInput): OrderPricingItemResult {
  const variantDelta = item.variant_price_delta ?? 0;
  const optionsDelta = calculateSelectedOptionsDelta(item.selected_options, item.selected_option_groups);
  const itemPrice = item.base_price + variantDelta + optionsDelta;
  const itemSubtotal = roundCurrency(itemPrice * item.quantity);
  const discountAmount = Math.min(calculateDiscountAmount(item.discounts, itemSubtotal), itemSubtotal);
  const itemTotal = clampNonNegative(roundCurrency(itemSubtotal - discountAmount));

  return {
    base_price: item.base_price,
    variant_delta: variantDelta,
    options_delta: optionsDelta,
    item_price: itemPrice,
    quantity: item.quantity,
    item_subtotal: itemSubtotal,
    discount_amount: discountAmount,
    item_total: itemTotal,
  };
}

export function calculateOrderPricing(input: CalculateOrderPricingInput): OrderPricingResult {
  const items = input.items.map(calculateItemPricing);
  const orderSubtotal = roundCurrency(items.reduce((sum, item) => sum + item.item_subtotal, 0));
  const itemsDiscountTotal = roundCurrency(items.reduce((sum, item) => sum + item.discount_amount, 0));
  const subtotalAfterItemDiscounts = clampNonNegative(roundCurrency(orderSubtotal - itemsDiscountTotal));
  const orderDiscountAmount = Math.min(calculateDiscountAmount(input.discounts, subtotalAfterItemDiscounts), subtotalAfterItemDiscounts);
  const subtotalAfterDiscount = clampNonNegative(roundCurrency(subtotalAfterItemDiscounts - orderDiscountAmount));
  const taxAmount = roundCurrency(subtotalAfterDiscount * (input.tax_rate ?? 0));
  const serviceChargeAmount = roundCurrency(subtotalAfterDiscount * (input.service_charge_rate ?? 0));
  const totalAmount = roundCurrency(subtotalAfterDiscount + taxAmount + serviceChargeAmount);

  return {
    items,
    order_subtotal: orderSubtotal,
    items_discount_total: itemsDiscountTotal,
    order_discount_amount: orderDiscountAmount,
    total_discount: roundCurrency(itemsDiscountTotal + orderDiscountAmount),
    subtotal_after_discount: subtotalAfterDiscount,
    tax_amount: taxAmount,
    service_charge_amount: serviceChargeAmount,
    total_amount: totalAmount,
  };
}
