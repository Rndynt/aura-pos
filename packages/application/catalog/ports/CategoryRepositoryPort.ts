export type ProductCategoryRecord = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ProductCategoryListItem = Pick<ProductCategoryRecord, 'id' | 'name' | 'isActive' | 'displayOrder'>;

export type CreateProductCategoryData = {
  tenantId: string;
  name: string;
  description?: string;
};

export class CategoryRepositoryError extends Error {
  constructor(message: string, public readonly code: string, public readonly statusCode: number) {
    super(message);
    this.name = 'CategoryRepositoryError';
  }
}

export interface CategoryRepositoryPort {
  ensureMasterCategoriesFromLegacyProducts(tenantId: string): Promise<void>;
  listActiveByTenant(tenantId: string): Promise<ProductCategoryListItem[]>;
  create(data: CreateProductCategoryData): Promise<ProductCategoryRecord>;
  rename(tenantId: string, oldName: string, newName: string): Promise<void>;
  deleteByIdOrName(input: { tenantId: string; id?: string; name?: string; fallbackName: string }): Promise<void>;
  reorder(tenantId: string, orderedIds: string[]): Promise<void>;
}
