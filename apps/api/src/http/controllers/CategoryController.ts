import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '@pos/infrastructure/database';
import { productCategories, products } from '@shared/schema';
import { and, eq, asc, sql } from 'drizzle-orm';
import { asyncHandler, createError } from '../middleware/errorHandler';

export const listCategories = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;

  // bootstrap from legacy product.category values if master table still empty
  const existing = await db.select({ id: productCategories.id }).from(productCategories).where(eq(productCategories.tenantId, tenantId)).limit(1);
  if (existing.length === 0) {
    const legacy = await db.selectDistinct({ name: products.category }).from(products).where(eq(products.tenantId, tenantId));
    for (const item of legacy) {
      const name = (item.name || '').trim();
      if (!name) continue;
      await db.insert(productCategories).values({ tenantId, name }).onConflictDoNothing();
    }
  }

  const categories = await db
    .select({ id: productCategories.id, name: productCategories.name, is_active: productCategories.isActive, display_order: productCategories.displayOrder })
    .from(productCategories)
    .where(and(eq(productCategories.tenantId, tenantId), eq(productCategories.isActive, true)))
    .orderBy(asc(productCategories.displayOrder), asc(productCategories.name));

  res.status(200).json({ success: true, data: { categories } });
});

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const body = z.object({ name: z.string().min(1), description: z.string().optional() }).parse(req.body);
  const created = await db.insert(productCategories).values({ tenantId, name: body.name.trim(), description: body.description }).onConflictDoNothing().returning();
  if (created.length === 0) throw createError('Category already exists', 409, 'CATEGORY_EXISTS');
  res.status(201).json({ success: true, data: created[0] });
});

export const renameCategory = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const body = z.object({ old_name: z.string().min(1), new_name: z.string().min(1) }).parse(req.body);
  const oldName = body.old_name.trim();
  const newName = body.new_name.trim();

  await db.transaction(async (tx) => {
    await tx.update(productCategories)
      .set({ name: newName, updatedAt: new Date() })
      .where(and(eq(productCategories.tenantId, tenantId), eq(productCategories.name, oldName)));

    await tx.update(products)
      .set({ category: newName, updatedAt: new Date() })
      .where(and(eq(products.tenantId, tenantId), eq(products.category, oldName)));
  });

  res.status(200).json({ success: true });
});

export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const body = z.object({ id: z.string().optional(), name: z.string().optional(), fallback_name: z.string().min(1) }).refine(v => v.id || v.name, { message: 'id or name is required' }).parse(req.body);
  const fallback = body.fallback_name.trim();

  const target = body.name?.trim() || null;

  await db.transaction(async (tx) => {
    if (target) {
      await tx.update(products).set({ category: fallback, updatedAt: new Date() }).where(and(eq(products.tenantId, tenantId), eq(products.category, target)));
      await tx.delete(productCategories).where(and(eq(productCategories.tenantId, tenantId), eq(productCategories.name, target)));
    } else if (body.id) {
      const found = await tx.select({ name: productCategories.name }).from(productCategories).where(and(eq(productCategories.tenantId, tenantId), eq(productCategories.id, body.id))).limit(1);
      if (!found[0]) throw createError('Category not found', 404, 'CATEGORY_NOT_FOUND');
      await tx.update(products).set({ category: fallback, updatedAt: new Date() }).where(and(eq(products.tenantId, tenantId), eq(products.category, found[0].name)));
      await tx.delete(productCategories).where(and(eq(productCategories.tenantId, tenantId), eq(productCategories.id, body.id)));
    }

    await tx.insert(productCategories).values({ tenantId, name: fallback }).onConflictDoNothing();
  });

  res.status(200).json({ success: true });
});

export const reorderCategories = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const body = z.object({ ordered_ids: z.array(z.string().min(1)).min(1) }).parse(req.body);

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: productCategories.id })
      .from(productCategories)
      .where(and(eq(productCategories.tenantId, tenantId), eq(productCategories.isActive, true)));

    const existingIdSet = new Set(existing.map((row) => row.id));
    const submittedIdSet = new Set(body.ordered_ids);

    if (existingIdSet.size !== submittedIdSet.size || [...existingIdSet].some((id) => !submittedIdSet.has(id))) {
      throw createError('Invalid category ordering payload', 400, 'INVALID_CATEGORY_ORDERING');
    }

    // Batch update using CASE WHEN — single query instead of N individual updates
    if (body.ordered_ids.length > 0) {
      const caseClauses = body.ordered_ids
        .map((id, i) => `WHEN '${id.replace(/'/g, "''")}' THEN ${i}`)
        .join(' ');
      const idList = body.ordered_ids.map(id => `'${id.replace(/'/g, "''")}'`).join(', ');
      await tx.execute(sql`
        UPDATE ${productCategories}
        SET "display_order" = CASE "id"::text ${sql.raw(caseClauses)} END,
            "updated_at" = NOW()
        WHERE "tenant_id" = ${tenantId} AND "id"::text IN (${sql.raw(idList)})
      `);
    }
  });

  res.status(200).json({ success: true });
});
