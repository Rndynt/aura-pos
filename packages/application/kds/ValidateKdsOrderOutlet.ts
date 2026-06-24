import type { KdsRepositoryPort } from './ports/KdsRepositoryPort';

export class ValidateKdsOrderOutlet {
  constructor(private readonly repository: KdsRepositoryPort) {}

  execute(input: { orderId: string; tenantId: string; outletId: string }): Promise<boolean> {
    return this.repository.orderBelongsToOutlet(input);
  }
}
