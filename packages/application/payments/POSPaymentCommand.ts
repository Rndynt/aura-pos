/**
 * SubmitPOSPaymentCommand
 *
 * Canonical backend command for the SubmitPOSPayment use case.
 * All enum values must be canonical.
 */

import type { POSPaymentFlow } from "@pos/domain/payments";
import type { POSPaymentLineKind } from "@pos/domain/payments";
import type { POSPaymentMethod } from "@pos/domain/payments";

export type SubmitPOSPaymentSource = "FRESH_CART" | "SAVED_ORDER" | "ACTIVE_ORDER";

export type SubmitPOSPaymentCommandItem = {
  product_id: string;
  product_name: string;
  base_price: number;
  quantity: number;
  variant_id?: string;
  variant_name?: string;
  variant_price_delta?: number;
  selected_options?: Array<{
    group_id: string;
    group_name: string;
    option_id: string;
    option_name: string;
    price_delta: number;
  }>;
  selected_option_groups?: unknown[];
  notes?: string;
  client_item_id?: string;
};

export type SubmitPOSPaymentCommandLine = {
  method: POSPaymentMethod;
  amount: number;
  receivedAmount?: number;
  referenceNote?: string;
  clientBillId?: string;
  orderBillSplitId?: string;
};

export type SubmitPOSPaymentCommandSplit = {
  clientBillId: string;
  label: string;
  splitNo: number;
  amountDue: number;
  amountPaid?: number;
  status?: "UNPAID" | "PARTIAL" | "PAID";
  items?: Array<{ orderItemId?: string; clientItemId?: string; quantity: number; amount: number }>;
};

export type SubmitPOSPaymentCommand = {
  tenantId: string;
  outletId?: string | null;
  source: SubmitPOSPaymentSource;
  clientPaymentSessionId: string;

  orderId?: string;
  orderNumber?: string;

  order?: {
    items: SubmitPOSPaymentCommandItem[];
    order_type_id?: string | null;
    customer_name?: string;
    table_number?: string;
    notes?: string;
    tax_rate?: number;
    service_charge_rate?: number;
    fulfillment_mode?: "standard" | "instant";
  };

  payment: {
    flow: POSPaymentFlow;
    paymentKind?: POSPaymentLineKind;
    targetBillId?: string;
    lines: SubmitPOSPaymentCommandLine[];
    splits?: SubmitPOSPaymentCommandSplit[];
  };
};
