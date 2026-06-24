import { CategoryRepositoryError, type CategoryRepositoryPort, type ProductCategoryRecord } from './ports/CategoryRepositoryPort';

export type CreateCategoryInput = { tenantId: string; name: string; description?: string };
export type CreateCategoryOutput = ProductCategoryRecord;

export class CreateCategory {
  constructor(private readonly categories: CategoryRepositoryPort) {}

  async execute(input: CreateCategoryInput): Promise<CreateCategoryOutput> {
    const name = input.name.trim();
    if (!name) throw new CategoryRepositoryError('Category name is required', 'INVALID_CATEGORY_NAME', 400);
    return this.categories.create({ tenantId: input.tenantId, name, description: input.description });
  }
}
