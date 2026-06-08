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
import { DrizzleCreateAndPayOrderRepository } from '@pos/infrastructure/repositories/orders/DrizzleCreateAndPayOrderRepository';
import { DrizzleRecordPaymentRepository } from '@pos/infrastructure/repositories/orders/DrizzleRecordPaymentRepository';
import { DrizzleSyncOfflineOrderRepository } from '@pos/infrastructure/repositories/sync/DrizzleSyncOfflineOrderRepository';
import { TenantRepository } from '@pos/infrastructure/repositories/tenants/TenantRepository';
import { TenantFeatureRepository } from '@pos/infrastructure/repositories/tenants/TenantFeatureRepository';
import { TenantModuleConfigRepository } from '@pos/infrastructure/repositories/tenants/TenantModuleConfigRepository';

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
    this.recordPayment = new RecordPayment(new DrizzleRecordPaymentRepository(db));
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
    this.createAndPayOrder = new CreateAndPayOrder(new DrizzleCreateAndPayOrderRepository(db));

    // Sprint 4: Batch offline sync
    this.syncOfflineOrder = new SyncOfflineOrder(new DrizzleSyncOfflineOrderRepository(db));

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

  }
}

// Export singleton instance
export const container = new Container();
