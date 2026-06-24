import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CreateCategory } from '../CreateCategory';
import { DeleteCategory } from '../DeleteCategory';
import { ListCategories } from '../ListCategories';
import { RenameCategory } from '../RenameCategory';
import { ReorderCategories } from '../ReorderCategories';
import { CategoryRepositoryError, type CategoryRepositoryPort, type CreateProductCategoryData, type ProductCategoryListItem, type ProductCategoryRecord } from '../ports/CategoryRepositoryPort';

class InMemoryCategoryRepository implements CategoryRepositoryPort {
  categories: ProductCategoryRecord[] = [];
  products: Array<{ tenantId: string; category: string }> = [];
  private sequence = 1;

  async ensureMasterCategoriesFromLegacyProducts(tenantId: string): Promise<void> {
    if (this.categories.some((category) => category.tenantId === tenantId)) return;
    const uniqueNames = [...new Set(this.products.filter((product) => product.tenantId === tenantId).map((product) => product.category.trim()).filter(Boolean))];
    for (const name of uniqueNames) {
      await this.create({ tenantId, name });
    }
  }

  async listActiveByTenant(tenantId: string): Promise<ProductCategoryListItem[]> {
    return this.categories
      .filter((category) => category.tenantId === tenantId && category.isActive)
      .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name))
      .map(({ id, name, isActive, displayOrder }) => ({ id, name, isActive, displayOrder }));
  }

  async create(data: CreateProductCategoryData): Promise<ProductCategoryRecord> {
    if (this.categories.some((category) => category.tenantId === data.tenantId && category.name === data.name)) {
      throw new CategoryRepositoryError('Category already exists', 'CATEGORY_EXISTS', 409);
    }

    const now = new Date();
    const category: ProductCategoryRecord = {
      id: `cat-${this.sequence++}`,
      tenantId: data.tenantId,
      name: data.name,
      description: data.description ?? null,
      isActive: true,
      displayOrder: this.categories.filter((item) => item.tenantId === data.tenantId).length,
      createdAt: now,
      updatedAt: now,
    };
    this.categories.push(category);
    return category;
  }

  async rename(tenantId: string, oldName: string, newName: string): Promise<void> {
    const category = this.categories.find((item) => item.tenantId === tenantId && item.name === oldName);
    if (!category) throw new CategoryRepositoryError('Category not found', 'CATEGORY_NOT_FOUND', 404);
    category.name = newName;
    this.products.filter((product) => product.tenantId === tenantId && product.category === oldName).forEach((product) => {
      product.category = newName;
    });
  }

  async deleteByIdOrName(input: { tenantId: string; id?: string; name?: string; fallbackName: string }): Promise<void> {
    const index = this.categories.findIndex((category) => category.tenantId === input.tenantId && (input.id ? category.id === input.id : category.name === input.name));
    if (index === -1) throw new CategoryRepositoryError('Category not found', 'CATEGORY_NOT_FOUND', 404);
    const [removed] = this.categories.splice(index, 1);
    this.products.filter((product) => product.tenantId === input.tenantId && product.category === removed.name).forEach((product) => {
      product.category = input.fallbackName;
    });
    if (!this.categories.some((category) => category.tenantId === input.tenantId && category.name === input.fallbackName)) {
      await this.create({ tenantId: input.tenantId, name: input.fallbackName });
    }
  }

  async reorder(tenantId: string, orderedIds: string[]): Promise<void> {
    const active = this.categories.filter((category) => category.tenantId === tenantId && category.isActive);
    const activeIds = new Set(active.map((category) => category.id));
    const submittedIds = new Set(orderedIds);
    if (activeIds.size !== submittedIds.size || [...activeIds].some((id) => !submittedIds.has(id))) {
      throw new CategoryRepositoryError('Invalid category ordering payload', 'INVALID_CATEGORY_ORDERING', 400);
    }
    orderedIds.forEach((id, displayOrder) => {
      const category = this.categories.find((item) => item.tenantId === tenantId && item.id === id)!;
      category.displayOrder = displayOrder;
    });
  }
}

test('lists only tenant-scoped categories and bootstraps legacy product categories explicitly', async () => {
  const repo = new InMemoryCategoryRepository();
  repo.products.push(
    { tenantId: 'tenant-a', category: 'Coffee' },
    { tenantId: 'tenant-a', category: 'Food' },
    { tenantId: 'tenant-b', category: 'Retail' },
  );

  const result = await new ListCategories(repo).execute({ tenantId: 'tenant-a' });

  assert.deepEqual(result.categories.map((category) => category.name), ['Coffee', 'Food']);
  assert.equal(repo.categories.some((category) => category.tenantId === 'tenant-b'), false);
});

test('creates categories under the requested tenant only', async () => {
  const repo = new InMemoryCategoryRepository();
  const created = await new CreateCategory(repo).execute({ tenantId: 'tenant-a', name: ' Drinks ' });

  assert.equal(created.name, 'Drinks');
  assert.equal(created.tenantId, 'tenant-a');
  assert.equal((await repo.listActiveByTenant('tenant-b')).length, 0);
});

test('renames only matching tenant category and legacy product category values', async () => {
  const repo = new InMemoryCategoryRepository();
  await repo.create({ tenantId: 'tenant-a', name: 'Coffee' });
  await repo.create({ tenantId: 'tenant-b', name: 'Coffee' });
  repo.products.push({ tenantId: 'tenant-a', category: 'Coffee' }, { tenantId: 'tenant-b', category: 'Coffee' });

  await new RenameCategory(repo).execute({ tenantId: 'tenant-a', oldName: 'Coffee', newName: 'Beverage' });

  assert.deepEqual((await repo.listActiveByTenant('tenant-a')).map((category) => category.name), ['Beverage']);
  assert.deepEqual((await repo.listActiveByTenant('tenant-b')).map((category) => category.name), ['Coffee']);
  assert.deepEqual(repo.products, [{ tenantId: 'tenant-a', category: 'Beverage' }, { tenantId: 'tenant-b', category: 'Coffee' }]);
});

test('deletes tenant category by id and moves products to tenant-scoped fallback', async () => {
  const repo = new InMemoryCategoryRepository();
  const target = await repo.create({ tenantId: 'tenant-a', name: 'Snack' });
  await repo.create({ tenantId: 'tenant-b', name: 'Snack' });
  repo.products.push({ tenantId: 'tenant-a', category: 'Snack' }, { tenantId: 'tenant-b', category: 'Snack' });

  await new DeleteCategory(repo).execute({ tenantId: 'tenant-a', id: target.id, fallbackName: 'General' });

  assert.deepEqual((await repo.listActiveByTenant('tenant-a')).map((category) => category.name), ['General']);
  assert.deepEqual((await repo.listActiveByTenant('tenant-b')).map((category) => category.name), ['Snack']);
  assert.deepEqual(repo.products, [{ tenantId: 'tenant-a', category: 'General' }, { tenantId: 'tenant-b', category: 'Snack' }]);
});

test('reorders only when submitted ids exactly match active tenant categories', async () => {
  const repo = new InMemoryCategoryRepository();
  const first = await repo.create({ tenantId: 'tenant-a', name: 'First' });
  const second = await repo.create({ tenantId: 'tenant-a', name: 'Second' });
  const otherTenant = await repo.create({ tenantId: 'tenant-b', name: 'Other' });

  await new ReorderCategories(repo).execute({ tenantId: 'tenant-a', orderedIds: [second.id, first.id] });

  assert.deepEqual((await repo.listActiveByTenant('tenant-a')).map((category) => category.name), ['Second', 'First']);
  await assert.rejects(
    () => new ReorderCategories(repo).execute({ tenantId: 'tenant-a', orderedIds: [second.id, first.id, otherTenant.id] }),
    /Invalid category ordering payload/,
  );
});
