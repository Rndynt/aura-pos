/**
 * Canonical mapping of plan tier → allowed feature codes.
 * Single source of truth for registrationService + TenantsController.
 */
export const PLAN_FEATURE_MAP: Record<string, string[]> = {
  free: [
    'product_variants', 'partial_payment', 'discounts', 'order_queue',
    'receipt_printer', 'sales_reports',
  ],
  growth: [
    'product_variants', 'partial_payment', 'discounts', 'order_queue',
    'receipt_printer', 'sales_reports',
    'kitchen_ticket', 'kitchen_display', 'kitchen_printer',
    'order_notifications', 'analytics_dashboard',
    'label_printer', 'barcode_scanner',
    'inventory_tracking', 'inventory_reports',
    'dark_mode', 'custom_branding', 'accounting_sync',
  ],
  pro: [
    'product_variants', 'partial_payment', 'discounts', 'order_queue',
    'receipt_printer', 'sales_reports',
    'kitchen_ticket', 'kitchen_display', 'kitchen_printer',
    'order_notifications', 'analytics_dashboard',
    'label_printer', 'barcode_scanner',
    'inventory_tracking', 'inventory_reports',
    'dark_mode', 'custom_branding', 'accounting_sync',
    'payment_gateway', 'api_integration', 'online_booking', 'calendar_sync',
  ],
};
