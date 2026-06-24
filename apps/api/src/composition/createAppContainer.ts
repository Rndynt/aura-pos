import { createDatabaseModule } from './shared/databaseModule';
import { createCatalogModule, type CatalogModule } from './modules/catalogModule';
import { createInventoryModule, type InventoryModule } from './modules/inventoryModule';
import { createTenantModule } from './modules/tenantModule';
import { createOrdersModule, type OrdersModule } from './modules/ordersModule';
import { createPaymentsModule, type PaymentsModule } from './modules/paymentsModule';
import { createSyncModule, type SyncModule } from './modules/syncModule';
import { createKitchenModule, type KitchenModule } from './modules/kitchenModule';

/**
 * Public API dependency container exposed to HTTP controllers/handlers.
 *
 * Keep raw shared composition dependencies (notably `db` and unit-of-work)
 * inside composition module factories. HTTP code should depend on typed
 * use cases/handlers from this public surface instead of reaching into the
 * database or infrastructure repositories through the singleton container.
 */
export type ApiUseCaseContainer = CatalogModule
  & InventoryModule
  & OrdersModule
  & PaymentsModule
  & SyncModule
  & KitchenModule;

export type AppContainer = ApiUseCaseContainer;

export function createAppContainer(): ApiUseCaseContainer {
  const shared = createDatabaseModule();
  const tenant = createTenantModule(shared);
  const inventory = createInventoryModule(shared);
  const catalog = createCatalogModule(shared);
  const orders = createOrdersModule({
    ...shared,
    tenantRepository: tenant.tenantRepository,
    checkProductAvailability: catalog.checkProductAvailability,
  });
  const payments = createPaymentsModule(shared);
  const sync = createSyncModule(shared);
  const kitchen = createKitchenModule({
    kitchenTicketRepository: orders.kitchenTicketRepository,
    createKitchenTicket: orders.createKitchenTicket,
  });

  return {
    ...inventory,
    ...catalog,
    ...orders,
    ...payments,
    ...sync,
    ...kitchen,
  };
}
