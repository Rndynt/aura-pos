import { GetProducts } from '@pos/application/catalog/GetProducts';
import { GetProductById } from '@pos/application/catalog/GetProductById';
import { CheckProductAvailability } from '@pos/application/catalog/CheckProductAvailability';
import { CreateOrUpdateProduct } from '@pos/application/catalog/CreateOrUpdateProduct';
import { ProductRepository } from '@pos/infrastructure/repositories/catalog/ProductRepository';
import { ProductOptionGroupRepository } from '@pos/infrastructure/repositories/catalog/ProductOptionGroupRepository';
import { ProductOptionRepository } from '@pos/infrastructure/repositories/catalog/ProductOptionRepository';
import { TenantRepository } from '@pos/infrastructure/repositories/tenants/TenantRepository';
import { DrizzleInventoryBalanceRepository } from '@pos/infrastructure/repositories/inventory';
import type { ModuleFactory } from '../types';

export interface CatalogModule {
  productRepository: ProductRepository;
  productOptionGroupRepository: ProductOptionGroupRepository;
  productOptionRepository: ProductOptionRepository;
  inventoryBalanceRepository: DrizzleInventoryBalanceRepository;
  getProducts: GetProducts;
  getProductById: GetProductById;
  checkProductAvailability: CheckProductAvailability;
  createOrUpdateProduct: CreateOrUpdateProduct;
}

export const createCatalogModule: ModuleFactory<CatalogModule & { tenantRepository: TenantRepository }> = ({ db, unitOfWork }) => {
  const productRepository = new ProductRepository(db);
  const productOptionGroupRepository = new ProductOptionGroupRepository(db);
  const productOptionRepository = new ProductOptionRepository(db);
  const tenantRepository = new TenantRepository(db);
  const inventoryBalanceRepository = new DrizzleInventoryBalanceRepository();
  const checkProductAvailability = new CheckProductAvailability(productRepository, inventoryBalanceRepository);

  return {
    productRepository,
    productOptionGroupRepository,
    productOptionRepository,
    tenantRepository,
    inventoryBalanceRepository,
    getProducts: new GetProducts(productRepository),
    getProductById: new GetProductById(productRepository),
    checkProductAvailability,
    createOrUpdateProduct: new CreateOrUpdateProduct(
      unitOfWork,
      productRepository,
      productOptionGroupRepository,
      productOptionRepository,
      tenantRepository,
    ),
  };
};
