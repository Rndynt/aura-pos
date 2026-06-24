import type { KdsDeviceRow, KdsRepositoryPort } from './ports/KdsRepositoryPort';

export class ResolveKdsDeviceByApiKey {
  constructor(private readonly repository: KdsRepositoryPort) {}

  execute(apiKeyHash: string): Promise<KdsDeviceRow | null> {
    return this.repository.findDeviceByApiKeyHash(apiKeyHash);
  }
}
