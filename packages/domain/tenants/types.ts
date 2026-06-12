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
 * Common feature codes historically referenced across the legacy POS UI. These
 * are descriptive constants only — commercial access is governed exclusively by
 * the entitlement SOT (packages/application/entitlements).
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
