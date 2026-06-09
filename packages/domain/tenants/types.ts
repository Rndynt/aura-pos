/**
 * Tenants Domain Models
 * Multi-tenant management and feature flag system
 */

import type { BusinessType } from '@pos/core';

/**
 * Feature definition available in the system
 * Features can be enabled/disabled per tenant
 */
export type Feature = {
  code: string;
  name: string;
  description?: string;
  type: "one_time" | "subscription";
  group: "printing" | "kitchen" | "pos" | "reporting" | "ui" | "integration";
  metadata?: Record<string, any>;
  is_premium?: boolean;
};

/**
 * Feature activation for a specific tenant
 * Tracks which features are enabled and their validity period
 */
export type TenantFeature = {
  id: string;
  tenant_id: string;
  feature_code: string;
  
  // Activation tracking
  activated_at: Date;
  expires_at?: Date | null;
  
  // Source of activation
  source: "plan_default" | "purchase" | "manual_grant" | "trial";
  
  // Status
  is_active: boolean;
  
  // Metadata for feature-specific configuration
  config?: Record<string, any>;
};

/**
 * Tenant entity representing a business/organization
 * Each tenant has isolated data and configurable features
 */
export type Tenant = {
  id: string;
  name: string;
  slug: string;
  
  // Business information
  business_name?: string;
  business_address?: string;
  business_phone?: string;
  business_email?: string;
  business_type: BusinessType;
  settings: Record<string, any> | null;
  
  // Subscription & billing
  /** Values stored in DB: 'starter' | 'growth' | 'pro' */
  plan_tier: "starter" | "growth" | "pro";
  subscription_status: "active" | "trial" | "suspended" | "cancelled";
  trial_ends_at?: Date;
  
  // Settings
  timezone: string;
  currency: string;
  locale: string;
  
  // Status
  is_active: boolean;
  created_at: Date;
  updated_at?: Date;
};

/**
 * Module configuration for a tenant
 * Determines which modules/features are enabled
 */
export type TenantModuleConfig = {
  tenant_id: string;
  
  // Module flags - determines which features/screens are available
  enable_table_management: boolean;      // For café/restaurant - table seating
  enable_kitchen_ticket: boolean;        // For café/restaurant - kitchen display
  enable_loyalty: boolean;                // Loyalty points program
  enable_delivery: boolean;               // Delivery order management
  enable_inventory: boolean;              // Basic stock tracking (list + simple adjust)
  enable_inventory_advanced: boolean;     // Advanced: movement types, audit trail, reports
  enable_appointments: boolean;           // For service businesses - appointment scheduling
  enable_multi_location: boolean;         // Multiple locations support
  
  // Configuration metadata
  config?: Record<string, any>;
  updated_at?: Date;
};

/**
 * Feature flag evaluation result
 * Used to check if a feature is available for a tenant
 */
export type FeatureCheck = {
  enabled: boolean;
  feature_code: string;
  reason?: string;
  expires_at?: Date | null;
  config?: Record<string, any>;
};

/**
 * Common feature codes used across the system.
 * These values are stored in the DB (tenant_features.feature_code) and MUST
 * stay in sync with:
 *   - packages/core/enums.ts FeatureCode
 *   - apps/api/src/http/controllers/TenantsController.ts PLAN_FEATURE_MAP
 *   - apps/pos-terminal-web/src/pages/marketplace.tsx catalogs
 */
export const FEATURE_CODES = {
  // Printing features
  KITCHEN_PRINTER: "kitchen_printer",
  RECEIPT_PRINTER: "receipt_printer",
  LABEL_PRINTER: "label_printer",

  // Kitchen features
  KITCHEN_TICKET: "kitchen_ticket",         // KOT sent to kitchen on order confirm
  KITCHEN_DISPLAY: "kitchen_display",       // KDS screen for kitchen staff
  ORDER_NOTIFICATIONS: "order_notifications",

  // POS features
  PRODUCT_VARIANTS: "product_variants",
  /** @deprecated Use PRODUCT_VARIANTS */
  MULTI_VARIANT: "product_variants",
  INVENTORY_TRACKING: "inventory_tracking",
  PARTIAL_PAYMENT: "partial_payment",
  /** @deprecated Use PARTIAL_PAYMENT */
  PARTIAL_PAYMENTS: "partial_payment",
  DISCOUNTS: "discounts",
  ORDER_QUEUE: "order_queue",
  BARCODE_SCANNER: "barcode_scanner",

  // Reporting features
  SALES_REPORTS: "sales_reports",
  INVENTORY_REPORTS: "inventory_reports",
  ANALYTICS_DASHBOARD: "analytics_dashboard",

  // UI features
  DARK_MODE: "dark_mode",
  CUSTOM_BRANDING: "custom_branding",

  // Integration features
  PAYMENT_GATEWAY: "payment_gateway",
  ACCOUNTING_SYNC: "accounting_sync",
  API_INTEGRATION: "api_integration",
  ONLINE_BOOKING: "online_booking",
  CALENDAR_SYNC: "calendar_sync",
} as const;

export type FeatureCode = typeof FEATURE_CODES[keyof typeof FEATURE_CODES];
