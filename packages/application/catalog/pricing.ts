import {
  calculateSelectedOptionsDelta,
  flattenSelectedOptions,
  type PricingSelectedOption,
  type PricingSelectedOptionGroup,
} from '@pos/core/pricing';
import type { SelectedOption, SelectedOptionGroup } from '@pos/domain/orders/types';

export { calculateSelectedOptionsDelta, flattenSelectedOptions };

const _typeCheckSelectedOption: SelectedOption extends PricingSelectedOption ? true : false = true;
const _typeCheckSelectedOptionGroup: SelectedOptionGroup extends PricingSelectedOptionGroup ? true : false = true;
void _typeCheckSelectedOption;
void _typeCheckSelectedOptionGroup;
