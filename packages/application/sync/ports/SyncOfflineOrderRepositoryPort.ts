import type { SyncBatchInput, SyncBatchOutput } from '../SyncOfflineOrder';

export interface SyncOfflineOrderRepositoryPort {
  syncOfflineOrder(input: SyncBatchInput): Promise<SyncBatchOutput>;
}
