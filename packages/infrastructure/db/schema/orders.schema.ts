import { sql } from "drizzle-orm";
import { pgTable, text, varchar, uuid, integer, decimal, boolean, timestamp, date, json, jsonb, index, uniqueIndex, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { products } from "./catalog.schema";
import { tables } from "./seating.schema";
import { outlets } from "./outlets.schema";
import { tenants } from "./tenants.schema";

export const orderTypes = pgTable("order_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  isOnPremise: boolean("is_on_premise").notNull().default(false),
  needTableNumber: boolean("need_table_number").notNull().default(false),
  needAddress: boolean("need_address").notNull().default(false),
  allowScheduled: boolean("allow_scheduled").notNull().default(false),
  isDigitalProduct: boolean("is_digital_product").notNull().default(false),
  affectsServiceCharge: boolean("affects_service_charge").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  codeIdx: index("order_types_code_idx").on(table.code),
}));

export const insertOrderTypeSchema = createInsertSchema(orderTypes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectOrderTypeSchema = createSelectSchema(orderTypes);
export type InsertOrderType = z.infer<typeof insertOrderTypeSchema>;
export type OrderType = typeof orderTypes.$inferSelect;

// outlet_id nullable — NULL means applies to all outlets of that tenant
export const tenantOrderTypes = pgTable("tenant_order_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "cascade" }),
  orderTypeId: uuid("order_type_id").notNull().references(() => orderTypes.id, { onDelete: "cascade" }),
  isEnabled: boolean("is_enabled").notNull().default(true),
  config: json("config"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  tenantIdx: index("tenant_order_types_tenant_idx").on(table.tenantId),
  outletIdx: index("tenant_order_types_outlet_idx").on(table.outletId),
  orderTypeIdx: index("tenant_order_types_order_type_idx").on(table.orderTypeId),
}));

export const insertTenantOrderTypeSchema = createInsertSchema(tenantOrderTypes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  config: z.record(z.any()).nullable().optional(),
});

export const selectTenantOrderTypeSchema = createSelectSchema(tenantOrderTypes);
export type InsertTenantOrderType = z.infer<typeof insertTenantOrderTypeSchema>;
export type TenantOrderType = typeof tenantOrderTypes.$inferSelect;


export const orderNumberSequences = pgTable("order_number_sequences", {
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  businessDate: date("business_date").notNull(),
  lastSeq: integer("last_seq").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  pk: primaryKey({ name: "order_number_sequences_tenant_id_business_date_pk", columns: [table.tenantId, table.businessDate] }),
  tenantIdx: index("order_number_sequences_tenant_idx").on(table.tenantId),
}));

export type OrderNumberSequence = typeof orderNumberSequences.$inferSelect;
export type InsertOrderNumberSequence = typeof orderNumberSequences.$inferInsert;

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "cascade" }),
  orderTypeId: uuid("order_type_id").references(() => orderTypes.id),
  salesChannel: varchar("sales_channel", { length: 50 }),
  orderNumber: text("order_number").notNull(),
  orderDate: timestamp("order_date").notNull().default(sql`CURRENT_TIMESTAMP`),
  status: varchar("status", { length: 50 }).notNull().default("draft"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  serviceCharge: decimal("service_charge", { precision: 10, scale: 2 }).notNull().default("0"),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).notNull().default("0"),
  paidAmount: decimal("paid_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  paymentStatus: varchar("payment_status", { length: 50 }).notNull().default("unpaid"),
  customerName: text("customer_name"),
  tableNumber: text("table_number"),
  notes: text("notes"),
  idempotencyKey: varchar("idempotency_key", { length: 128 }),
  closedAt: timestamp("closed_at"),
  cancellationReason: text("cancellation_reason"),
  sourceTerminalId: varchar("source_terminal_id", { length: 128 }),
  clientCreatedAt: timestamp("client_created_at"),
  localOrderId: varchar("local_order_id", { length: 128 }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  tenantIdx: index("orders_tenant_idx").on(table.tenantId),
  outletIdx: index("orders_outlet_idx").on(table.outletId),
  orderTypeIdx: index("orders_order_type_idx").on(table.orderTypeId),
  salesChannelIdx: index("orders_sales_channel_idx").on(table.salesChannel),
  orderNumberIdx: index("orders_order_number_idx").on(table.orderNumber),
  statusIdx: index("orders_status_idx").on(table.status),
  orderDateIdx: index("orders_order_date_idx").on(table.orderDate),
  tenantIdempotencyUnique: uniqueIndex("orders_tenant_idempotency_unique")
    .on(table.tenantId, table.idempotencyKey)
    .where(sql`${table.idempotencyKey} IS NOT NULL`),
  tenantOrderNumberUnique: uniqueIndex("orders_tenant_order_number_unique").on(table.tenantId, table.orderNumber),
  sourceTerminalLocalOrderIdx: index("orders_source_terminal_local_order_idx").on(table.sourceTerminalId, table.localOrderId),
  // Composite indexes for common query patterns
  tenantStatusDateIdx: index("orders_tenant_status_date_idx").on(table.tenantId, table.status, table.orderDate),
  tenantOutletStatusDateDescIdx: index("orders_tenant_outlet_status_order_date_desc_idx")
    .on(table.tenantId, table.outletId, table.status, table.orderDate.desc()),
  tenantOutletOrderDateDescIdx: index("orders_tenant_outlet_order_date_desc_idx")
    .on(table.tenantId, table.outletId, table.orderDate.desc()),
  tenantPaymentStatusIdx: index("orders_tenant_payment_status_idx").on(table.tenantId, table.paymentStatus),
}));

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  status: z.enum(["draft", "confirmed", "preparing", "ready", "served", "completed", "cancelled"]).default("draft"),
  paymentStatus: z.enum(["paid", "partial", "unpaid"]).default("unpaid"),
  salesChannel: z.enum(["POS", "WHATSAPP", "WEBSITE", "MARKETPLACE", "GOFOOD", "GRABFOOD", "PHONE", "OTHER"]).optional(),
});

export const selectOrderSchema = createSelectSchema(orders);
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id),
  productName: text("product_name").notNull(),
  variantId: uuid("variant_id"),
  variantName: text("variant_name"),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  itemSubtotal: decimal("item_subtotal", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  orderIdx: index("order_items_order_idx").on(table.orderId),
  productIdx: index("order_items_product_idx").on(table.productId),
}));

export const insertOrderItemSchema = createInsertSchema(orderItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  status: z.enum(["pending", "preparing", "ready", "delivered"]).default("pending"),
});

export const selectOrderItemSchema = createSelectSchema(orderItems);
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItems.$inferSelect;

export const orderItemModifiers = pgTable("order_item_modifiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderItemId: uuid("order_item_id").notNull().references(() => orderItems.id, { onDelete: "cascade" }),
  optionGroupId: uuid("option_group_id").notNull(),
  optionGroupName: text("option_group_name").notNull(),
  optionId: uuid("option_id").notNull(),
  optionName: text("option_name").notNull(),
  priceDelta: decimal("price_delta", { precision: 10, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  orderItemIdx: index("order_item_modifiers_order_item_idx").on(table.orderItemId),
}));

export const insertOrderItemModifierSchema = createInsertSchema(orderItemModifiers).omit({
  id: true,
  createdAt: true,
});

export const selectOrderItemModifierSchema = createSelectSchema(orderItemModifiers);
export type InsertOrderItemModifier = z.infer<typeof insertOrderItemModifierSchema>;
export type OrderItemModifier = typeof orderItemModifiers.$inferSelect;

export const orderPayments = pgTable("order_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "set null" }),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  paymentFlow: varchar("payment_flow", { length: 50 }).notNull().default("FULL"),
  paymentKind: varchar("payment_kind", { length: 50 }).notNull().default("FULL_PAYMENT"),
  paymentMethod: varchar("payment_method", { length: 50 }).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  receivedAmount: decimal("received_amount", { precision: 10, scale: 2 }),
  changeAmount: decimal("change_amount", { precision: 10, scale: 2 }),
  status: varchar("status", { length: 50 }).notNull().default("succeeded"),
  splitId: uuid("split_id"),
  sequence: integer("sequence").notNull().default(1),
  paymentDate: timestamp("payment_date").notNull().default(sql`CURRENT_TIMESTAMP`),
  referenceNumber: text("reference_number"),
  referenceNote: text("reference_note"),
  notes: text("notes"),
  metadata: jsonb("metadata"),
  idempotencyKey: varchar("idempotency_key", { length: 128 }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  tenantIdx: index("order_payments_tenant_idx").on(table.tenantId),
  orderIdx: index("order_payments_order_idx").on(table.orderId),
  splitIdx: index("order_payments_split_idx").on(table.splitId),
  paymentDateIdx: index("order_payments_payment_date_idx").on(table.paymentDate),
  orderIdempotencyUnique: uniqueIndex("order_payments_order_id_idempotency_unique")
    .on(table.orderId, table.idempotencyKey)
    .where(sql`${table.idempotencyKey} IS NOT NULL`),
}));

export const insertOrderPaymentSchema = createInsertSchema(orderPayments).omit({
  id: true,
  createdAt: true,
}).extend({
  paymentMethod: z.enum(["CASH", "MANUAL_TRANSFER", "MANUAL_QRIS"]),
  paymentFlow: z.enum(["FULL", "DOWN_PAYMENT", "MULTI_PAYMENT", "SPLIT_BILL"]).default("FULL"),
  paymentKind: z.enum(["FULL_PAYMENT", "DOWN_PAYMENT", "REMAINING_PAYMENT", "MULTI_PAYMENT_LINE", "SPLIT_BILL_LINE"]).default("FULL_PAYMENT"),
  status: z.enum(["succeeded", "voided", "refunded", "cancelled"]).default("succeeded"),
});

export const selectOrderPaymentSchema = createSelectSchema(orderPayments);
export type InsertOrderPayment = z.infer<typeof insertOrderPaymentSchema>;
export type OrderPayment = typeof orderPayments.$inferSelect;

export const orderBillSplits = pgTable("order_bill_splits", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  splitNo: integer("split_no").notNull(),
  splitLabel: text("split_label"),
  clientBillId: varchar("client_bill_id", { length: 128 }),
  amountDue: decimal("amount_due", { precision: 10, scale: 2 }).notNull(),
  amountPaid: decimal("amount_paid", { precision: 10, scale: 2 }).notNull().default("0"),
  status: varchar("status", { length: 50 }).notNull().default("unpaid"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  tenantIdx: index("order_bill_splits_tenant_idx").on(table.tenantId),
  orderIdx: index("order_bill_splits_order_idx").on(table.orderId),
  orderSplitUnique: uniqueIndex("order_bill_splits_order_split_no_unique").on(table.orderId, table.splitNo),
  clientBillIdx: index("order_bill_splits_client_bill_idx").on(table.orderId, table.clientBillId),
}));

export type InsertOrderBillSplit = typeof orderBillSplits.$inferInsert;
export type OrderBillSplit = typeof orderBillSplits.$inferSelect;
