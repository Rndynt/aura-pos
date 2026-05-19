import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, boolean, timestamp, json, jsonb, index, uniqueIndex, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
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
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
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

export const tables = pgTable("tables", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  tableNumber: varchar("table_number").notNull(), // "1", "A1", "VIP-1"
  tableName: text("table_name"), // "Window Seat", "Terrace"
  floor: varchar("floor"), // "Ground Floor", "2nd Floor"
  capacity: integer("capacity"), // max persons
  status: varchar("status", { length: 20 }).notNull().default("available"), // available, occupied, reserved, maintenance
  currentOrderId: varchar("current_order_id"), // soft reference to orders.id
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  tenantIdx: index("tables_tenant_idx").on(table.tenantId),
  statusIdx: index("tables_status_idx").on(table.status),
  uniqueTablePerTenant: uniqueIndex("tables_unique_per_tenant").on(table.tenantId, table.tableNumber),
}));

export const insertTableSchema = createInsertSchema(tables).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTable = z.infer<typeof insertTableSchema>;
export type Table = typeof tables.$inferSelect;

export const tenantModuleConfigs = pgTable("tenant_module_configs", {
  tenantId: varchar("tenant_id").primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  enableTableManagement: boolean("enable_table_management").notNull().default(false),
  enableKitchenTicket: boolean("enable_kitchen_ticket").notNull().default(false),
  enableLoyalty: boolean("enable_loyalty").notNull().default(false),
  enableDelivery: boolean("enable_delivery").notNull().default(false),
  enableInventory: boolean("enable_inventory").notNull().default(false),
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

export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
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

export const productOptionGroups = pgTable("product_option_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
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
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  optionGroupId: varchar("option_group_id").notNull().references(() => productOptionGroups.id, { onDelete: "cascade" }),
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
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
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

export const tenantOrderTypes = pgTable("tenant_order_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  orderTypeId: varchar("order_type_id").notNull().references(() => orderTypes.id, { onDelete: "cascade" }),
  isEnabled: boolean("is_enabled").notNull().default(true),
  config: json("config"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  tenantIdx: index("tenant_order_types_tenant_idx").on(table.tenantId),
  orderTypeIdx: index("tenant_order_types_order_type_idx").on(table.orderTypeId),
  tenantOrderTypeUnique: uniqueIndex("tenant_order_types_tenant_order_type_unique").on(table.tenantId, table.orderTypeId),
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

export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  orderTypeId: varchar("order_type_id").references(() => orderTypes.id),
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
  // Explicit settlement/close tracking (P0.3: pay-later lifecycle)
  closedAt: timestamp("closed_at"),
  // Cancellation reason (for audit trail)
  cancellationReason: text("cancellation_reason"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  tenantIdx: index("orders_tenant_idx").on(table.tenantId),
  orderTypeIdx: index("orders_order_type_idx").on(table.orderTypeId),
  salesChannelIdx: index("orders_sales_channel_idx").on(table.salesChannel),
  orderNumberIdx: index("orders_order_number_idx").on(table.orderNumber),
  statusIdx: index("orders_status_idx").on(table.status),
  orderDateIdx: index("orders_order_date_idx").on(table.orderDate),
  tenantIdempotencyUnique: uniqueIndex("orders_tenant_idempotency_unique").on(table.tenantId, table.idempotencyKey),
  // P1.3: unique order number per tenant to prevent race condition duplicates
  tenantOrderNumberUnique: uniqueIndex("orders_tenant_order_number_unique").on(table.tenantId, table.orderNumber),
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
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: varchar("product_id").notNull().references(() => products.id),
  productName: text("product_name").notNull(),
  variantId: varchar("variant_id"),
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
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderItemId: varchar("order_item_id").notNull().references(() => orderItems.id, { onDelete: "cascade" }),
  optionGroupId: varchar("option_group_id").notNull(),
  optionGroupName: text("option_group_name").notNull(),
  optionId: varchar("option_id").notNull(),
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
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
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
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  ticketNumber: text("ticket_number").notNull(),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  items: json("items").notNull(),
  printedAt: timestamp("printed_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  tenantIdx: index("kitchen_tickets_tenant_idx").on(table.tenantId),
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
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
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
  tenantFeatureUnique: index("tenant_features_tenant_feature_unique").on(table.tenantId, table.featureCode),
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
