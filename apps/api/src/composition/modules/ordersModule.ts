import { CreateOrder } from '@pos/application/orders/CreateOrder';
import { UpdateOrder, type IOrderRepository as UpdateOrderRepository } from '@pos/application/orders/UpdateOrder';
import type { Order } from '@pos/domain/orders/types';
import { RecordPayment } from '@pos/application/orders/RecordPayment';
import { CreateKitchenTicket } from '@pos/application/orders/CreateKitchenTicket';
import { ConfirmOrder } from '@pos/application/orders/ConfirmOrder';
import { CompleteOrder } from '@pos/application/orders/CompleteOrder';
import { CancelOrder } from '@pos/application/orders/CancelOrder';
import { ListOpenOrders } from '@pos/application/orders/ListOpenOrders';
import { ListOrderHistory } from '@pos/application/orders/ListOrderHistory';
import { TransitionOrderStatus } from '@pos/application/orders/TransitionOrderStatus';
import { CreateAndPayOrder } from '@pos/application/orders/CreateAndPayOrder';
import { TransitionOrderFulfillmentStatus } from '@pos/application/orders/TransitionOrderFulfillmentStatus';
import { ConfirmOrderWorkflow } from '@pos/application/orders/services/ConfirmOrderWorkflow';
import { CancelOrderWorkflow } from '@pos/application/orders/services/CancelOrderWorkflow';
import { OrderRepository } from '@pos/infrastructure/repositories/orders/OrderRepository';
import { OrderItemRepository } from '@pos/infrastructure/repositories/orders/OrderItemRepository';
import { OrderItemModifierRepository } from '@pos/infrastructure/repositories/orders/OrderItemModifierRepository';
import { OrderPaymentRepository } from '@pos/infrastructure/repositories/orders/OrderPaymentRepository';
import { KitchenTicketRepository } from '@pos/infrastructure/repositories/orders/KitchenTicketRepository';
import { OrderTypeRepository } from '@pos/infrastructure/repositories/orders/OrderTypeRepository';
import { DrizzleCreateAndPayOrderRepository } from '@pos/infrastructure/repositories/orders/DrizzleCreateAndPayOrderRepository';
import { DrizzleRecordPaymentRepository } from '@pos/infrastructure/repositories/orders/DrizzleRecordPaymentRepository';
import type { CheckProductAvailability } from '@pos/application/catalog/CheckProductAvailability';
import type { TenantRepository } from '@pos/infrastructure/repositories/tenants/TenantRepository';
import type { SharedCompositionDeps } from '../types';

export interface OrdersModuleDeps extends SharedCompositionDeps {
  tenantRepository: TenantRepository;
  checkProductAvailability: CheckProductAvailability;
}

export interface OrdersModule {
  orderRepository: OrderRepository;
  orderItemRepository: OrderItemRepository;
  orderItemModifierRepository: OrderItemModifierRepository;
  orderPaymentRepository: OrderPaymentRepository;
  kitchenTicketRepository: KitchenTicketRepository;
  orderTypeRepository: OrderTypeRepository;
  createOrder: CreateOrder;
  updateOrder: UpdateOrder;
  recordPayment: RecordPayment;
  createKitchenTicket: CreateKitchenTicket;
  confirmOrder: ConfirmOrder;
  completeOrder: CompleteOrder;
  cancelOrder: CancelOrder;
  confirmOrderWorkflow: ConfirmOrderWorkflow;
  cancelOrderWorkflow: CancelOrderWorkflow;
  listOpenOrders: ListOpenOrders;
  listOrderHistory: ListOrderHistory;
  transitionOrderStatus: TransitionOrderStatus;
  createAndPayOrder: CreateAndPayOrder;
  transitionOrderFulfillmentStatus: TransitionOrderFulfillmentStatus;
}

export const createOrdersModule = ({ db, unitOfWork, tenantRepository, checkProductAvailability }: OrdersModuleDeps): OrdersModule => {
  const orderRepository = new OrderRepository(db);
  const orderItemRepository = new OrderItemRepository(db);
  const orderItemModifierRepository = new OrderItemModifierRepository(db);
  const orderPaymentRepository = new OrderPaymentRepository(db);
  const kitchenTicketRepository = new KitchenTicketRepository(db);
  const orderTypeRepository = new OrderTypeRepository(db);
  const confirmOrder = new ConfirmOrder(orderRepository, tenantRepository);
  const cancelOrder = new CancelOrder(orderRepository, tenantRepository);
  const updateOrderRepository: UpdateOrderRepository = {
    findById: (orderId, tenantId) => tenantId ? orderRepository.findById(orderId, tenantId) : Promise.resolve(null),
    getEditLockState: (orderId, tenantId) => orderRepository.getEditLockState(orderId, tenantId),
    updateWithItems: async (orderId, orderUpdates, newItems, tenantId) => (
      await orderRepository.updateWithItems(orderId, orderUpdates, newItems, tenantId)
    ) as unknown as Order,
  };

  return {
    orderRepository,
    orderItemRepository,
    orderItemModifierRepository,
    orderPaymentRepository,
    kitchenTicketRepository,
    orderTypeRepository,
    createOrder: new CreateOrder(orderRepository, tenantRepository, checkProductAvailability),
    updateOrder: new UpdateOrder(updateOrderRepository, tenantRepository),
    recordPayment: new RecordPayment(new DrizzleRecordPaymentRepository(db, unitOfWork)),
    createKitchenTicket: new CreateKitchenTicket(orderRepository, kitchenTicketRepository),
    confirmOrder,
    completeOrder: new CompleteOrder(orderRepository, tenantRepository),
    cancelOrder,
    confirmOrderWorkflow: new ConfirmOrderWorkflow(confirmOrder, unitOfWork),
    cancelOrderWorkflow: new CancelOrderWorkflow(cancelOrder, orderRepository, unitOfWork),
    listOpenOrders: new ListOpenOrders(orderRepository, tenantRepository),
    listOrderHistory: new ListOrderHistory(orderRepository, tenantRepository),
    transitionOrderStatus: new TransitionOrderStatus(orderRepository),
    createAndPayOrder: new CreateAndPayOrder(new DrizzleCreateAndPayOrderRepository(db, unitOfWork)),
    transitionOrderFulfillmentStatus: new TransitionOrderFulfillmentStatus(orderRepository),
  };
};
