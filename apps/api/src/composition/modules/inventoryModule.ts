import {
  configureInventoryPolicyPort,
  configureInventorySyncErrorPort,
  configureStockMovementPort,
} from '@pos/application/inventory';
import {
  DrizzleInventoryBalanceRepository,
  DrizzleInventoryPolicyRepository,
  DrizzleInventorySyncErrorRepository,
  DrizzleStockMovementRepository,
} from '@pos/infrastructure/repositories/inventory';
import type { ModuleFactory } from '../types';

export interface InventoryModule {
  inventoryPolicyRepository: DrizzleInventoryPolicyRepository;
  inventorySyncErrorRepository: DrizzleInventorySyncErrorRepository;
  stockMovementRepository: DrizzleStockMovementRepository;
  inventoryBalanceRepository: DrizzleInventoryBalanceRepository;
}

export const createInventoryModule: ModuleFactory<InventoryModule> = ({ db }) => {
  const inventoryPolicyRepository = new DrizzleInventoryPolicyRepository(db);
  const inventorySyncErrorRepository = new DrizzleInventorySyncErrorRepository(db);
  const stockMovementRepository = new DrizzleStockMovementRepository(db);
  const inventoryBalanceRepository = new DrizzleInventoryBalanceRepository();

  configureInventoryPolicyPort(inventoryPolicyRepository);
  configureInventorySyncErrorPort(inventorySyncErrorRepository);
  configureStockMovementPort(stockMovementRepository);

  return {
    inventoryPolicyRepository,
    inventorySyncErrorRepository,
    stockMovementRepository,
    inventoryBalanceRepository,
  };
};
