import { sql } from "drizzle-orm";
import { pgTable, text, varchar, uuid, integer, decimal, boolean, timestamp, date, json, jsonb, index, uniqueIndex, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { products } from "./catalog.schema";
import { orders } from "./orders.schema";
import { outlets } from "./outlets.schema";
import { tenants } from "./tenants.schema";

export const inventoryMovements = pgTable("inventory_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "set null" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
  paymentId: uuid("payment_id"),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: text("reference_id"),
  metadata: jsonb("metadata"),
  terminalId: varchar("terminal_id", { length: 255 }),
  movementType: varchar("movement_type", { length: 30 }).notNull(),
  quantityDelta: integer("quantity_delta").notNull(),
  quantityBefore: integer("quantity_before"),
  quantityAfter: integer("quantity_after"),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }),
  notes: text("notes"),
  actorId: varchar("actor_id", { length: 255 }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  tenantIdx: index("inventory_movements_tenant_idx").on(table.tenantId),
  outletIdx: index("inventory_movements_outlet_idx").on(table.outletId),
  productIdx: index("inventory_movements_product_idx").on(table.productId),
  orderIdx: index("inventory_movements_order_idx").on(table.orderId),
  paymentIdx: index("inventory_movements_payment_idx").on(table.paymentId),
  referenceIdx: index("inventory_movements_reference_idx").on(table.referenceType, table.referenceId),
  orderProductMovementUnique: uniqueIndex("inventory_movements_order_product_movement_unique")
    .on(table.orderId, table.productId, table.movementType)
    .where(sql`${table.orderId} IS NOT NULL`),
}));

export const insertInventoryMovementSchema = createInsertSchema(inventoryMovements).omit({ id: true, createdAt: true });
export type InsertInventoryMovement = z.infer<typeof insertInventoryMovementSchema>;
export type InventoryMovement = typeof inventoryMovements.$inferSelect;

// ── Durable Inventory Sync Errors / Retry Queue ──────────────────────────────

export const inventorySyncErrors = pgTable("inventory_sync_errors", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "set null" }),
  orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  operation: varchar("operation", { length: 40 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  payload: jsonb("payload").notNull(),
  lastError: text("last_error").notNull(),
  retryCount: integer("retry_count").notNull().default(0),
  nextRetryAt: timestamp("next_retry_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  tenantIdx: index("inventory_sync_errors_tenant_idx").on(table.tenantId),
  statusNextRetryIdx: index("inventory_sync_errors_status_next_retry_idx").on(table.status, table.nextRetryAt),
  orderIdx: index("inventory_sync_errors_order_idx").on(table.orderId),
  productIdx: index("inventory_sync_errors_product_idx").on(table.productId),
}));

export const insertInventorySyncErrorSchema = createInsertSchema(inventorySyncErrors).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInventorySyncError = z.infer<typeof insertInventorySyncErrorSchema>;
export type InventorySyncError = typeof inventorySyncErrors.$inferSelect;
