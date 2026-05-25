/**
 * Business Type Templates
 * Defines default configurations for each business type
 */

import type { BusinessType, OrderTypeCode, FeatureCode } from '@pos/core';
import type { TenantModuleConfig } from '@pos/domain/tenants/types';

/**
 * Template for a business type containing all default settings
 */
export type BusinessTypeTemplate = {
  // Default tenant settings
  tenantDefaults: {
    plan_tier: 'free' | 'starter' | 'professional' | 'enterprise';
    subscription_status: 'active' | 'trial' | 'suspended' | 'cancelled';
    settings: Record<string, any>;
  };
  
  // Default module configuration
  moduleConfig: Omit<TenantModuleConfig, 'tenant_id' | 'updated_at'>;
  
  // Default features to enable
  features: Array<{
    feature_code: FeatureCode;
    source: 'plan_default' | 'purchase' | 'manual_grant' | 'trial';
    is_active: boolean;
  }>;
  
  // Default order types to enable
  orderTypes: OrderTypeCode[];
};

/**
 * Template map keyed by business type
 */
export const BUSINESS_TYPE_TEMPLATES: Record<BusinessType, BusinessTypeTemplate> = {
  CAFE_RESTAURANT: {
    tenantDefaults: {
      plan_tier: 'free',
      subscription_status: 'trial',
      settings: {
        default_tax_rate: 0.1,
        default_service_charge_rate: 0.05,
        enable_tips: true,
      },
    },
    moduleConfig: {
      enable_table_management: true,
      enable_kitchen_ticket: true,
      enable_loyalty: false,
      enable_delivery: true,
      enable_inventory: false,
      enable_inventory_advanced: false,
      enable_appointments: false,
      enable_multi_location: false,
      config: {
        kitchen_display_auto_refresh: true,
        table_layout_enabled: true,
      },
    },
    features: [
      { feature_code: 'kitchen_ticket', source: 'plan_default', is_active: true },
      { feature_code: 'kitchen_printer', source: 'plan_default', is_active: true },
      { feature_code: 'kitchen_display', source: 'plan_default', is_active: true },
      { feature_code: 'receipt_printer', source: 'plan_default', is_active: true },
      { feature_code: 'order_notifications', source: 'plan_default', is_active: true },
      { feature_code: 'order_queue', source: 'plan_default', is_active: true },
      { feature_code: 'product_variants', source: 'plan_default', is_active: true },
      { feature_code: 'partial_payment', source: 'plan_default', is_active: true },
      { feature_code: 'discounts', source: 'plan_default', is_active: true },
      { feature_code: 'sales_reports', source: 'plan_default', is_active: true },
    ],
    orderTypes: ['DINE_IN', 'TAKE_AWAY', 'DELIVERY'],
  },

  RETAIL_MINIMARKET: {
    tenantDefaults: {
      plan_tier: 'free',
      subscription_status: 'trial',
      settings: {
        default_tax_rate: 0.1,
        enable_barcode_scanner: true,
        low_stock_alert_enabled: true,
      },
    },
    moduleConfig: {
      enable_table_management: false,
      enable_kitchen_ticket: false,
      enable_loyalty: true,
      enable_delivery: false,
      enable_inventory: true,
      enable_inventory_advanced: true,
      enable_appointments: false,
      enable_multi_location: false,
      config: {
        inventory_tracking_mode: 'automatic',
        low_stock_threshold: 10,
      },
    },
    features: [
      { feature_code: 'receipt_printer', source: 'plan_default', is_active: true },
      { feature_code: 'order_queue', source: 'plan_default', is_active: true },
      { feature_code: 'product_variants', source: 'plan_default', is_active: true },
      { feature_code: 'partial_payment', source: 'plan_default', is_active: true },
      { feature_code: 'inventory_tracking', source: 'plan_default', is_active: true },
      { feature_code: 'discounts', source: 'plan_default', is_active: true },
      { feature_code: 'sales_reports', source: 'plan_default', is_active: true },
      { feature_code: 'inventory_reports', source: 'plan_default', is_active: true },
    ],
    orderTypes: ['WALK_IN'],
  },

  LAUNDRY: {
    tenantDefaults: {
      plan_tier: 'free',
      subscription_status: 'trial',
      settings: {
        default_tax_rate: 0.1,
        enable_item_tagging: true,
        default_turnaround_days: 3,
      },
    },
    moduleConfig: {
      enable_table_management: false,
      enable_kitchen_ticket: false,
      enable_loyalty: true,
      enable_delivery: true,
      enable_inventory: false,
      enable_inventory_advanced: false,
      enable_appointments: false,
      enable_multi_location: false,
      config: {
        tag_label_printer_enabled: true,
        pickup_reminder_enabled: true,
      },
    },
    features: [
      { feature_code: 'receipt_printer', source: 'plan_default', is_active: true },
      { feature_code: 'order_queue', source: 'plan_default', is_active: true },
      { feature_code: 'label_printer', source: 'plan_default', is_active: true },
      { feature_code: 'order_notifications', source: 'plan_default', is_active: true },
      { feature_code: 'discounts', source: 'plan_default', is_active: true },
      { feature_code: 'sales_reports', source: 'plan_default', is_active: true },
    ],
    orderTypes: ['WALK_IN', 'DELIVERY'],
  },

  SERVICE_APPOINTMENT: {
    tenantDefaults: {
      plan_tier: 'free',
      subscription_status: 'trial',
      settings: {
        default_tax_rate: 0.1,
        appointment_duration_minutes: 60,
        booking_buffer_minutes: 15,
      },
    },
    moduleConfig: {
      enable_table_management: false,
      enable_kitchen_ticket: false,
      enable_loyalty: true,
      enable_delivery: false,
      enable_inventory: false,
      enable_inventory_advanced: false,
      enable_appointments: true,
      enable_multi_location: false,
      config: {
        online_booking_enabled: true,
        calendar_sync_enabled: false,
      },
    },
    features: [
      { feature_code: 'receipt_printer', source: 'plan_default', is_active: true },
      { feature_code: 'order_notifications', source: 'plan_default', is_active: true },
      { feature_code: 'order_queue', source: 'plan_default', is_active: true },
      { feature_code: 'product_variants', source: 'plan_default', is_active: true },
      { feature_code: 'partial_payment', source: 'plan_default', is_active: true },
      { feature_code: 'discounts', source: 'plan_default', is_active: true },
      { feature_code: 'sales_reports', source: 'plan_default', is_active: true },
    ],
    orderTypes: ['WALK_IN'],
  },

  DIGITAL_PPOB: {
    tenantDefaults: {
      plan_tier: 'free',
      subscription_status: 'trial',
      settings: {
        enable_digital_receipts: true,
        auto_process_enabled: true,
      },
    },
    moduleConfig: {
      enable_table_management: false,
      enable_kitchen_ticket: false,
      enable_loyalty: false,
      enable_delivery: false,
      enable_inventory: false,
      enable_inventory_advanced: false,
      enable_appointments: false,
      enable_multi_location: true,
      config: {
        api_integration_enabled: true,
        transaction_fee_mode: 'percentage',
      },
    },
    features: [
      { feature_code: 'receipt_printer', source: 'plan_default', is_active: true },
      { feature_code: 'order_queue', source: 'plan_default', is_active: true },
      { feature_code: 'sales_reports', source: 'plan_default', is_active: true },
      { feature_code: 'payment_gateway', source: 'plan_default', is_active: true },
      { feature_code: 'analytics_dashboard', source: 'plan_default', is_active: true },
    ],
    orderTypes: ['WALK_IN'],
  },
};

/**
 * Get business type template by business type
 * @param businessType - The business type
 * @returns The template for the business type
 * @throws Error if business type is not found
 */
export function getBusinessTypeTemplate(businessType: BusinessType): BusinessTypeTemplate {
  const template = BUSINESS_TYPE_TEMPLATES[businessType];
  
  if (!template) {
    throw new Error(`No template found for business type: ${businessType}`);
  }
  
  return template;
}
