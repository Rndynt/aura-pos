/**
 * Composition-only database boundary for legacy HTTP handlers awaiting full
 * application use-case extraction.
 *
 * HTTP files may import these named bounded-context dependencies from the
 * public API container/composition layer, but must not import Drizzle database
 * or schema modules directly from @pos/infrastructure.
 */
export { db } from '@pos/infrastructure/database';
export {
  tenants,
  outlets,
  userOutletAssignments,
  insertOutletSchema,
  outletProductConfigs,
  productCategories,
  products,
  inventoryBalances,
  inventoryMovements,
} from '@pos/infrastructure/db/schema';
export type { InsertTable } from '@pos/infrastructure/db/schema';
