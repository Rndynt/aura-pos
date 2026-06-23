import { PullTenantChanges, PushOfflineOrders, SyncOfflineBatch, SyncOfflineOrder } from '@pos/application/sync';
import { DrizzleSyncOfflineOrderRepository } from '@pos/infrastructure/repositories/sync/DrizzleSyncOfflineOrderRepository';
import type { ModuleFactory } from '../types';

export interface SyncModule {
  syncOfflineOrder: SyncOfflineOrder;
  pushOfflineOrders: PushOfflineOrders;
  syncOfflineBatch: SyncOfflineBatch;
  pullTenantChanges: PullTenantChanges;
}

export const createSyncModule: ModuleFactory<SyncModule> = ({ db, unitOfWork }) => {
  const syncRepository = new DrizzleSyncOfflineOrderRepository(db, unitOfWork);
  const pushOfflineOrders = new PushOfflineOrders(syncRepository);

  return {
    syncOfflineOrder: new SyncOfflineOrder(syncRepository),
    pushOfflineOrders,
    syncOfflineBatch: new SyncOfflineBatch(pushOfflineOrders),
    pullTenantChanges: new PullTenantChanges(syncRepository),
  };
};
