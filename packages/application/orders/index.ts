/**
 * Orders Application Services
 * Public API for order use cases
 */

export { CreateOrder } from './CreateOrder';
export type { 
  CreateOrderInput, 
  CreateOrderOutput,
  CreateOrderItemInput,
  IOrderRepository as IOrderRepositoryForCreateOrder,
  ITenantRepository as ITenantRepositoryForCreateOrder,
  IProductAvailabilityService
} from './CreateOrder';

export { CalculateOrderPricing } from './CalculateOrderPricing';
export type { 
  CalculateOrderPricingInput, 
  CalculateOrderPricingOutput,
  OrderItemForPricing
} from './CalculateOrderPricing';

export { RecordPayment } from './RecordPayment';
export type { 
  RecordPaymentInput, 
  RecordPaymentOutput,
} from './RecordPayment';

export { CreateKitchenTicket } from './CreateKitchenTicket';
export type { 
  CreateKitchenTicketInput, 
  CreateKitchenTicketOutput,
  IOrderRepository as IOrderRepositoryForCreateKitchenTicket,
  IKitchenTicketRepository
} from './CreateKitchenTicket';

export { ConfirmOrder } from './ConfirmOrder';
export type { 
  ConfirmOrderInput, 
  ConfirmOrderOutput,
  IOrderRepository as IOrderRepositoryForConfirmOrder,
  ITenantRepository as ITenantRepositoryForConfirmOrder
} from './ConfirmOrder';

export { CompleteOrder } from './CompleteOrder';
export type { 
  CompleteOrderInput, 
  CompleteOrderOutput,
  IOrderRepository as IOrderRepositoryForCompleteOrder,
  ITenantRepository as ITenantRepositoryForCompleteOrder
} from './CompleteOrder';

export { CancelOrder } from './CancelOrder';
export type { 
  CancelOrderInput, 
  CancelOrderOutput,
  IOrderRepository as IOrderRepositoryForCancelOrder,
  ITenantRepository as ITenantRepositoryForCancelOrder
} from './CancelOrder';

export { ListOpenOrders } from './ListOpenOrders';
export type { 
  ListOpenOrdersInput, 
  ListOpenOrdersOutput,
  IOrderRepository as IOrderRepositoryForListOpenOrders,
  ITenantRepository as ITenantRepositoryForListOpenOrders
} from './ListOpenOrders';

export { ListOrderHistory } from './ListOrderHistory';
export type { 
  ListOrderHistoryInput, 
  ListOrderHistoryOutput,
  PaginationMetadata,
  IOrderRepository as IOrderRepositoryForListOrderHistory,
  ITenantRepository as ITenantRepositoryForListOrderHistory
} from './ListOrderHistory';
export * from './TransitionOrderStatus';

// P0.2: True atomic create-and-pay use case
export { CreateAndPayOrder } from './CreateAndPayOrder';
export type { CreateAndPayOrderInput, CreateAndPayOrderOutput, CreateAndPayOrderItemInput } from './CreateAndPayOrder';

// P0.3: Kitchen/KDS-scoped fulfillment-only transition
export { TransitionOrderFulfillmentStatus } from './TransitionOrderFulfillmentStatus';
export type {
  TransitionOrderFulfillmentStatusInput,
  TransitionOrderFulfillmentStatusOutput,
  FulfillmentStatus,
} from './TransitionOrderFulfillmentStatus';
