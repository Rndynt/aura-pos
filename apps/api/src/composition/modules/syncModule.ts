import { SyncOfflineOrder } from '@pos/application/sync/SyncOfflineOrder';
import { DrizzleSyncOfflineOrderRepository } from '@pos/infrastructure/repositories/sync/DrizzleSyncOfflineOrderRepository';
import type { ModuleFactory } from '../types';

export interface SyncModule {
  syncOfflineOrder: SyncOfflineOrder;
}

export const createSyncModule: ModuleFactory<SyncModule> = ({ db, unitOfWork }) => ({
  syncOfflineOrder: new SyncOfflineOrder(new DrizzleSyncOfflineOrderRepository(db, unitOfWork)),
});
