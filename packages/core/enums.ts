/**
 * Core Enums and Constants
 * Centralized type definitions used across all domains
 */

/**
 * BusinessType - Main business verticals supported by the POS system
 * 
 * Defines the primary business category which determines:
 * - Available features and modules
 * - Default order types
 * - UI/UX configurations
 */
export const BusinessType = {
  CAFE_RESTAURANT: 'CAFE_RESTAURANT',
  RETAIL_MINIMARKET: 'RETAIL_MINIMARKET',
  LAUNDRY: 'LAUNDRY',
  SERVICE_APPOINTMENT: 'SERVICE_APPOINTMENT',
  DIGITAL_PPOB: 'DIGITAL_PPOB',
} as const;

export type BusinessType = typeof BusinessType[keyof typeof BusinessType];

/**
 * OrderStatus - Order lifecycle states
 * 
 * Represents the current state of an order from creation to completion.
 * Matches schema.ts orders table status field.
 * - DRAFT: Order being created, not yet confirmed
 * - CONFIRMED: Order confirmed and sent to kitchen/processing
 * - PREPARING: Order is being prepared (kitchen/service in progress)
 * - READY: Order is ready for pickup/delivery
 * - COMPLETED: Order fulfilled and closed
 * - CANCELLED: Order cancelled by customer or staff
 */
export const OrderStatus = {
  DRAFT: 'draft',
  CONFIRMED: 'confirmed',
  PREPARING: 'preparing',
  READY: 'ready',
  /**
   * SERVED: Fulfillment milestone for dine-in pay-later flow.
   * Food has been delivered to the table; payment may still be pending.
   * Valid: served + unpaid (customer eating, will pay later).
   * Kitchen/KDS transitions stop here; cashier handles closing.
   */
  SERVED: 'served',
  /**
   * COMPLETED: Financial close - order is fully settled.
   * Requires payment_status = 'paid' (or manager override).
   * Sets closed_at timestamp.
   */
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export type OrderStatus = typeof OrderStatus[keyof typeof OrderStatus];

/**
 * PaymentStatus - Payment states for orders
 * 
 * Tracks the payment completion status:
 * - UNPAID: No payment received
 * - PARTIAL: Partial payment received (down payment scenario)
 * - PAID: Fully paid
 */
export const PaymentStatus = {
  UNPAID: 'unpaid',
  PARTIAL: 'partial',
  PAID: 'paid',
} as const;

export type PaymentStatus = typeof PaymentStatus[keyof typeof PaymentStatus];

/**
 * PaymentMethod - Available payment methods
 * 
 * Types of payment methods accepted by the system:
 * - CASH: Cash payment
 * - CARD: Credit/debit card payment
 * - EWALLET: Digital wallet (GoPay, OVO, DANA, etc.)
 * - OTHER: Other payment methods
 */
export const PaymentMethod = {
  CASH: 'cash',
  CARD: 'card',
  EWALLET: 'ewallet',
  OTHER: 'other',
} as const;

export type PaymentMethod = typeof PaymentMethod[keyof typeof PaymentMethod];

/**
 * OrderTypeCode - Order channel types
 * 
 * Defines how the order was placed and fulfillment method:
 * - DINE_IN: Customer dining in at the restaurant
 * - TAKE_AWAY: Customer picks up order to take away
 * - DELIVERY: Order delivered to customer address
 * - WALK_IN: Walk-in retail purchase (minimarket/retail)
 */
export const OrderTypeCode = {
  DINE_IN: 'DINE_IN',
  TAKE_AWAY: 'TAKE_AWAY',
  DELIVERY: 'DELIVERY',
  WALK_IN: 'WALK_IN',
} as const;

export type OrderTypeCode = typeof OrderTypeCode[keyof typeof OrderTypeCode];

/**
 * FeatureCode - Available feature codes
 * 
 * Feature flags that can be enabled/disabled per tenant.
 * Synchronized with FEATURE_CODES from packages/domain/tenants/types.ts
 * 
 * Printing features:
 * - KITCHEN_PRINTER: Kitchen ticket/order printing
 * - RECEIPT_PRINTER: Receipt printing for customers
 * - LABEL_PRINTER: Label printing for products/orders
 * 
 * Kitchen features:
 * - KITCHEN_DISPLAY: Kitchen display system (KDS)
 * - ORDER_NOTIFICATIONS: Real-time order notifications
 * 
 * POS features:
 * - MULTI_VARIANT: Product variant/options support
 * - INVENTORY_TRACKING: Inventory stock tracking
 * - PARTIAL_PAYMENTS: Allow partial/down payments
 * - DISCOUNTS: Discount and promotion support
 * 
 * Reporting features:
 * - SALES_REPORTS: Sales reporting and analytics
 * - INVENTORY_REPORTS: Inventory reports
 * - ANALYTICS_DASHBOARD: Advanced analytics dashboard
 * 
 * UI features:
 * - DARK_MODE: Dark mode theme support
 * - CUSTOM_BRANDING: Custom branding and theming
 * 
 * Integration features:
 * - PAYMENT_GATEWAY: Payment gateway integrations
 * - ACCOUNTING_SYNC: Accounting system synchronization
 */
export const FeatureCode = {
  // Printing features
  KITCHEN_PRINTER: 'kitchen_printer',
  RECEIPT_PRINTER: 'receipt_printer',
  LABEL_PRINTER: 'label_printer',
  
  // Kitchen features
  KITCHEN_DISPLAY: 'kitchen_display',
  ORDER_NOTIFICATIONS: 'order_notifications',
  
  // Kitchen ticket descriptor (gated via restaurant_kitchen_ops entitlement)
  KITCHEN_TICKET: 'kitchen_ticket',

  // POS features
  PRODUCT_VARIANTS: 'product_variants',
  /** @deprecated Use PRODUCT_VARIANTS — kept for backward compatibility */
  MULTI_VARIANT: 'product_variants',
  INVENTORY_TRACKING: 'inventory_tracking',
  PARTIAL_PAYMENT: 'partial_payment',
  /** @deprecated Use PARTIAL_PAYMENT — kept for backward compatibility */
  PARTIAL_PAYMENTS: 'partial_payment',
  DISCOUNTS: 'discounts',
  ORDER_QUEUE: 'order_queue',
  BARCODE_SCANNER: 'barcode_scanner',
  
  // Reporting features
  SALES_REPORTS: 'sales_reports',
  INVENTORY_REPORTS: 'inventory_reports',
  ANALYTICS_DASHBOARD: 'analytics_dashboard',
  
  // UI features
  DARK_MODE: 'dark_mode',
  CUSTOM_BRANDING: 'custom_branding',
  
  // Integration features
  PAYMENT_GATEWAY: 'payment_gateway',
  ACCOUNTING_SYNC: 'accounting_sync',
  API_INTEGRATION: 'api_integration',
  ONLINE_BOOKING: 'online_booking',
  CALENDAR_SYNC: 'calendar_sync',
} as const;

export type FeatureCode = typeof FeatureCode[keyof typeof FeatureCode];

/**
 * Helper type to extract enum values as a readonly array
 */
export type EnumValues<T> = T[keyof T];
