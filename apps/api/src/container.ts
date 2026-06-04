/**
 * Dependency Injection Container
 * Initializes and wires up all repositories and use cases
 */

import { db } from '@pos/infrastructure/database';

// Repositories
import { ProductRepository } from '@pos/infrastructure/repositories/catalog/ProductRepository';
import { ProductOptionGroupRepository } from '@pos/infrastructure/repositories/catalog/ProductOptionGroupRepository';
import { ProductOptionRepository } from '@pos/infrastructure/repositories/catalog/ProductOptionRepository';
import { OrderRepository } from '@pos/infrastructure/repositories/orders/OrderRepository';
import { OrderItemRepository } from '@pos/infrastructure/repositories/orders/OrderItemRepository';
import { OrderItemModifierRepository } from '@pos/infrastructure/repositories/orders/OrderItemModifierRepository';
import { OrderPaymentRepository } from '@pos/infrastructure/repositories/orders/OrderPaymentRepository';
import { KitchenTicketRepository } from '@pos/infrastructure/repositories/orders/KitchenTicketRepository';
import { OrderTypeRepository } from '@pos/infrastructure/repositories/orders/OrderTypeRepository';
import { TenantRepository } from '@pos/infrastructure/repositories/tenants/TenantRepository';
import { TenantFeatureRepository } from '@pos/infrastructure/repositories/tenants/TenantFeatureRepository';
import { TenantModuleConfigRepository } from '@pos/infrastructure/repositories/tenants/TenantModuleConfigRepository';

// Payment Engine Repositories
import { PaymentIntentRepository } from '@pos/infrastructure/repositories/payments/PaymentIntentRepository';
import { PaymentTransactionRepository } from '@pos/infrastructure/repositories/payments/PaymentTransactionRepository';
import { PaymentAllocationRepository } from '@pos/infrastructure/repositories/payments/PaymentAllocationRepository';
import { PaymentProviderEventRepository } from '@pos/infrastructure/repositories/payments/PaymentProviderEventRepository';

// Payment Engine Use Cases
import { CreatePaymentIntent } from '@pos/application/payments/CreatePaymentIntent';
import { GetPaymentIntent } from '@pos/application/payments/GetPaymentIntent';
import { ListPaymentTransactions } from '@pos/application/payments/ListPaymentTransactions';
import { RecordManualPayment } from '@pos/application/payments/RecordManualPayment';
import { RecalculatePaymentIntent } from '@pos/application/payments/RecalculatePaymentIntent';
import { PaymentProviderRegistry } from '@pos/application/payments/PaymentProviderRegistry';
import { CreateGatewayPayment } from '@pos/application/payments/CreateGatewayPayment';
import { ConfirmFakeGatewayPayment } from '@pos/application/payments/ConfirmFakeGatewayPayment';
import { ApplyGatewayTransactionStatus } from '@pos/application/payments/ApplyGatewayTransactionStatus';
import { HandlePaymentProviderWebhook } from '@pos/application/payments/HandlePaymentProviderWebhook';
import { RefundPaymentTransaction } from '@pos/application/payments/RefundPaymentTransaction';
import { VoidPaymentTransaction } from '@pos/application/payments/VoidPaymentTransaction';

// Payment Providers
import { ManualProvider } from '@pos/domain/payments';
import { FakeGatewayProvider } from '@pos/infrastructure/payments/providers/FakeGatewayProvider';

// Use Cases - Catalog
import { GetProducts } from '@pos/application/catalog/GetProducts';
import { GetProductById } from '@pos/application/catalog/GetProductById';
import { CheckProductAvailability } from '@pos/application/catalog/CheckProductAvailability';
import { CreateOrUpdateProduct } from '@pos/application/catalog/CreateOrUpdateProduct';

// Use Cases - Orders
import { CreateOrder } from '@pos/application/orders/CreateOrder';
import { UpdateOrder } from '@pos/application/orders/UpdateOrder';
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
import { SyncOfflineOrder } from '@pos/application/sync/SyncOfflineOrder';

// Use Cases - Tenants
import { GetActiveFeaturesForTenant } from '@pos/application/tenants/GetActiveFeaturesForTenant';
import { CheckFeatureAccess } from '@pos/application/tenants/CheckFeatureAccess';
import { CreateTenant } from '@pos/application/tenants/CreateTenant';
import { GetTenantProfile } from '@pos/application/tenants/GetTenantProfile';

/**
 * Container class that holds all dependencies
 */
class Container {
  // Database
  public readonly db = db;

  // Catalog Repositories
  public readonly productRepository: ProductRepository;
  public readonly productOptionGroupRepository: ProductOptionGroupRepository;
  public readonly productOptionRepository: ProductOptionRepository;

  // Order Repositories
  public readonly orderRepository: OrderRepository;
  public readonly orderItemRepository: OrderItemRepository;
  public readonly orderItemModifierRepository: OrderItemModifierRepository;
  public readonly orderPaymentRepository: OrderPaymentRepository;
  public readonly kitchenTicketRepository: KitchenTicketRepository;
  public readonly orderTypeRepository: OrderTypeRepository;

  // Tenant Repositories
  public readonly tenantRepository: TenantRepository;
  public readonly tenantFeatureRepository: TenantFeatureRepository;
  public readonly tenantModuleConfigRepository: TenantModuleConfigRepository;

  // Catalog Use Cases
  public readonly getProducts: GetProducts;
  public readonly getProductById: GetProductById;
  public readonly checkProductAvailability: CheckProductAvailability;
  public readonly createOrUpdateProduct: CreateOrUpdateProduct;

  // Order Use Cases
  public readonly createOrder: CreateOrder;
  public readonly updateOrder: UpdateOrder;
  public readonly recordPayment: RecordPayment;
  public readonly createKitchenTicket: CreateKitchenTicket;
  public readonly confirmOrder: ConfirmOrder;
  public readonly completeOrder: CompleteOrder;
  public readonly cancelOrder: CancelOrder;
  public readonly listOpenOrders: ListOpenOrders;
  public readonly listOrderHistory: ListOrderHistory;
  public readonly transitionOrderStatus: TransitionOrderStatus;
  /** P0.2: true atomic create-and-pay */
  public readonly createAndPayOrder: CreateAndPayOrder;
  /** P0.3: kitchen/KDS fulfillment-only transitions */
  public readonly transitionOrderFulfillmentStatus: TransitionOrderFulfillmentStatus;
  /** Sprint 4: batch offline order sync */
  public readonly syncOfflineOrder: SyncOfflineOrder;

  // Tenant Use Cases
  public readonly getActiveFeaturesForTenant: GetActiveFeaturesForTenant;
  public readonly checkFeatureAccess: CheckFeatureAccess;
  public readonly createTenant: CreateTenant;
  public readonly getTenantProfile: GetTenantProfile;

  // Payment Engine Repositories
  public readonly paymentIntentRepository: PaymentIntentRepository;
  public readonly paymentTransactionRepository: PaymentTransactionRepository;
  public readonly paymentAllocationRepository: PaymentAllocationRepository;
  public readonly paymentProviderEventRepository: PaymentProviderEventRepository;

  // Payment Engine Use Cases (Phase 1)
  public readonly createPaymentIntent: CreatePaymentIntent;
  public readonly getPaymentIntent: GetPaymentIntent;
  public readonly listPaymentTransactions: ListPaymentTransactions;
  public readonly recalculatePaymentIntent: RecalculatePaymentIntent;
  public readonly recordManualPayment: RecordManualPayment;

  // Payment Engine (Phase 2: Gateway Abstraction)
  public readonly paymentProviderRegistry: PaymentProviderRegistry;
  public readonly createGatewayPayment: CreateGatewayPayment;

  // Payment Engine (Phase 3: Webhook / Event Engine)
  public readonly applyGatewayTransactionStatus: ApplyGatewayTransactionStatus;
  public readonly confirmFakeGatewayPayment: ConfirmFakeGatewayPayment;
  public readonly handlePaymentProviderWebhook: HandlePaymentProviderWebhook;

  // Payment Engine (Phase 4: Refund / Void Lifecycle)
  public readonly refundPaymentTransaction: RefundPaymentTransaction;
  public readonly voidPaymentTransaction: VoidPaymentTransaction;

  constructor() {
    // Initialize Repositories
    this.productRepository = new ProductRepository(db);
    this.productOptionGroupRepository = new ProductOptionGroupRepository(db);
    this.productOptionRepository = new ProductOptionRepository(db);
    this.orderRepository = new OrderRepository(db);
    this.orderItemRepository = new OrderItemRepository(db);
    this.orderItemModifierRepository = new OrderItemModifierRepository(db);
    this.orderPaymentRepository = new OrderPaymentRepository(db);
    this.kitchenTicketRepository = new KitchenTicketRepository(db);
    this.orderTypeRepository = new OrderTypeRepository(db);
    this.tenantRepository = new TenantRepository(db);
    this.tenantFeatureRepository = new TenantFeatureRepository(db);
    this.tenantModuleConfigRepository = new TenantModuleConfigRepository(db);

    // Initialize Use Cases with Repository Dependencies
    // Catalog
    this.getProducts = new GetProducts(this.productRepository as any);
    this.getProductById = new GetProductById(this.productRepository as any);
    this.checkProductAvailability = new CheckProductAvailability(
      this.productRepository as any
    );
    this.createOrUpdateProduct = new CreateOrUpdateProduct(
      db,
      this.productRepository as any,
      this.productOptionGroupRepository as any,
      this.productOptionRepository as any,
      this.tenantRepository as any
    );

    // Orders
    this.createOrder = new CreateOrder(
      this.orderRepository as any,
      this.tenantRepository as any,
      this.checkProductAvailability as any
    );
    this.updateOrder = new UpdateOrder(
      this.orderRepository as any,
      this.tenantRepository as any
    );
    // P1.2: transaction-safe record payment (wrapped in DB transaction + row lock)
    this.recordPayment = new RecordPayment(db as any);
    this.createKitchenTicket = new CreateKitchenTicket(
      this.orderRepository as any,
      this.kitchenTicketRepository as any
    );
    this.confirmOrder = new ConfirmOrder(
      this.orderRepository as any,
      this.tenantRepository as any
    );
    this.completeOrder = new CompleteOrder(
      this.orderRepository as any,
      this.tenantRepository as any
    );
    this.cancelOrder = new CancelOrder(
      this.orderRepository as any,
      this.tenantRepository as any
    );
    this.listOpenOrders = new ListOpenOrders(
      this.orderRepository as any,
      this.tenantRepository as any
    );
    this.transitionOrderStatus = new TransitionOrderStatus(
      this.orderRepository
    );

    // P0.2: True atomic create-and-pay (single DB transaction)
    this.createAndPayOrder = new CreateAndPayOrder(db);

    // Sprint 4: Batch offline sync
    this.syncOfflineOrder = new SyncOfflineOrder(db);

    // P0.3: Kitchen/KDS fulfillment-only transitions
    this.transitionOrderFulfillmentStatus = new TransitionOrderFulfillmentStatus(
      this.orderRepository
    );

    this.listOrderHistory = new ListOrderHistory(
      this.orderRepository as any,
      this.tenantRepository as any
    );

    // Tenants
    this.getActiveFeaturesForTenant = new GetActiveFeaturesForTenant(
      this.tenantFeatureRepository as any
    );
    this.checkFeatureAccess = new CheckFeatureAccess(
      this.tenantFeatureRepository as any
    );
    this.createTenant = new CreateTenant(
      this.tenantRepository as any,
      this.tenantModuleConfigRepository as any,
      this.tenantFeatureRepository as any,
      this.orderTypeRepository as any
    );
    this.getTenantProfile = new GetTenantProfile(
      this.tenantRepository as any,
      this.tenantFeatureRepository as any,
      this.tenantModuleConfigRepository as any
    );

    // Payment Engine — Repositories
    this.paymentIntentRepository = new PaymentIntentRepository(db);
    this.paymentTransactionRepository = new PaymentTransactionRepository(db);
    this.paymentAllocationRepository = new PaymentAllocationRepository(db);
    this.paymentProviderEventRepository = new PaymentProviderEventRepository(db);

    // Payment Engine — Phase 1 Use Cases
    this.recalculatePaymentIntent = new RecalculatePaymentIntent(
      this.paymentIntentRepository,
      this.paymentTransactionRepository
    );
    this.createPaymentIntent = new CreatePaymentIntent(this.paymentIntentRepository);
    this.getPaymentIntent = new GetPaymentIntent(this.paymentIntentRepository);
    this.listPaymentTransactions = new ListPaymentTransactions(
      this.paymentIntentRepository,
      this.paymentTransactionRepository
    );
    this.recordManualPayment = new RecordManualPayment(
      db,
      this.paymentIntentRepository,
      this.paymentTransactionRepository,
      this.paymentAllocationRepository,
      this.recalculatePaymentIntent
    );

    // Payment Engine — Phase 2: Gateway Abstraction
    // Build the provider registry with all supported providers.
    this.paymentProviderRegistry = new PaymentProviderRegistry()
      .register(new ManualProvider())
      .register(new FakeGatewayProvider());

    this.createGatewayPayment = new CreateGatewayPayment(
      db,
      this.paymentIntentRepository,
      this.paymentTransactionRepository,
      this.paymentProviderRegistry,
    );

    // Payment Engine — Phase 3: Webhook / Event Engine
    // ApplyGatewayTransactionStatus is the shared atomic helper used by both
    // ConfirmFakeGatewayPayment (dev/test endpoint) and HandlePaymentProviderWebhook.
    this.applyGatewayTransactionStatus = new ApplyGatewayTransactionStatus(
      this.paymentIntentRepository,
      this.paymentTransactionRepository,
      this.paymentAllocationRepository,
      this.recalculatePaymentIntent,
    );

    this.confirmFakeGatewayPayment = new ConfirmFakeGatewayPayment(
      db,
      this.applyGatewayTransactionStatus,
    );

    this.handlePaymentProviderWebhook = new HandlePaymentProviderWebhook(
      db,
      this.paymentProviderRegistry,
      this.paymentProviderEventRepository,
      this.paymentTransactionRepository,
      this.applyGatewayTransactionStatus,
    );

    // Payment Engine — Phase 4: Refund / Void Lifecycle
    this.refundPaymentTransaction = new RefundPaymentTransaction(
      db,
      this.paymentIntentRepository,
      this.paymentTransactionRepository,
      this.recalculatePaymentIntent,
    );

    this.voidPaymentTransaction = new VoidPaymentTransaction(
      db,
      this.paymentIntentRepository,
      this.paymentTransactionRepository,
    );
  }
}

// Export singleton instance
export const container = new Container();
