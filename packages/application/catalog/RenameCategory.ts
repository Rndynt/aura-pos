import { CategoryRepositoryError, type CategoryRepositoryPort } from './ports/CategoryRepositoryPort';

export type RenameCategoryInput = { tenantId: string; oldName: string; newName: string };

export class RenameCategory {
  constructor(private readonly categories: CategoryRepositoryPort) {}

  async execute(input: RenameCategoryInput): Promise<void> {
    const oldName = input.oldName.trim();
    const newName = input.newName.trim();
    if (!oldName || !newName) throw new CategoryRepositoryError('Category names are required', 'INVALID_CATEGORY_NAME', 400);
    await this.categories.rename(input.tenantId, oldName, newName);
  }
}
