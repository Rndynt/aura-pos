import { sql } from "drizzle-orm";
import { pgTable, text, varchar, uuid, integer, decimal, boolean, timestamp, date, json, jsonb, index, uniqueIndex, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

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


export const tenantEntitlements = pgTable("tenant_entitlements", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  entitlementCode: text("entitlement_code").notNull(),
  source: varchar("source", { length: 50 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("active"),
  startsAt: timestamp("starts_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  expiresAt: timestamp("expires_at"),
  config: jsonb("config"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  tenantIdx: index("tenant_entitlements_tenant_idx").on(table.tenantId),
  entitlementCodeIdx: index("tenant_entitlements_entitlement_code_idx").on(table.entitlementCode),
  statusIdx: index("tenant_entitlements_status_idx").on(table.status),
  expiresAtIdx: index("tenant_entitlements_expires_at_idx").on(table.expiresAt),
  activeTenantEntitlementUnique: uniqueIndex("tenant_entitlements_active_tenant_entitlement_unique")
    .on(table.tenantId, table.entitlementCode)
    .where(sql`${table.status} = 'active'`),
}));

export const insertTenantEntitlementSchema = createInsertSchema(tenantEntitlements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  source: z.enum(["purchase", "manual_grant", "trial"]),
  status: z.enum(["active", "expired", "cancelled"]).optional(),
  config: z.record(z.any()).nullable().optional(),
});

export const selectTenantEntitlementSchema = createSelectSchema(tenantEntitlements);
export type InsertTenantEntitlement = z.infer<typeof insertTenantEntitlementSchema>;
export type TenantEntitlement = typeof tenantEntitlements.$inferSelect;

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
