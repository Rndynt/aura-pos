import { createDatabaseModule } from './shared/databaseModule';
import { createCatalogModule, type CatalogModule } from './modules/catalogModule';
import { createInventoryModule, type InventoryModule } from './modules/inventoryModule';
import { createTenantModule, type TenantModule } from './modules/tenantModule';
import { createOrdersModule, type OrdersModule } from './modules/ordersModule';
import { createPaymentsModule, type PaymentsModule } from './modules/paymentsModule';
import { createSyncModule, type SyncModule } from './modules/syncModule';
import { createKitchenModule, type KitchenModule } from './modules/kitchenModule';
import type { SharedCompositionDeps } from './types';

export type AppContainer = SharedCompositionDeps
  & TenantModule
  & CatalogModule
  & InventoryModule
  & OrdersModule
  & PaymentsModule
  & SyncModule
  & KitchenModule;

export function createAppContainer(): AppContainer {
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
    ...shared,
    ...inventory,
    ...catalog,
    ...tenant,
    ...orders,
    ...payments,
    ...sync,
    ...kitchen,
  };
}
