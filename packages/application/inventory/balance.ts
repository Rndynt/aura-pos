import type { TransactionContext } from '../shared/ports/UnitOfWorkPort';
import type { InventoryBalanceRecord, InventoryBalanceRepositoryPort } from './ports/InventoryBalanceRepositoryPort';

export interface TrackedProductStockRecord {
  id: string;
  tenantId: string;
  stockTrackingEnabled: boolean;
}

export interface ProductStockReaderPort {
  getTrackedProductStock(
    tenantId: string,
    productId: string,
    ctx?: TransactionContext,
  ): Promise<TrackedProductStockRecord | null>;

  listTrackedProductStocks(
    tenantId: string,
    ctx?: TransactionContext,
  ): Promise<TrackedProductStockRecord[]>;
}

export interface OutletContextPort {
  isDefaultOutlet(tenantId: string, outletId: string, ctx?: TransactionContext): Promise<boolean>;
}

export interface EnsureBalanceDeps {
  balanceRepo: InventoryBalanceRepositoryPort;
  productReader: ProductStockReaderPort;
  outletContext: OutletContextPort;
}

export interface EnsureBalanceInput {
  tenantId: string;
  outletId: string;
  productId: string;
}

export async function getInitialBalanceQuantity(
  { productReader }: Pick<EnsureBalanceDeps, 'productReader'>,
  input: EnsureBalanceInput,
  ctx?: TransactionContext,
): Promise<number> {
  const product = await productReader.getTrackedProductStock(input.tenantId, input.productId, ctx);
  if (!product || !product.stockTrackingEnabled) {
    throw new Error('Produk tidak ditemukan atau tidak menggunakan tracking stok');
  }

  return 0;
}

export async function ensureProductBalanceForOutlet(
  deps: EnsureBalanceDeps,
  input: EnsureBalanceInput,
  ctx?: TransactionContext,
): Promise<InventoryBalanceRecord> {
  const existing = await deps.balanceRepo.getBalance(input.tenantId, input.outletId, input.productId, ctx);
  if (existing) return existing;

  const quantity = await getInitialBalanceQuantity(deps, input, ctx);
  return deps.balanceRepo.setQuantity({ ...input, quantity }, ctx);
}

export async function ensureTrackedProductBalancesForOutlet(
  deps: EnsureBalanceDeps,
  input: { tenantId: string; outletId: string },
  ctx?: TransactionContext,
): Promise<Map<string, InventoryBalanceRecord>> {
  const products = await deps.productReader.listTrackedProductStocks(input.tenantId, ctx);
  const balances = new Map<string, InventoryBalanceRecord>();
  for (const product of products) {
    const balance = await ensureProductBalanceForOutlet(deps, {
      tenantId: input.tenantId,
      outletId: input.outletId,
      productId: product.id,
    }, ctx);
    balances.set(product.id, balance);
  }
  return balances;
}
