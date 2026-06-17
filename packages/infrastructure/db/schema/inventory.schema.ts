import { sql } from "drizzle-orm";
import { pgTable, text, varchar, uuid, integer, decimal, boolean, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { products } from "./catalog.schema";
import { orders } from "./orders.schema";
import { outlets } from "./outlets.schema";
import { tenants } from "./tenants.schema";

// ── Inventory Movements (append-only ledger) ──────────────────────────────────

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

// ── Inventory Sync Errors / Retry Queue ──────────────────────────────────────

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

// ── Inventory Balances (per-outlet stock balance) ─────────────────────────────
// Operational source of truth for stock across basic and advanced flows.
// Scoped by tenant_id + outlet_id + product_id. Missing rows mean 0 until the
// user sets stock from Stok & Inventaris. products.stock_qty is no longer used
// by stock UI, stock API, sale/return, low stock, set stock, transfer, opname,
// or reports — it remains only as physical catalog schema debt.

export const inventoryBalances = pgTable("inventory_balances", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull().default(0),
  reservedQuantity: integer("reserved_quantity").notNull().default(0),
  lowStockThreshold: integer("low_stock_threshold"),
  lastMovementId: uuid("last_movement_id"),
  lastCountedAt: timestamp("last_counted_at"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  tenantOutletProductUnique: uniqueIndex("inventory_balances_tenant_outlet_product_unique").on(table.tenantId, table.outletId, table.productId),
  tenantIdx: index("inventory_balances_tenant_idx").on(table.tenantId),
  outletIdx: index("inventory_balances_outlet_idx").on(table.outletId),
  productIdx: index("inventory_balances_product_idx").on(table.productId),
  tenantOutletIdx: index("inventory_balances_tenant_outlet_idx").on(table.tenantId, table.outletId),
}));

export const insertInventoryBalanceSchema = createInsertSchema(inventoryBalances).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInventoryBalance = z.infer<typeof insertInventoryBalanceSchema>;
export type InventoryBalance = typeof inventoryBalances.$inferSelect;

// ── Stock Opnames ─────────────────────────────────────────────────────────────

export const stockOpnames = pgTable("stock_opnames", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id, { onDelete: "cascade" }),
  opnameNumber: varchar("opname_number", { length: 50 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  notes: text("notes"),
  startedBy: text("started_by"),
  submittedBy: text("submitted_by"),
  approvedBy: text("approved_by"),
  startedAt: timestamp("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  submittedAt: timestamp("submitted_at"),
  approvedAt: timestamp("approved_at"),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  tenantIdx: index("stock_opnames_tenant_idx").on(table.tenantId),
  outletIdx: index("stock_opnames_outlet_idx").on(table.outletId),
  statusIdx: index("stock_opnames_status_idx").on(table.status),
  tenantNumberUnique: uniqueIndex("stock_opnames_tenant_number_unique").on(table.tenantId, table.opnameNumber),
}));

export const insertStockOpnameSchema = createInsertSchema(stockOpnames).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStockOpname = z.infer<typeof insertStockOpnameSchema>;
export type StockOpname = typeof stockOpnames.$inferSelect;

export const stockOpnameItems = pgTable("stock_opname_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  opnameId: uuid("opname_id").notNull().references(() => stockOpnames.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  systemQuantity: integer("system_quantity").notNull(),
  countedQuantity: integer("counted_quantity").notNull().default(0),
  varianceQuantity: integer("variance_quantity").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  opnameIdx: index("stock_opname_items_opname_idx").on(table.opnameId),
  productIdx: index("stock_opname_items_product_idx").on(table.productId),
  opnameProductUnique: uniqueIndex("stock_opname_items_opname_product_unique").on(table.opnameId, table.productId),
}));

export const insertStockOpnameItemSchema = createInsertSchema(stockOpnameItems).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStockOpnameItem = z.infer<typeof insertStockOpnameItemSchema>;
export type StockOpnameItem = typeof stockOpnameItems.$inferSelect;

// ── Stock Transfers ───────────────────────────────────────────────────────────
// Requires: inventory_advanced_stock + multi_location

export const stockTransfers = pgTable("stock_transfers", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  transferNumber: varchar("transfer_number", { length: 50 }).notNull(),
  fromOutletId: uuid("from_outlet_id").notNull().references(() => outlets.id, { onDelete: "restrict" }),
  toOutletId: uuid("to_outlet_id").notNull().references(() => outlets.id, { onDelete: "restrict" }),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  notes: text("notes"),
  createdBy: text("created_by"),
  submittedBy: text("submitted_by"),
  receivedBy: text("received_by"),
  cancelledBy: text("cancelled_by"),
  submittedAt: timestamp("submitted_at"),
  receivedAt: timestamp("received_at"),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  tenantIdx: index("stock_transfers_tenant_idx").on(table.tenantId),
  fromOutletIdx: index("stock_transfers_from_outlet_idx").on(table.fromOutletId),
  toOutletIdx: index("stock_transfers_to_outlet_idx").on(table.toOutletId),
  statusIdx: index("stock_transfers_status_idx").on(table.status),
  tenantNumberUnique: uniqueIndex("stock_transfers_tenant_number_unique").on(table.tenantId, table.transferNumber),
}));

export const insertStockTransferSchema = createInsertSchema(stockTransfers).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStockTransfer = z.infer<typeof insertStockTransferSchema>;
export type StockTransfer = typeof stockTransfers.$inferSelect;

export const stockTransferItems = pgTable("stock_transfer_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  transferId: uuid("transfer_id").notNull().references(() => stockTransfers.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  transferIdx: index("stock_transfer_items_transfer_idx").on(table.transferId),
  productIdx: index("stock_transfer_items_product_idx").on(table.productId),
}));

export const insertStockTransferItemSchema = createInsertSchema(stockTransferItems).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStockTransferItem = z.infer<typeof insertStockTransferItemSchema>;
export type StockTransferItem = typeof stockTransferItems.$inferSelect;

// ── Low Stock Alerts ──────────────────────────────────────────────────────────

export const inventoryLowStockAlerts = pgTable("inventory_low_stock_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  threshold: integer("threshold").notNull(),
  currentQuantity: integer("current_quantity").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("open"),
  acknowledgedBy: text("acknowledged_by"),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  tenantIdx: index("inventory_low_stock_alerts_tenant_idx").on(table.tenantId),
  outletIdx: index("inventory_low_stock_alerts_outlet_idx").on(table.outletId),
  productIdx: index("inventory_low_stock_alerts_product_idx").on(table.productId),
  statusIdx: index("inventory_low_stock_alerts_status_idx").on(table.status),
}));

export const insertInventoryLowStockAlertSchema = createInsertSchema(inventoryLowStockAlerts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInventoryLowStockAlert = z.infer<typeof insertInventoryLowStockAlertSchema>;
export type InventoryLowStockAlert = typeof inventoryLowStockAlerts.$inferSelect;
