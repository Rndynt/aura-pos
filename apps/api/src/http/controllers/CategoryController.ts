import { Request, Response } from 'express';
import { z } from 'zod';
import {
  CategoryRepositoryError,
  CreateCategory,
  DeleteCategory,
  ListCategories,
  RenameCategory,
  ReorderCategories,
} from '@pos/application/catalog';
import { CategoryRepository } from '@pos/infrastructure/repositories/catalog/CategoryRepository';
import { db } from '../../composition/modules/httpApplicationBoundaryModule';
import { asyncHandler, createError } from '../middleware/errorHandler';

const categoryRepository = new CategoryRepository(db);
const listCategoriesUseCase = new ListCategories(categoryRepository);
const createCategoryUseCase = new CreateCategory(categoryRepository);
const renameCategoryUseCase = new RenameCategory(categoryRepository);
const deleteCategoryUseCase = new DeleteCategory(categoryRepository);
const reorderCategoriesUseCase = new ReorderCategories(categoryRepository);

function toApiError(error: unknown): never {
  if (error instanceof CategoryRepositoryError) {
    throw createError(error.message, error.statusCode, error.code);
  }
  throw error;
}

export const listCategories = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;

  try {
    const result = await listCategoriesUseCase.execute({ tenantId });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    toApiError(error);
  }
});

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const body = z.object({ name: z.string().min(1), description: z.string().optional() }).parse(req.body);

  try {
    const created = await createCategoryUseCase.execute({ tenantId, name: body.name, description: body.description });
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    toApiError(error);
  }
});

export const renameCategory = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const body = z.object({ old_name: z.string().min(1), new_name: z.string().min(1) }).parse(req.body);

  try {
    await renameCategoryUseCase.execute({ tenantId, oldName: body.old_name, newName: body.new_name });
    res.status(200).json({ success: true });
  } catch (error) {
    toApiError(error);
  }
});

export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const body = z
    .object({ id: z.string().optional(), name: z.string().optional(), fallback_name: z.string().min(1) })
    .refine((value) => value.id || value.name, { message: 'id or name is required' })
    .parse(req.body);

  try {
    await deleteCategoryUseCase.execute({
      tenantId,
      id: body.id,
      name: body.name,
      fallbackName: body.fallback_name,
    });
    res.status(200).json({ success: true });
  } catch (error) {
    toApiError(error);
  }
});

export const reorderCategories = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const body = z.object({ ordered_ids: z.array(z.string().min(1)).min(1) }).parse(req.body);

  try {
    await reorderCategoriesUseCase.execute({ tenantId, orderedIds: body.ordered_ids });
    res.status(200).json({ success: true });
  } catch (error) {
    toApiError(error);
  }
});
