/**
 * Catalog Application Services
 * Public API for catalog use cases
 */

export { GetProducts } from './GetProducts';
export type { 
  GetProductsInput, 
  GetProductsOutput, 
  ProductWithOptions,
  IProductRepository as IProductRepositoryForGetProducts
} from './GetProducts';

export { GetProductById } from './GetProductById';
export type { 
  GetProductByIdInput, 
  GetProductByIdOutput, 
  ProductWithFullDetails,
  IProductRepository as IProductRepositoryForGetProductById
} from './GetProductById';

export { CheckProductAvailability } from './CheckProductAvailability';
export type { 
  CheckProductAvailabilityInput, 
  CheckProductAvailabilityOutput,
  IProductRepository as IProductRepositoryForCheckAvailability
} from './CheckProductAvailability';

export { CreateOrUpdateProduct } from './CreateOrUpdateProduct';
export type {
  CreateOrUpdateProductInput,
  CreateOrUpdateProductOutput,
  CreateOrUpdateProductOptionInput,
  CreateOrUpdateProductOptionGroupInput,
  IProductRepository as IProductRepositoryForCreateOrUpdate,
  IProductOptionGroupRepository as IProductOptionGroupRepositoryForCreateOrUpdate,
  IProductOptionRepository as IProductOptionRepositoryForCreateOrUpdate,
  ITenantRepository as ITenantRepositoryForCreateOrUpdate
} from './CreateOrUpdateProduct';

export {
  calculateSelectedOptionsDelta,
  flattenSelectedOptions,
} from './pricing';
export type { ProductDraft, ProductFilters, ProductRepositoryPort } from './ports';

export { ListCategories } from './ListCategories';
export type { ListCategoriesInput, ListCategoriesOutput } from './ListCategories';
export { CreateCategory } from './CreateCategory';
export type { CreateCategoryInput, CreateCategoryOutput } from './CreateCategory';
export { RenameCategory } from './RenameCategory';
export type { RenameCategoryInput } from './RenameCategory';
export { DeleteCategory } from './DeleteCategory';
export type { DeleteCategoryInput } from './DeleteCategory';
export { ReorderCategories } from './ReorderCategories';
export type { ReorderCategoriesInput } from './ReorderCategories';
export type { CategoryRepositoryPort, ProductCategoryRecord, ProductCategoryListItem, CreateProductCategoryData } from './ports/CategoryRepositoryPort';
export { CategoryRepositoryError } from './ports/CategoryRepositoryPort';
