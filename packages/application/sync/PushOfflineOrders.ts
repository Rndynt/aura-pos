import type { SyncBatchOutput } from './SyncOfflineOrder';
import type { PushOfflineOrdersInput, SyncRepositoryPort } from './ports/SyncRepositoryPort';

export class PushOfflineOrders {
  constructor(private readonly repository: SyncRepositoryPort) {}

  async execute(input: PushOfflineOrdersInput): Promise<SyncBatchOutput> {
    if (input.actor?.kind === 'cashier_session' && !input.actor.cashier_user_id) {
      throw new Error('Cashier session actor requires cashier_user_id');
    }

    if (input.actor?.kind === 'terminal_token' && !input.actor.terminal_token_id) {
      throw new Error('Terminal token actor requires terminal_token_id');
    }

    return this.repository.pushOfflineOrders(input);
  }
}
