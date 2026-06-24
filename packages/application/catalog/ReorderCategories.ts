import { CategoryRepositoryError, type CategoryRepositoryPort } from './ports/CategoryRepositoryPort';

export type ReorderCategoriesInput = { tenantId: string; orderedIds: string[] };

export class ReorderCategories {
  constructor(private readonly categories: CategoryRepositoryPort) {}

  async execute(input: ReorderCategoriesInput): Promise<void> {
    if (input.orderedIds.length === 0 || new Set(input.orderedIds).size !== input.orderedIds.length) {
      throw new CategoryRepositoryError('Invalid category ordering payload', 'INVALID_CATEGORY_ORDERING', 400);
    }
    await this.categories.reorder(input.tenantId, input.orderedIds);
  }
}
