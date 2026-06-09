/**
 * Pure domain type for a seating table.
 *
 * Must not import Drizzle, Zod, @shared/schema, or @pos/infrastructure.
 * Matches the shape returned by the API and inferred from the DB schema.
 * createdAt/updatedAt are Date | string because API responses may serialize
 * timestamps as ISO strings while Drizzle returns Date objects.
 */
export interface Table {
  id: string;
  tenantId: string;
  outletId: string | null;
  tableNumber: string;
  tableName: string | null;
  floor: string | null;
  capacity: number | null;
  status: string;
  currentOrderId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}
