import type { Tenant } from '@pos/domain/tenants/types';
import type { TransactionContext } from '../../shared/ports/UnitOfWorkPort';

export interface TenantDraft extends Omit<Tenant, 'id' | 'created_at' | 'updated_at'> {
  id?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface TenantRepositoryPort {
  findById(tenantId: string, context?: TransactionContext): Promise<Tenant | null>;
  findBySlug(slug: string, context?: TransactionContext): Promise<Tenant | null>;
  create(tenant: TenantDraft, context?: TransactionContext): Promise<Tenant>;
  update(tenantId: string, tenant: Partial<TenantDraft>, context?: TransactionContext): Promise<Tenant>;
}
