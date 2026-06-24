import type { KdsRepositoryPort } from './ports/KdsRepositoryPort';

export class ResolveKdsSessionTenant {
  constructor(private readonly repository: KdsRepositoryPort) {}

  async execute(userId: string): Promise<string | null> {
    const row = await this.repository.findSessionTenantByUserId(userId);
    return row?.tenantId ?? null;
  }
}
