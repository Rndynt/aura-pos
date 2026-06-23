import type { SyncBatchOutput } from './SyncOfflineOrder';
import type { SyncOfflineBatchInput, SyncRepositoryPort } from './ports/SyncRepositoryPort';

export class SyncOfflineBatch {
  constructor(private readonly pushOfflineOrders: { execute(input: SyncOfflineBatchInput): Promise<SyncBatchOutput> }) {}

  async execute(input: SyncOfflineBatchInput): Promise<SyncBatchOutput> {
    return this.pushOfflineOrders.execute(input);
  }
}
