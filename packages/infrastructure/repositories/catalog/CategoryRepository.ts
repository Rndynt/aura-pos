import { and, asc, eq, sql } from 'drizzle-orm';
import type { Database } from '../../database';
import { productCategories, products } from '@pos/infrastructure/db/schema';
import type {
  CategoryRepositoryPort,
  CreateProductCategoryData,
  ProductCategoryListItem,
  ProductCategoryRecord,
} from '@pos/application/catalog/ports/CategoryRepositoryPort';
import { CategoryRepositoryError } from '@pos/application/catalog/ports/CategoryRepositoryPort';

function mapCategory(row: typeof productCategories.$inferSelect): ProductCategoryRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    displayOrder: row.displayOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class CategoryRepository implements CategoryRepositoryPort {
  constructor(private readonly db: Database) {}

  async ensureMasterCategoriesFromLegacyProducts(tenantId: string): Promise<void> {
    const existing = await this.db
      .select({ id: productCategories.id })
      .from(productCategories)
      .where(eq(productCategories.tenantId, tenantId))
      .limit(1);

    if (existing.length > 0) return;

    const legacy = await this.db
      .selectDistinct({ name: products.category })
      .from(products)
      .where(eq(products.tenantId, tenantId));

    for (const item of legacy) {
      const name = (item.name || '').trim();
      if (!name) continue;
      await this.db.insert(productCategories).values({ tenantId, name }).onConflictDoNothing();
    }
  }

  async listActiveByTenant(tenantId: string): Promise<ProductCategoryListItem[]> {
    return this.db
      .select({
        id: productCategories.id,
        name: productCategories.name,
        isActive: productCategories.isActive,
        displayOrder: productCategories.displayOrder,
      })
      .from(productCategories)
      .where(and(eq(productCategories.tenantId, tenantId), eq(productCategories.isActive, true)))
      .orderBy(asc(productCategories.displayOrder), asc(productCategories.name));
  }

  async create(data: CreateProductCategoryData): Promise<ProductCategoryRecord> {
    const created = await this.db
      .insert(productCategories)
      .values({ tenantId: data.tenantId, name: data.name, description: data.description })
      .onConflictDoNothing()
      .returning();

    if (!created[0]) {
      throw new CategoryRepositoryError('Category already exists', 'CATEGORY_EXISTS', 409);
    }

    return mapCategory(created[0]);
  }

  async rename(tenantId: string, oldName: string, newName: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const updated = await tx
        .update(productCategories)
        .set({ name: newName, updatedAt: new Date() })
        .where(and(eq(productCategories.tenantId, tenantId), eq(productCategories.name, oldName)))
        .returning({ id: productCategories.id });

      if (!updated[0]) {
        throw new CategoryRepositoryError('Category not found', 'CATEGORY_NOT_FOUND', 404);
      }

      await tx
        .update(products)
        .set({ category: newName, updatedAt: new Date() })
        .where(and(eq(products.tenantId, tenantId), eq(products.category, oldName)));
    });
  }

  async deleteByIdOrName(input: { tenantId: string; id?: string; name?: string; fallbackName: string }): Promise<void> {
    await this.db.transaction(async (tx) => {
      let targetName = input.name;

      if (!targetName && input.id) {
        const found = await tx
          .select({ name: productCategories.name })
          .from(productCategories)
          .where(and(eq(productCategories.tenantId, input.tenantId), eq(productCategories.id, input.id)))
          .limit(1);

        if (!found[0]) {
          throw new CategoryRepositoryError('Category not found', 'CATEGORY_NOT_FOUND', 404);
        }

        targetName = found[0].name;
      }

      if (!targetName) {
        throw new CategoryRepositoryError('Category not found', 'CATEGORY_NOT_FOUND', 404);
      }

      await tx
        .update(products)
        .set({ category: input.fallbackName, updatedAt: new Date() })
        .where(and(eq(products.tenantId, input.tenantId), eq(products.category, targetName)));

      const deleted = input.id
        ? await tx
            .delete(productCategories)
            .where(and(eq(productCategories.tenantId, input.tenantId), eq(productCategories.id, input.id)))
            .returning({ id: productCategories.id })
        : await tx
            .delete(productCategories)
            .where(and(eq(productCategories.tenantId, input.tenantId), eq(productCategories.name, targetName)))
            .returning({ id: productCategories.id });

      if (!deleted[0]) {
        throw new CategoryRepositoryError('Category not found', 'CATEGORY_NOT_FOUND', 404);
      }

      await tx.insert(productCategories).values({ tenantId: input.tenantId, name: input.fallbackName }).onConflictDoNothing();
    });
  }

  async reorder(tenantId: string, orderedIds: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: productCategories.id })
        .from(productCategories)
        .where(and(eq(productCategories.tenantId, tenantId), eq(productCategories.isActive, true)));

      const existingIdSet = new Set(existing.map((row) => row.id));
      const submittedIdSet = new Set(orderedIds);

      if (existingIdSet.size !== submittedIdSet.size || [...existingIdSet].some((id) => !submittedIdSet.has(id))) {
        throw new CategoryRepositoryError('Invalid category ordering payload', 'INVALID_CATEGORY_ORDERING', 400);
      }

      const caseClauses = orderedIds.map((id, index) => `WHEN '${id.replace(/'/g, "''")}' THEN ${index}`).join(' ');
      const idList = orderedIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ');

      await tx.execute(sql`
        UPDATE ${productCategories}
        SET "display_order" = CASE "id"::text ${sql.raw(caseClauses)} END,
            "updated_at" = NOW()
        WHERE "tenant_id" = ${tenantId} AND "id"::text IN (${sql.raw(idList)})
      `);
    });
  }
}
