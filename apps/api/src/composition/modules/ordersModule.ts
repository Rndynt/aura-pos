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
  orderQueries: {
    findById: (orderId: string, tenantId: string) => ReturnType<OrderRepository['findById']>;
    findByTenant: OrderRepository['findByTenant'];
    countByTenant: OrderRepository['countByTenant'];
    getEditLockState: OrderRepository['getEditLockState'];
    getEditLockStates: OrderRepository['getEditLockStates'];
  };
  orderTypeHandlers: {
    findOrBootstrapForTenant: OrderTypeRepository['findOrBootstrapForTenant'];
    findAll: OrderTypeRepository['findAll'];
    enableForTenant: OrderTypeRepository['enableForTenant'];
    disableForTenant: OrderTypeRepository['disableForTenant'];
  };
  kitchenTicketRepository: KitchenTicketRepository;
}

export const createOrdersModule = ({ db, unitOfWork, tenantRepository, checkProductAvailability }: OrdersModuleDeps): OrdersModule => {
  const orderRepository = new OrderRepository(db);
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
    orderQueries: {
      findById: (orderId, tenantId) => orderRepository.findById(orderId, tenantId),
      findByTenant: orderRepository.findByTenant.bind(orderRepository),
      countByTenant: orderRepository.countByTenant.bind(orderRepository),
      getEditLockState: orderRepository.getEditLockState.bind(orderRepository),
      getEditLockStates: orderRepository.getEditLockStates.bind(orderRepository),
    },
    orderTypeHandlers: {
      findOrBootstrapForTenant: orderTypeRepository.findOrBootstrapForTenant.bind(orderTypeRepository),
      findAll: orderTypeRepository.findAll.bind(orderTypeRepository),
      enableForTenant: orderTypeRepository.enableForTenant.bind(orderTypeRepository),
      disableForTenant: orderTypeRepository.disableForTenant.bind(orderTypeRepository),
    },
    kitchenTicketRepository,
  };
};
