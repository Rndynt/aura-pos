import { GetProducts } from '@pos/application/catalog/GetProducts';
import { GetProductById } from '@pos/application/catalog/GetProductById';
import { CheckProductAvailability } from '@pos/application/catalog/CheckProductAvailability';
import { CreateOrUpdateProduct } from '@pos/application/catalog/CreateOrUpdateProduct';
import { ProductRepository } from '@pos/infrastructure/repositories/catalog/ProductRepository';
import { ProductOptionGroupRepository } from '@pos/infrastructure/repositories/catalog/ProductOptionGroupRepository';
import { ProductOptionRepository } from '@pos/infrastructure/repositories/catalog/ProductOptionRepository';
import { TenantRepository } from '@pos/infrastructure/repositories/tenants/TenantRepository';
import { DrizzleInventoryBalanceRepository } from '@pos/infrastructure/repositories/inventory';
import { and, eq, inArray } from 'drizzle-orm';
import { outletProductConfigs } from '@pos/infrastructure/db/schema';
import type { ModuleFactory } from '../types';

export interface CatalogModule {
  getProducts: GetProducts;
  getProductById: GetProductById;
  checkProductAvailability: CheckProductAvailability;
  createOrUpdateProduct: CreateOrUpdateProduct;
  catalogHandlers: {
    listUnavailableOutletProductIds: (outletId: string, productIds: string[]) => Promise<Set<string>>;
  };
}

export const createCatalogModule: ModuleFactory<CatalogModule & { tenantRepository: TenantRepository }> = ({ db, unitOfWork }) => {
  const productRepository = new ProductRepository(db);
  const productOptionGroupRepository = new ProductOptionGroupRepository(db);
  const productOptionRepository = new ProductOptionRepository(db);
  const tenantRepository = new TenantRepository(db);
  const inventoryBalanceRepository = new DrizzleInventoryBalanceRepository();
  const checkProductAvailability = new CheckProductAvailability(productRepository, inventoryBalanceRepository);

  return {
    tenantRepository,
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
    catalogHandlers: {
      listUnavailableOutletProductIds: async (outletId, productIds) => {
        if (productIds.length === 0) return new Set<string>();
        const unavailableRows = await db
          .select({ productId: outletProductConfigs.productId })
          .from(outletProductConfigs)
          .where(
            and(
              eq(outletProductConfigs.outletId, outletId),
              eq(outletProductConfigs.isAvailable, false),
              inArray(outletProductConfigs.productId, productIds),
            ),
          );
        return new Set(unavailableRows.map((row) => row.productId));
      },
    },
  };
};
