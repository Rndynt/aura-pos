import type { CategoryRepositoryPort, ProductCategoryListItem } from './ports/CategoryRepositoryPort';

export type ListCategoriesInput = { tenantId: string };
export type ListCategoriesOutput = { categories: ProductCategoryListItem[] };

export class ListCategories {
  constructor(private readonly categories: CategoryRepositoryPort) {}

  async execute(input: ListCategoriesInput): Promise<ListCategoriesOutput> {
    await this.categories.ensureMasterCategoriesFromLegacyProducts(input.tenantId);
    return { categories: await this.categories.listActiveByTenant(input.tenantId) };
  }
}
