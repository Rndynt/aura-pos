import { sql } from "drizzle-orm";
import { pgTable, text, varchar, uuid, integer, decimal, boolean, timestamp, date, json, jsonb, index, uniqueIndex, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const businessTypes = pgTable("business_types", {
  code: varchar("code", { length: 50 }).primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
});

export const insertBusinessTypeSchema = createInsertSchema(businessTypes);
export const selectBusinessTypeSchema = createSelectSchema(businessTypes);
export type InsertBusinessType = z.infer<typeof insertBusinessTypeSchema>;
export type BusinessTypeRecord = typeof businessTypes.$inferSelect;

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  businessName: text("business_name"),
  businessAddress: text("business_address"),
  businessPhone: text("business_phone"),
  businessEmail: text("business_email"),
  businessType: varchar("business_type", { length: 50 }).notNull().default("CAFE_RESTAURANT").references(() => businessTypes.code),
  settings: json("settings"),
  planTier: varchar("plan_tier", { length: 50 }).notNull().default("free"),
  subscriptionStatus: varchar("subscription_status", { length: 50 }).notNull().default("active"),
  trialEndsAt: timestamp("trial_ends_at"),
  timezone: text("timezone").notNull().default("UTC"),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  locale: varchar("locale", { length: 10 }).notNull().default("en-US"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertTenantSchema = createInsertSchema(tenants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectTenantSchema = createSelectSchema(tenants);
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenants.$inferSelect;

// ── Outlets (Multi-Outlet / Multi-Cabang) ─────────────────────────────────────
// Every tenant gets 1 default outlet ("Cabang Utama") on registration.
// Additional outlets require purchasing the multi_outlet feature (Rp 10.000/month each).

export const outlets = pgTable("outlets", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Cabang Utama"),
  slug: varchar("slug", { length: 100 }).notNull().default("main"),
  address: text("address"),
  phone: varchar("phone", { length: 50 }),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  tenantIdx: index("outlets_tenant_idx").on(table.tenantId),
  tenantSlugUnique: uniqueIndex("outlets_tenant_slug_unique").on(table.tenantId, table.slug),
}));

export const insertOutletSchema = createInsertSchema(outlets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const selectOutletSchema = createSelectSchema(outlets);
export type InsertOutlet = z.infer<typeof insertOutletSchema>;
export type Outlet = typeof outlets.$inferSelect;

// ── User Outlet Assignments ───────────────────────────────────────────────────
// Owner can access all outlets and switch active outlet from Settings.
// Manager/Cashier/Staff are locked to their assigned outlet(s).

export const userOutletAssignments = pgTable("user_outlet_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id").notNull(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 50 }).notNull().default("staff"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  userIdx: index("user_outlet_assignments_user_idx").on(table.userId),
  outletIdx: index("user_outlet_assignments_outlet_idx").on(table.outletId),
  userOutletUnique: uniqueIndex("user_outlet_assignments_unique").on(table.userId, table.outletId),
}));

export const insertUserOutletAssignmentSchema = createInsertSchema(userOutletAssignments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  role: z.enum(["owner", "manager", "cashier", "staff"]).default("staff"),
});
export type InsertUserOutletAssignment = z.infer<typeof insertUserOutletAssignmentSchema>;
export type UserOutletAssignment = typeof userOutletAssignments.$inferSelect;

// ── Tables (Dine-in) ──────────────────────────────────────────────────────────

export const tables = pgTable("tables", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "cascade" }),
  tableNumber: varchar("table_number").notNull(),
  tableName: text("table_name"),
  floor: varchar("floor"),
  capacity: integer("capacity"),
  status: varchar("status", { length: 20 }).notNull().default("available"),
  currentOrderId: uuid("current_order_id"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  tenantIdx: index("tables_tenant_idx").on(table.tenantId),
  outletIdx: index("tables_outlet_idx").on(table.outletId),
  statusIdx: index("tables_status_idx").on(table.status),
  uniqueTablePerOutlet: uniqueIndex("tables_unique_per_outlet").on(table.tenantId, table.outletId, table.tableNumber),
}));

export const insertTableSchema = createInsertSchema(tables).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTable = z.infer<typeof insertTableSchema>;
export type Table = typeof tables.$inferSelect;

export const tenantModuleConfigs = pgTable("tenant_module_configs", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  enableTableManagement: boolean("enable_table_management").notNull().default(false),
  enableKitchenTicket: boolean("enable_kitchen_ticket").notNull().default(false),
  enableLoyalty: boolean("enable_loyalty").notNull().default(false),
  enableDelivery: boolean("enable_delivery").notNull().default(false),
  enableInventory: boolean("enable_inventory").notNull().default(false),
  enableInventoryAdvanced: boolean("enable_inventory_advanced").notNull().default(false),
  enableAppointments: boolean("enable_appointments").notNull().default(false),
  enableMultiLocation: boolean("enable_multi_location").notNull().default(false),
  config: json("config"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertTenantModuleConfigSchema = createInsertSchema(tenantModuleConfigs).omit({
  createdAt: true,
  updatedAt: true,
}).extend({
  config: z.record(z.any()).nullable().optional(),
});

export const selectTenantModuleConfigSchema = createSelectSchema(tenantModuleConfigs);
export type InsertTenantModuleConfig = z.infer<typeof insertTenantModuleConfigSchema>;
export type TenantModuleConfig = typeof tenantModuleConfigs.$inferSelect;

export const productCategories = pgTable("product_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  tenantIdx: index("product_categories_tenant_idx").on(table.tenantId),
  tenantNameUnique: uniqueIndex("product_categories_tenant_name_unique").on(table.tenantId, table.name),
}));

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").references(() => productCategories.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  basePrice: decimal("base_price", { precision: 10, scale: 2 }).notNull(),
  category: text("category").notNull(),
  imageUrl: text("image_url"),
  metadata: jsonb("metadata"),
  hasVariants: boolean("has_variants").notNull().default(false),
  stockTrackingEnabled: boolean("stock_tracking_enabled").notNull().default(false),
  stockQty: integer("stock_qty"),
  sku: text("sku"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  tenantIdx: index("products_tenant_idx").on(table.tenantId),
  categoryIdx: index("products_category_idx").on(table.category),
}));

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectProductSchema = createSelectSchema(products);
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

// ── Outlet Product Configs (Hybrid catalog — disable a product per outlet) ────

export const outletProductConfigs = pgTable("outlet_product_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  outletId: uuid("outlet_id").notNull().references(() => outlets.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  isAvailable: boolean("is_available").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  outletIdx: index("outlet_product_configs_outlet_idx").on(table.outletId),
  productIdx: index("outlet_product_configs_product_idx").on(table.productId),
  outletProductUnique: uniqueIndex("outlet_product_configs_unique").on(table.outletId, table.productId),
}));

export const insertOutletProductConfigSchema = createInsertSchema(outletProductConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertOutletProductConfig = z.infer<typeof insertOutletProductConfigSchema>;
export type OutletProductConfig = typeof outletProductConfigs.$inferSelect;

export const productOptionGroups = pgTable("product_option_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  selectionType: varchar("selection_type", { length: 20 }).notNull(),
  minSelections: integer("min_selections").notNull().default(0),
  maxSelections: integer("max_selections").notNull().default(1),
  isRequired: boolean("is_required").notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  tenantIdx: index("product_option_groups_tenant_idx").on(table.tenantId),
  productIdx: index("product_option_groups_product_idx").on(table.productId),
}));

export const insertProductOptionGroupSchema = createInsertSchema(productOptionGroups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  selectionType: z.enum(["single", "multiple"]),
});

export const selectProductOptionGroupSchema = createSelectSchema(productOptionGroups);
export type InsertProductOptionGroup = z.infer<typeof insertProductOptionGroupSchema>;
export type ProductOptionGroup = typeof productOptionGroups.$inferSelect;

export const productOptions = pgTable("product_options", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  optionGroupId: uuid("option_group_id").notNull().references(() => productOptionGroups.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  priceDelta: decimal("price_delta", { precision: 10, scale: 2 }).notNull().default("0"),
  inventorySku: text("inventory_sku"),
  isAvailable: boolean("is_available").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  tenantIdx: index("product_options_tenant_idx").on(table.tenantId),
  optionGroupIdx: index("product_options_option_group_idx").on(table.optionGroupId),
}));

export const insertProductOptionSchema = createInsertSchema(productOptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectProductOptionSchema = createSelectSchema(productOptions);
export type InsertProductOption = z.infer<typeof insertProductOptionSchema>;
export type ProductOption = typeof productOptions.$inferSelect;

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
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  paymentMethod: varchar("payment_method", { length: 50 }).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paymentDate: timestamp("payment_date").notNull().default(sql`CURRENT_TIMESTAMP`),
  referenceNumber: text("reference_number"),
  notes: text("notes"),
  idempotencyKey: varchar("idempotency_key", { length: 128 }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  orderIdx: index("order_payments_order_idx").on(table.orderId),
  paymentDateIdx: index("order_payments_payment_date_idx").on(table.paymentDate),
  orderIdempotencyUnique: uniqueIndex("order_payments_order_id_idempotency_unique")
    .on(table.orderId, table.idempotencyKey)
    .where(sql`${table.idempotencyKey} IS NOT NULL`),
}));

export const insertOrderPaymentSchema = createInsertSchema(orderPayments).omit({
  id: true,
  createdAt: true,
}).extend({
  paymentMethod: z.enum(["cash", "card", "ewallet", "other"]),
});

export const selectOrderPaymentSchema = createSelectSchema(orderPayments);
export type InsertOrderPayment = z.infer<typeof insertOrderPaymentSchema>;
export type OrderPayment = typeof orderPayments.$inferSelect;

export const kitchenTickets = pgTable("kitchen_tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  ticketNumber: text("ticket_number").notNull(),
  tableNumber: text("table_number"),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  items: json("items").notNull(),
  printedAt: timestamp("printed_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  tenantIdx: index("kitchen_tickets_tenant_idx").on(table.tenantId),
  outletIdx: index("kitchen_tickets_outlet_idx").on(table.outletId),
  orderIdx: index("kitchen_tickets_order_idx").on(table.orderId),
  statusIdx: index("kitchen_tickets_status_idx").on(table.status),
}));

export const insertKitchenTicketSchema = createInsertSchema(kitchenTickets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  status: z.enum(["pending", "preparing", "ready", "delivered"]).default("pending"),
  items: z.array(z.any()),
});

export const selectKitchenTicketSchema = createSelectSchema(kitchenTickets);
export type InsertKitchenTicket = z.infer<typeof insertKitchenTicketSchema>;
export type KitchenTicket = typeof kitchenTickets.$inferSelect;

export const tenantFeatures = pgTable("tenant_features", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  featureCode: text("feature_code").notNull(),
  activatedAt: timestamp("activated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  expiresAt: timestamp("expires_at"),
  source: varchar("source", { length: 50 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  config: json("config"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  tenantIdx: index("tenant_features_tenant_idx").on(table.tenantId),
  featureCodeIdx: index("tenant_features_feature_code_idx").on(table.featureCode),
  tenantFeatureUnique: uniqueIndex("tenant_features_tenant_feature_unique").on(table.tenantId, table.featureCode),
}));

export const insertTenantFeatureSchema = createInsertSchema(tenantFeatures).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  source: z.enum(["plan_default", "purchase", "manual_grant", "trial"]),
  config: z.record(z.any()).optional(),
});

export const selectTenantFeatureSchema = createSelectSchema(tenantFeatures);
export type InsertTenantFeature = z.infer<typeof insertTenantFeatureSchema>;
export type TenantFeature = typeof tenantFeatures.$inferSelect;

// ── Sprint 4: Terminal Registry ───────────────────────────────────────────────

export const terminals = pgTable("terminals", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "set null" }),
  terminalCode: varchar("terminal_code", { length: 128 }).notNull(),
  name: text("name").notNull().default("Cashier"),
  deviceFingerprint: text("device_fingerprint"),
  isActive: boolean("is_active").notNull().default(true),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  tenantIdx: index("terminals_tenant_idx").on(table.tenantId),
  outletIdx: index("terminals_outlet_idx").on(table.outletId),
  tenantCodeUnique: uniqueIndex("terminals_tenant_code_unique").on(table.tenantId, table.terminalCode),
}));

export const insertTerminalSchema = createInsertSchema(terminals).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTerminal = z.infer<typeof insertTerminalSchema>;
export type Terminal = typeof terminals.$inferSelect;

// ── Sprint 4: Sync Batches ────────────────────────────────────────────────────

export const syncBatches = pgTable("sync_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "set null" }),
  terminalId: varchar("terminal_id"),
  batchSize: integer("batch_size").notNull().default(0),
  syncedCount: integer("synced_count").notNull().default(0),
  replayedCount: integer("replayed_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  conflictCount: integer("conflict_count").notNull().default(0),
  appVersion: varchar("app_version", { length: 64 }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  tenantIdx: index("sync_batches_tenant_idx").on(table.tenantId),
  outletIdx: index("sync_batches_outlet_idx").on(table.outletId),
  terminalIdx: index("sync_batches_terminal_idx").on(table.terminalId),
}));

export const insertSyncBatchSchema = createInsertSchema(syncBatches).omit({ id: true, createdAt: true });
export type InsertSyncBatch = z.infer<typeof insertSyncBatchSchema>;
export type SyncBatch = typeof syncBatches.$inferSelect;

// ── Sprint 4: Sync Events ─────────────────────────────────────────────────────

export const syncEvents = pgTable("sync_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "set null" }),
  terminalId: varchar("terminal_id"),
  batchId: uuid("batch_id").references(() => syncBatches.id, { onDelete: "cascade" }),
  entityType: varchar("entity_type", { length: 50 }).notNull().default("order"),
  localEntityId: varchar("local_entity_id", { length: 128 }),
  serverEntityId: varchar("server_entity_id"),
  localOrderNumber: varchar("local_order_number", { length: 128 }),
  serverOrderNumber: text("server_order_number"),
  status: varchar("status", { length: 50 }).notNull(),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  tenantIdx: index("sync_events_tenant_idx").on(table.tenantId),
  outletIdx: index("sync_events_outlet_idx").on(table.outletId),
  batchIdx: index("sync_events_batch_idx").on(table.batchId),
  localEntityIdx: index("sync_events_local_entity_idx").on(table.localEntityId),
}));

export const insertSyncEventSchema = createInsertSchema(syncEvents).omit({ id: true, createdAt: true });
export type InsertSyncEvent = z.infer<typeof insertSyncEventSchema>;
export type SyncEvent = typeof syncEvents.$inferSelect;

// ── Sprint 4: Server-Side Sync Conflicts ─────────────────────────────────────

export const serverSyncConflicts = pgTable("server_sync_conflicts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "set null" }),
  terminalId: varchar("terminal_id"),
  localOrderId: varchar("local_order_id", { length: 128 }),
  serverOrderId: uuid("server_order_id"),
  conflictType: varchar("conflict_type", { length: 50 }).notNull(),
  message: text("message").notNull(),
  conflictData: jsonb("conflict_data"),
  resolution: varchar("resolution", { length: 30 }).notNull().default("pending"),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by", { length: 255 }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  tenantIdx: index("server_sync_conflicts_tenant_idx").on(table.tenantId),
  outletIdx: index("server_sync_conflicts_outlet_idx").on(table.outletId),
  terminalIdx: index("server_sync_conflicts_terminal_idx").on(table.terminalId),
}));

export const insertServerSyncConflictSchema = createInsertSchema(serverSyncConflicts).omit({ id: true, createdAt: true });
export type InsertServerSyncConflict = z.infer<typeof insertServerSyncConflictSchema>;
export type ServerSyncConflict = typeof serverSyncConflicts.$inferSelect;

// ── Sprint 5: Inventory Movements Ledger ─────────────────────────────────────

export const inventoryMovements = pgTable("inventory_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "set null" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
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

// ── Payment Engine Phase 1 ────────────────────────────────────────────────────

export const paymentIntents = pgTable("payment_intents", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "set null" }),
  payableType: varchar("payable_type", { length: 64 }).notNull(),
  payableId: varchar("payable_id", { length: 128 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("IDR"),
  amountDue: decimal("amount_due", { precision: 12, scale: 2 }).notNull(),
  amountPaid: decimal("amount_paid", { precision: 12, scale: 2 }).notNull().default("0"),
  amountRefunded: decimal("amount_refunded", { precision: 12, scale: 2 }).notNull().default("0"),
  amountRemaining: decimal("amount_remaining", { precision: 12, scale: 2 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("requires_payment"),
  allowPartial: boolean("allow_partial").notNull().default(false),
  expiresAt: timestamp("expires_at"),
  metadata: jsonb("metadata"),
  idempotencyKey: varchar("idempotency_key", { length: 128 }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  tenantIdx: index("payment_intents_tenant_idx").on(table.tenantId),
  outletIdx: index("payment_intents_outlet_idx").on(table.outletId),
  payableIdx: index("payment_intents_payable_idx").on(table.tenantId, table.payableType, table.payableId),
  statusIdx: index("payment_intents_status_idx").on(table.tenantId, table.status),
  createdAtIdx: index("payment_intents_created_at_idx").on(table.createdAt),
  tenantIdempotencyUnique: uniqueIndex("payment_intents_tenant_idempotency_unique")
    .on(table.tenantId, table.idempotencyKey)
    .where(sql`${table.idempotencyKey} IS NOT NULL`),
}));

export const insertPaymentIntentSchema = createInsertSchema(paymentIntents).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPaymentIntent = z.infer<typeof insertPaymentIntentSchema>;
export type PaymentIntent = typeof paymentIntents.$inferSelect;

export const paymentTransactions = pgTable("payment_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  paymentIntentId: uuid("payment_intent_id").notNull().references(() => paymentIntents.id, { onDelete: "cascade" }),
  /**
   * Phase 4: nullable self-reference linking refund/void rows to the original
   * incoming transaction. Set for direction=outgoing transactionType=refund rows.
   * NULL for all original incoming payment rows.
   */
  parentTransactionId: uuid("parent_transaction_id").references((): any => paymentTransactions.id, { onDelete: "set null" }),
  direction: varchar("direction", { length: 20 }).notNull().default("incoming"),
  transactionType: varchar("transaction_type", { length: 50 }).notNull().default("payment"),
  method: varchar("method", { length: 50 }).notNull(),
  provider: varchar("provider", { length: 50 }).notNull().default("manual"),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  receivedAmount: decimal("received_amount", { precision: 12, scale: 2 }),
  changeAmount: decimal("change_amount", { precision: 12, scale: 2 }),
  providerReference: varchar("provider_reference", { length: 255 }),
  providerPaymentUrl: text("provider_payment_url"),
  providerQrString: text("provider_qr_string"),
  failureReason: text("failure_reason"),
  idempotencyKey: varchar("idempotency_key", { length: 128 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  succeededAt: timestamp("succeeded_at"),
  failedAt: timestamp("failed_at"),
  cancelledAt: timestamp("cancelled_at"),
}, (table) => ({
  tenantIdx: index("payment_transactions_tenant_idx").on(table.tenantId),
  intentIdx: index("payment_transactions_intent_idx").on(table.paymentIntentId),
  parentIdx: index("payment_transactions_parent_idx").on(table.parentTransactionId),
  statusIdx: index("payment_transactions_status_idx").on(table.tenantId, table.status),
  providerReferenceIdx: index("payment_transactions_provider_reference_idx").on(table.provider, table.providerReference),
  tenantIdempotencyUnique: uniqueIndex("payment_transactions_tenant_idempotency_unique")
    .on(table.tenantId, table.idempotencyKey)
    .where(sql`${table.idempotencyKey} IS NOT NULL`),
  providerReferenceUnique: uniqueIndex("payment_transactions_provider_reference_unique")
    .on(table.provider, table.providerReference)
    .where(sql`${table.providerReference} IS NOT NULL`),
}));

export const insertPaymentTransactionSchema = createInsertSchema(paymentTransactions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPaymentTransaction = z.infer<typeof insertPaymentTransactionSchema>;
export type PaymentTransaction = typeof paymentTransactions.$inferSelect;

export const paymentAllocations = pgTable("payment_allocations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  paymentIntentId: uuid("payment_intent_id").notNull().references(() => paymentIntents.id, { onDelete: "cascade" }),
  paymentTransactionId: uuid("payment_transaction_id").notNull().references(() => paymentTransactions.id, { onDelete: "cascade" }),
  targetType: varchar("target_type", { length: 64 }).notNull(),
  targetId: varchar("target_id", { length: 128 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  tenantIdx: index("payment_allocations_tenant_idx").on(table.tenantId),
  intentIdx: index("payment_allocations_intent_idx").on(table.paymentIntentId),
  transactionIdx: index("payment_allocations_transaction_idx").on(table.paymentTransactionId),
  targetIdx: index("payment_allocations_target_idx").on(table.tenantId, table.targetType, table.targetId),
  /**
   * Phase 2 Hardening — duplicate allocation guard.
   *
   * A single payment_transaction can only have ONE allocation for a given
   * (target_type, target_id) pair. This acts as a schema-level safety net
   * against concurrent ConfirmFakeGatewayPayment calls that might both pass
   * the FOR UPDATE lock check (e.g. across read replicas) and both attempt to
   * insert an allocation for the same confirmed transaction.
   *
   * Migration note: run `npx drizzle-kit push` or generate and apply a
   * migration before deploying this change to production.
   */
  txTargetUnique: uniqueIndex("payment_allocations_tx_target_unique").on(
    table.paymentTransactionId,
    table.targetType,
    table.targetId,
  ),
}));

export const insertPaymentAllocationSchema = createInsertSchema(paymentAllocations).omit({ id: true, createdAt: true });
export type InsertPaymentAllocation = z.infer<typeof insertPaymentAllocationSchema>;
export type PaymentAllocation = typeof paymentAllocations.$inferSelect;

export const paymentProviderEvents = pgTable("payment_provider_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 50 }).notNull(),
  providerEventId: varchar("provider_event_id", { length: 255 }).notNull(),
  providerReference: varchar("provider_reference", { length: 255 }),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  rawPayload: jsonb("raw_payload").notNull(),
  signatureValid: boolean("signature_valid").notNull().default(false),
  processingStatus: varchar("processing_status", { length: 50 }).notNull().default("pending"),
  processedAt: timestamp("processed_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  providerEventUnique: uniqueIndex("payment_provider_events_provider_event_unique").on(table.provider, table.providerEventId),
  referenceIdx: index("payment_provider_events_reference_idx").on(table.provider, table.providerReference),
  statusIdx: index("payment_provider_events_status_idx").on(table.processingStatus),
  createdAtIdx: index("payment_provider_events_created_at_idx").on(table.createdAt),
}));

export const insertPaymentProviderEventSchema = createInsertSchema(paymentProviderEvents).omit({ id: true, createdAt: true });
export type InsertPaymentProviderEvent = z.infer<typeof insertPaymentProviderEventSchema>;
export type PaymentProviderEvent = typeof paymentProviderEvents.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// Northflow Payment Orchestration standalone schema — Phase 8C
//
// These tables are owned by apps/payment-orchestration-service.
// Primary identity: merchant_id (NOT AuraPoS tenant_id).
// No FK references to embedded AuraPoS tables (tenants, outlets, orders, etc.).
//
// Migration: run `npx drizzle-kit generate` then `npx drizzle-kit migrate`
// or `npx drizzle-kit push` in a dev environment.
// ─────────────────────────────────────────────────────────────────────────────

export const paymentOrchestrationMerchants = pgTable("payment_orchestration_merchants", {
  id: text("id").primaryKey(),
  externalRef: text("external_ref"),
  sourceApp: text("source_app"),
  name: text("name").notNull(),
  legalName: text("legal_name"),
  status: text("status").notNull().default("active"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  // Partial unique: (source_app, external_ref) where both are non-null.
  // Prevents duplicate merchant registration from the same source app.
  sourceAppExternalRefIdx: uniqueIndex("po_merchants_source_app_ref_unique")
    .on(table.sourceApp, table.externalRef)
    .where(sql`${table.sourceApp} IS NOT NULL AND ${table.externalRef} IS NOT NULL`),
  statusIdx: index("po_merchants_status_idx").on(table.status),
}));

export const insertPaymentOrchestrationMerchantSchema = createInsertSchema(paymentOrchestrationMerchants).omit({ createdAt: true, updatedAt: true });
export type InsertPaymentOrchestrationMerchant = z.infer<typeof insertPaymentOrchestrationMerchantSchema>;
export type PaymentOrchestrationMerchant = typeof paymentOrchestrationMerchants.$inferSelect;

export const paymentOrchestrationProviderAccounts = pgTable("payment_orchestration_provider_accounts", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => paymentOrchestrationMerchants.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  providerAccountRef: text("provider_account_ref"),
  environment: text("environment").notNull(),
  status: text("status").notNull().default("active"),
  // credentialsRef is an opaque reference to env/secret-manager — never store raw API keys here.
  credentialsRef: text("credentials_ref"),
  publicConfig: jsonb("public_config").notNull().default({}),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  merchantIdx: index("po_provider_accounts_merchant_idx").on(table.merchantId),
  merchantProviderEnvUnique: uniqueIndex("po_provider_accounts_merchant_provider_env_unique")
    .on(table.merchantId, table.provider, table.environment, table.providerAccountRef)
    .where(sql`${table.providerAccountRef} IS NOT NULL`),
}));

export const insertPaymentOrchestrationProviderAccountSchema = createInsertSchema(paymentOrchestrationProviderAccounts).omit({ createdAt: true, updatedAt: true });
export type InsertPaymentOrchestrationProviderAccount = z.infer<typeof insertPaymentOrchestrationProviderAccountSchema>;
export type PaymentOrchestrationProviderAccount = typeof paymentOrchestrationProviderAccounts.$inferSelect;

export const paymentOrchestrationIntents = pgTable("payment_orchestration_intents", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => paymentOrchestrationMerchants.id, { onDelete: "cascade" }),
  providerAccountId: text("provider_account_id").references(() => paymentOrchestrationProviderAccounts.id, { onDelete: "set null" }),
  sourceApp: text("source_app"),
  externalTenantId: text("external_tenant_id"),
  externalOutletId: text("external_outlet_id"),
  externalLocationId: text("external_location_id"),
  externalPayableType: text("external_payable_type").notNull(),
  externalPayableId: text("external_payable_id").notNull(),
  amountDue: integer("amount_due").notNull(),
  amountPaid: integer("amount_paid").notNull().default(0),
  amountRefunded: integer("amount_refunded").notNull().default(0),
  amountRemaining: integer("amount_remaining").notNull(),
  currency: text("currency").notNull().default("IDR"),
  status: text("status").notNull(),
  allowPartial: boolean("allow_partial").notNull().default(false),
  expiresAt: timestamp("expires_at"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  merchantIdx: index("po_intents_merchant_idx").on(table.merchantId),
  sourceAppTenantIdx: index("po_intents_source_app_tenant_idx").on(table.sourceApp, table.externalTenantId),
  payableIdx: index("po_intents_payable_idx").on(table.externalPayableType, table.externalPayableId),
  // Prevents duplicate payment intents for the same payable in the same source app per merchant.
  merchantPayableUnique: uniqueIndex("po_intents_merchant_payable_unique")
    .on(table.merchantId, table.sourceApp, table.externalPayableType, table.externalPayableId)
    .where(sql`${table.sourceApp} IS NOT NULL`),
}));

export const insertPaymentOrchestrationIntentSchema = createInsertSchema(paymentOrchestrationIntents).omit({ createdAt: true, updatedAt: true });
export type InsertPaymentOrchestrationIntent = z.infer<typeof insertPaymentOrchestrationIntentSchema>;
export type PaymentOrchestrationIntent = typeof paymentOrchestrationIntents.$inferSelect;

export const paymentOrchestrationTransactions = pgTable("payment_orchestration_transactions", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => paymentOrchestrationMerchants.id, { onDelete: "cascade" }),
  intentId: text("intent_id").notNull().references(() => paymentOrchestrationIntents.id, { onDelete: "cascade" }),
  providerAccountId: text("provider_account_id").references(() => paymentOrchestrationProviderAccounts.id, { onDelete: "set null" }),
  provider: text("provider").notNull(),
  method: text("method").notNull(),
  transactionType: text("transaction_type").notNull(),
  status: text("status").notNull(),
  direction: text("direction").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("IDR"),
  // Self-referential: links refund/void transactions back to the original payment transaction.
  parentTransactionId: text("parent_transaction_id").references((): any => paymentOrchestrationTransactions.id, { onDelete: "set null" }),
  providerReference: text("provider_reference"),
  providerEventId: text("provider_event_id"),
  providerPaymentUrl: text("provider_payment_url"),
  providerQrString: text("provider_qr_string"),
  failureReason: text("failure_reason"),
  idempotencyKey: text("idempotency_key"),
  expiresAt: timestamp("expires_at"),
  metadata: jsonb("metadata").notNull().default({}),
  rawProviderResponse: jsonb("raw_provider_response"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  merchantIdx: index("po_transactions_merchant_idx").on(table.merchantId),
  intentIdx: index("po_transactions_intent_idx").on(table.intentId),
  providerReferenceIdx: index("po_transactions_provider_reference_idx").on(table.provider, table.providerReference),
  expiresAtIdx: index("po_transactions_expires_at_idx").on(table.expiresAt),
  // Prevents duplicate idempotent payment submissions per merchant.
  merchantIdempotencyUnique: uniqueIndex("po_transactions_merchant_idempotency_unique")
    .on(table.merchantId, table.idempotencyKey)
    .where(sql`${table.idempotencyKey} IS NOT NULL`),
  // Prevents duplicate provider reference records (global dedup across merchants).
  providerReferenceUnique: uniqueIndex("po_transactions_provider_reference_unique")
    .on(table.provider, table.providerReference)
    .where(sql`${table.providerReference} IS NOT NULL`),
}));

export const insertPaymentOrchestrationTransactionSchema = createInsertSchema(paymentOrchestrationTransactions).omit({ createdAt: true, updatedAt: true });
export type InsertPaymentOrchestrationTransaction = z.infer<typeof insertPaymentOrchestrationTransactionSchema>;
export type PaymentOrchestrationTransaction = typeof paymentOrchestrationTransactions.$inferSelect;

export const paymentOrchestrationProviderEvents = pgTable("payment_orchestration_provider_events", {
  id: text("id").primaryKey(),
  // merchantId is nullable: real provider webhooks do not carry a merchant header.
  // Backfilled after providerReference resolves to a known transaction/intent.
  merchantId: text("merchant_id").references(() => paymentOrchestrationMerchants.id, { onDelete: "set null" }),
  provider: text("provider").notNull(),
  providerEventId: text("provider_event_id").notNull(),
  providerReference: text("provider_reference"),
  eventType: text("event_type").notNull(),
  processingStatus: text("processing_status").notNull().default("pending"),
  processingAttempts: integer("processing_attempts").notNull().default(0),
  lastError: text("last_error"),
  rawHeaders: jsonb("raw_headers").notNull().default({}),
  rawBody: jsonb("raw_body"),
  parsedPayload: jsonb("parsed_payload"),
  receivedAt: timestamp("received_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  // Global dedup: a provider event is received exactly once.
  providerEventUnique: uniqueIndex("po_provider_events_unique").on(table.provider, table.providerEventId),
  merchantIdx: index("po_provider_events_merchant_idx").on(table.merchantId),
  providerReferenceIdx: index("po_provider_events_reference_idx").on(table.provider, table.providerReference),
  processingStatusIdx: index("po_provider_events_status_idx").on(table.processingStatus),
  receivedAtIdx: index("po_provider_events_received_at_idx").on(table.receivedAt),
}));

export const insertPaymentOrchestrationProviderEventSchema = createInsertSchema(paymentOrchestrationProviderEvents).omit({ createdAt: true, updatedAt: true });
export type InsertPaymentOrchestrationProviderEvent = z.infer<typeof insertPaymentOrchestrationProviderEventSchema>;
export type PaymentOrchestrationProviderEvent = typeof paymentOrchestrationProviderEvents.$inferSelect;

export const paymentOrchestrationIdempotencyKeys = pgTable("payment_orchestration_idempotency_keys", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => paymentOrchestrationMerchants.id, { onDelete: "cascade" }),
  scope: text("scope").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  requestHash: text("request_hash").notNull(),
  responseSnapshot: jsonb("response_snapshot"),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  status: text("status").notNull().default("processing"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  expiresAt: timestamp("expires_at"),
}, (table) => ({
  // Primary dedup constraint: one key per merchant+scope combination.
  merchantScopeKeyUnique: uniqueIndex("po_idempotency_merchant_scope_key_unique")
    .on(table.merchantId, table.scope, table.idempotencyKey),
  expiresAtIdx: index("po_idempotency_expires_at_idx").on(table.expiresAt),
  statusIdx: index("po_idempotency_status_idx").on(table.status),
}));

export const insertPaymentOrchestrationIdempotencyKeySchema = createInsertSchema(paymentOrchestrationIdempotencyKeys).omit({ createdAt: true, updatedAt: true });
export type InsertPaymentOrchestrationIdempotencyKey = z.infer<typeof insertPaymentOrchestrationIdempotencyKeySchema>;
export type PaymentOrchestrationIdempotencyKey = typeof paymentOrchestrationIdempotencyKeys.$inferSelect;
