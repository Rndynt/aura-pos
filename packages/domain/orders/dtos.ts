import type { OrderActionId } from '../business-flows/businessFlowActions';
import type { POSPaymentFlow, POSPaymentKind, POSPaymentMethod } from '../payments';
import type { SelectedOption, SelectedOptionGroup } from './types';

export type OrderLifecycleStatus = 'draft' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled';
export type OrderLifecyclePaymentStatus = 'unpaid' | 'partial' | 'paid' | 'refunded' | 'voided' | 'pending' | 'completed' | 'failed';
export type OrderLifecycleItemStatus = 'pending' | 'preparing' | 'ready' | 'delivered';
export type OrderLifecycleKind = 'server_draft' | 'active_order' | 'active_kitchen_order' | 'paid_completed' | 'cancelled' | 'unknown';

export type OrderLifecycleItemDto = {
  status?: OrderLifecycleItemStatus | string | null;
};

export type OrderLifecycleDto = {
  id?: string;
  orderNumber?: string;
  order_number?: string;
  tableNumber?: string;
  table_number?: string;
  customerName?: string;
  customer_name?: string;
  total?: string | number | null;
  total_amount?: string | number | null;
  paidAmount?: string | number | null;
  paid_amount?: string | number | null;
  remainingAmount?: string | number | null;
  remaining_amount?: string | number | null;
  status?: OrderLifecycleStatus | string | null;
  paymentStatus?: OrderLifecyclePaymentStatus | string | null;
  payment_status?: OrderLifecyclePaymentStatus | string | null;
  fulfillmentStatus?: string | null;
  fulfillment_status?: string | null;
  kitchenStatus?: string | null;
  kitchen_status?: string | null;
  items?: OrderLifecycleItemDto[];
  orderItems?: OrderLifecycleItemDto[];
  hasKitchenTicket?: boolean;
  isEditableDraft?: boolean;
  isActiveOrder?: boolean;
  isKitchenLocked?: boolean;
  hasFiredKitchenItems?: boolean;
  allowedActions?: OrderActionId[] | string[];
};

export interface OrderLifecycleLockState {
  hasKitchenTicket?: boolean;
  hasFiredKitchenItems?: boolean;
}

export interface OrderLifecycleDtoFields {
  isEditableDraft: boolean;
  isActiveOrder: boolean;
  isKitchenLocked: boolean;
  hasKitchenTicket: boolean;
  hasFiredKitchenItems: boolean;
  allowedActions: OrderActionId[];
  lifecycleKind: OrderLifecycleKind;
  lifecycleLabel: string;
}

export type POSPaymentCommandLineDto = {
  method: POSPaymentMethod;
  amount: number;
  receivedAmount?: number;
  referenceNote?: string;
  clientBillId?: string;
  splitId?: string;
  orderBillSplitId?: string;
};

export type POSPaymentCommandDto = {
  flow: POSPaymentFlow;
  paymentKind?: POSPaymentKind;
  targetBillId?: string;
  lines: POSPaymentCommandLineDto[];
};

export type SelectedOptionsDto = {
  selected_options?: SelectedOption[];
  selected_option_groups?: SelectedOptionGroup[];
};

export type OfflineSyncOrderPayloadDto = {
  id?: string;
  clientOrderId?: string;
  order_number?: string;
  orderNumber?: string;
  tenant_id?: string;
  tenantId?: string;
  outlet_id?: string;
  outletId?: string;
  items?: Array<SelectedOptionsDto & Record<string, unknown>>;
  payment?: POSPaymentCommandDto;
  payments?: POSPaymentCommandLineDto[];
  status?: string;
  payment_status?: string;
  paymentStatus?: string;
  created_at?: string | Date;
  createdAt?: string | Date;
};
