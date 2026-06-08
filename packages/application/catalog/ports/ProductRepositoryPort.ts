import type { Product } from '@pos/domain/catalog/types';
import type { TransactionContext } from '../../shared/ports/UnitOfWorkPort';

export interface ProductFilters {
  category?: string;
  isActive?: boolean;
  search?: string;
}

export interface ProductDraft extends Omit<Product, 'id' | 'created_at' | 'updated_at'> {
  id?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface ProductRepositoryPort {
  findByTenant(tenantId: string, filters?: ProductFilters, context?: TransactionContext): Promise<Product[]>;
  findById(id: string, tenantId: string, context?: TransactionContext): Promise<Product | null>;
  findByIds(ids: string[], tenantId: string, context?: TransactionContext): Promise<Product[]>;
  create(product: ProductDraft, tenantId: string, context?: TransactionContext): Promise<Product>;
  update(id: string, product: Partial<ProductDraft>, tenantId: string, context?: TransactionContext): Promise<Product>;
  delete(id: string, tenantId: string, context?: TransactionContext): Promise<void>;
}
