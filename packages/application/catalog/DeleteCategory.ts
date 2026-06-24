import { CategoryRepositoryError, type CategoryRepositoryPort } from './ports/CategoryRepositoryPort';

export type DeleteCategoryInput = { tenantId: string; id?: string; name?: string; fallbackName: string };

export class DeleteCategory {
  constructor(private readonly categories: CategoryRepositoryPort) {}

  async execute(input: DeleteCategoryInput): Promise<void> {
    const name = input.name?.trim();
    const fallbackName = input.fallbackName.trim();
    if (!input.id && !name) throw new CategoryRepositoryError('id or name is required', 'INVALID_CATEGORY_TARGET', 400);
    if (!fallbackName) throw new CategoryRepositoryError('Fallback category name is required', 'INVALID_FALLBACK_CATEGORY', 400);
    await this.categories.deleteByIdOrName({ tenantId: input.tenantId, id: input.id, name, fallbackName });
  }
}
