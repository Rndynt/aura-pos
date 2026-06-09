# AuraPOS - Business Type Templates

This document describes the different business types supported by AuraPOS and their default configurations. Each business type has a specific set of features, order types, and module configurations that are optimized for that industry.

> Phase 1B note: commercial entitlement defaults now come from `packages/application/entitlements/entitlementCatalog.ts`. Legacy feature examples in this document are historical onboarding/module guidance and must not be treated as independent commercial entitlement codes. Inventory report access is covered by `inventory_advanced_stock`, not a separate `inventory_reports` entitlement.

## Overview

AuraPOS supports 5 main business types:

1. **CAFE_RESTAURANT** - Cafes, Restaurants, F&B
2. **RETAIL_MINIMARKET** - Retail stores, Minimarkets, Convenience stores
3. **LAUNDRY** - Laundry services, Dry cleaning
4. **SERVICE_APPOINTMENT** - Salons, Barbershops, Spa, Service-based businesses
5. **DIGITAL_PPOB** - Digital services, PPOB, Bill payments

---

## Registration Defaults

Public owner registration (`POST /api/register`) is the canonical production tenant onboarding endpoint. It creates the tenant together with baseline data for the selected business type:

- one active default outlet named `Cabang Utama` with slug `main`;
- one `tenant_module_configs` row using the module flags from the business type template;
- plan-default/free `tenant_features` rows from the selected business type template;
- enabled `tenant_order_types` rows for the selected business type template, after validating the referenced order types are already seeded;
- starter `product_categories` and `products` rows so the new tenant has an initial editable catalog;
- an owner user link (`tenant_id`, role `owner`) and an owner assignment to the default outlet.

`POST /api/tenants/register` is deprecated for tenant onboarding because it does not create the owner-backed onboarding baseline. New clients should use `POST /api/register`; legacy clients receive a deprecation response with `location: /api/register`.

Because Better Auth owns its user/account/session writes outside the tenant transaction boundary, registration uses compensating cleanup if a failure happens after the Better Auth user is created. Cleanup removes Better Auth session, account, and user rows plus tenant-owned registration data so duplicate email, duplicate slug, missing order-type seed, and post-auth failures do not leave partially usable tenants.

## 1. CAFE_RESTAURANT

### Description
For food and beverage businesses including cafes, restaurants, food courts, and similar establishments.

### Default Order Types
- `DINE_IN` - Customer dining at the restaurant
- `TAKE_AWAY` - Customer picks up order
- `DELIVERY` - Order delivered to customer

### Enabled Modules
| Module | Enabled | Description |
|--------|---------|-------------|
| Table Management | Yes | Table seating and layout |
| Kitchen Ticket | Yes | Kitchen display system |
| Loyalty | No | Customer loyalty program |
| Delivery | Yes | Delivery order management |
| Inventory | No | Stock tracking (premium) |
| Appointments | No | Not applicable |
| Multi Location | No | Single location by default |

### Default Features (Free Tier)
- `kitchen_printer` - Print kitchen tickets
- `receipt_printer` - Print customer receipts
- `kitchen_display` - Kitchen Display System (KDS)
- `order_notifications` - Real-time order notifications
- `multi_variant` - Product variants (sizes, add-ons)
- `discounts` - Discount and promotions
- `sales_reports` - Basic sales reporting
- `partial_payments` - Accept partial payments/deposits

### Default Settings
```json
{
  "default_tax_rate": 0.1,
  "default_service_charge_rate": 0.05,
  "enable_tips": true
}
```

### Setup Script
```bash
#!/bin/bash
# Setup for Cafe/Restaurant business

export BUSINESS_TYPE="CAFE_RESTAURANT"
export DEFAULT_ORDER_TYPES="DINE_IN,TAKE_AWAY,DELIVERY"
export ENABLE_TABLE_MANAGEMENT=true
export ENABLE_KITCHEN_TICKET=true
export DEFAULT_TAX_RATE=0.1
export DEFAULT_SERVICE_CHARGE=0.05

echo "Setting up $BUSINESS_TYPE..."
# Run seed with restaurant defaults
npm run db:seed -- --business-type=$BUSINESS_TYPE
```

---

## 2. RETAIL_MINIMARKET

### Description
For retail businesses including minimarkets, convenience stores, grocery shops, and general merchandise.

### Default Order Types
- `WALK_IN` - Walk-in purchase (immediate checkout)

### Enabled Modules
| Module | Enabled | Description |
|--------|---------|-------------|
| Table Management | No | Not applicable |
| Kitchen Ticket | No | Not applicable |
| Loyalty | Yes | Customer loyalty points |
| Delivery | No | No delivery by default |
| Inventory | Yes | Stock tracking |
| Appointments | No | Not applicable |
| Multi Location | No | Single location by default |

### Default Features (Free Tier)
- `receipt_printer` - Print receipts
- `inventory_tracking` - Stock management
- `discounts` - Promotions and discounts
- `sales_reports` - Sales analytics
- `inventory_reports` - Inventory reports
- `multi_variant` - Product variants (colors, sizes)

### Default Settings
```json
{
  "default_tax_rate": 0.1,
  "enable_barcode_scanner": true,
  "low_stock_alert_enabled": true
}
```

### Module Configuration
```json
{
  "inventory_tracking_mode": "automatic",
  "low_stock_threshold": 10
}
```

### Setup Script
```bash
#!/bin/bash
# Setup for Retail/Minimarket business

export BUSINESS_TYPE="RETAIL_MINIMARKET"
export DEFAULT_ORDER_TYPES="WALK_IN"
export ENABLE_INVENTORY=true
export ENABLE_LOYALTY=true
export DEFAULT_TAX_RATE=0.1

echo "Setting up $BUSINESS_TYPE..."
npm run db:seed -- --business-type=$BUSINESS_TYPE
```

---

## 3. LAUNDRY

### Description
For laundry services including dry cleaning, wash-and-fold, and laundry pickup/delivery services.

### Default Order Types
- `WALK_IN` - Customer drops off at store
- `DELIVERY` - Pickup and delivery service

### Enabled Modules
| Module | Enabled | Description |
|--------|---------|-------------|
| Table Management | No | Not applicable |
| Kitchen Ticket | No | Not applicable |
| Loyalty | Yes | Customer rewards |
| Delivery | Yes | Pickup and delivery |
| Inventory | No | Not applicable |
| Appointments | No | Walk-in based |
| Multi Location | No | Single location by default |

### Default Features (Free Tier)
- `receipt_printer` - Print receipts
- `label_printer` - Print item labels/tags
- `order_notifications` - SMS/Push notifications for pickup
- `discounts` - Promotional discounts
- `sales_reports` - Revenue reports

### Default Settings
```json
{
  "default_tax_rate": 0.1,
  "enable_item_tagging": true,
  "default_turnaround_days": 3
}
```

### Module Configuration
```json
{
  "tag_label_printer_enabled": true,
  "pickup_reminder_enabled": true
}
```

### Recommended Menu Categories
- Cuci Kering (Dry Clean)
- Cuci Setrika (Wash & Iron)
- Setrika Saja (Iron Only)
- Cuci Sepatu (Shoe Cleaning)
- Cuci Tas (Bag Cleaning)
- Express Service

### Setup Script
```bash
#!/bin/bash
# Setup for Laundry business

export BUSINESS_TYPE="LAUNDRY"
export DEFAULT_ORDER_TYPES="WALK_IN,DELIVERY"
export ENABLE_DELIVERY=true
export ENABLE_LOYALTY=true
export DEFAULT_TURNAROUND_DAYS=3

echo "Setting up $BUSINESS_TYPE..."
npm run db:seed -- --business-type=$BUSINESS_TYPE
```

---

## 4. SERVICE_APPOINTMENT

### Description
For service-based businesses including salons, barbershops, spas, massage, and any appointment-based services.

### Default Order Types
- `WALK_IN` - Walk-in customers

### Enabled Modules
| Module | Enabled | Description |
|--------|---------|-------------|
| Table Management | No | Not applicable |
| Kitchen Ticket | No | Not applicable |
| Loyalty | Yes | Customer loyalty |
| Delivery | No | Not applicable |
| Inventory | No | Limited inventory needs |
| Appointments | Yes | Appointment scheduling |
| Multi Location | No | Single location by default |

### Default Features (Free Tier)
- `receipt_printer` - Print receipts
- `order_notifications` - Appointment reminders
- `discounts` - Promotional offers
- `sales_reports` - Revenue tracking
- `partial_payments` - Deposit/down payments

### Default Settings
```json
{
  "default_tax_rate": 0.1,
  "appointment_duration_minutes": 60,
  "booking_buffer_minutes": 15
}
```

### Module Configuration
```json
{
  "online_booking_enabled": true,
  "calendar_sync_enabled": false
}
```

### Recommended Service Categories
- Haircut / Potong Rambut
- Coloring / Pewarnaan
- Treatment / Perawatan
- Spa & Massage
- Nail Service / Manicure Pedicure
- Makeup

### Setup Script
```bash
#!/bin/bash
# Setup for Service/Appointment business

export BUSINESS_TYPE="SERVICE_APPOINTMENT"
export DEFAULT_ORDER_TYPES="WALK_IN"
export ENABLE_APPOINTMENTS=true
export ENABLE_LOYALTY=true
export DEFAULT_TAX_RATE=0.1

echo "Setting up $BUSINESS_TYPE..."
npm run db:seed -- --business-type=$BUSINESS_TYPE
```

---

## 5. DIGITAL_PPOB

### Description
For digital service businesses including PPOB (Payment Point Online Bank), pulsa/data top-up, bill payments, and similar digital services.

### Default Order Types
- `WALK_IN` - Instant transactions

### Enabled Modules
| Module | Enabled | Description |
|--------|---------|-------------|
| Table Management | No | Not applicable |
| Kitchen Ticket | No | Not applicable |
| Loyalty | No | Minimal customer retention |
| Delivery | No | Digital delivery |
| Inventory | No | No physical inventory |
| Appointments | No | Instant service |
| Multi Location | Yes | Agent network support |

### Default Features (Free Tier)
- `receipt_printer` - Transaction receipts
- `sales_reports` - Transaction reports
- `payment_gateway` - Payment integrations
- `analytics_dashboard` - Advanced analytics

### Default Settings
```json
{
  "enable_digital_receipts": true,
  "auto_process_enabled": true
}
```

### Module Configuration
```json
{
  "api_integration_enabled": true,
  "transaction_fee_mode": "percentage"
}
```

### Recommended Product Categories
- Pulsa & Paket Data
- Token PLN
- PDAM / Air
- BPJS Kesehatan
- Tagihan Listrik
- E-Money Top Up

### Setup Script
```bash
#!/bin/bash
# Setup for Digital/PPOB business

export BUSINESS_TYPE="DIGITAL_PPOB"
export DEFAULT_ORDER_TYPES="WALK_IN"
export ENABLE_MULTI_LOCATION=true
export ENABLE_PAYMENT_GATEWAY=true

echo "Setting up $BUSINESS_TYPE..."
npm run db:seed -- --business-type=$BUSINESS_TYPE
```

---

## Feature Flags Reference

### Premium Features (Subscription/One-Time Purchase)

| Feature Code | Type | Description | Applicable Business Types |
|-------------|------|-------------|--------------------------|
| `kitchen_display` | Subscription | Kitchen Display System | CAFE_RESTAURANT |
| `inventory_tracking` | Subscription | Stock Management | RETAIL_MINIMARKET |
| `analytics_dashboard` | Subscription | Advanced Analytics | All |
| `payment_gateway` | Subscription | Payment Integrations | All |
| `multi_variant` | Subscription | Product Variants | CAFE_RESTAURANT, RETAIL |
| `partial_payments` | Subscription | Down Payments | CAFE_RESTAURANT, SERVICE |
| `dark_mode` | One-Time | Dark Theme | All |
| `custom_branding` | One-Time | Custom Branding | All |

### Module Configuration Keys

| Key | Type | Description |
|-----|------|-------------|
| `enable_table_management` | boolean | Enable table/seating management |
| `enable_kitchen_ticket` | boolean | Enable kitchen ticket printing |
| `enable_loyalty` | boolean | Enable loyalty points |
| `enable_delivery` | boolean | Enable delivery orders |
| `enable_inventory` | boolean | Enable inventory tracking |
| `enable_appointments` | boolean | Enable appointment scheduling |
| `enable_multi_location` | boolean | Enable multi-location support |

---

## Quick Start Guide

### 1. Create New Tenant

```typescript
import { CreateTenant } from '@pos/application/tenants';
import { BusinessType } from '@pos/core';

const createTenant = new CreateTenant(tenantRepo, featureRepo, orderTypeRepo);

await createTenant.execute({
  name: 'My Business',
  slug: 'my-business',
  business_name: 'My Business LLC',
  business_type: BusinessType.CAFE_RESTAURANT,
});
```

### 2. Get Business Type Template

```typescript
import { getBusinessTypeTemplate } from '@pos/application/tenants/businessTypeTemplates';
import { BusinessType } from '@pos/core';

const template = getBusinessTypeTemplate(BusinessType.LAUNDRY);
console.log(template.orderTypes); // ['WALK_IN', 'DELIVERY']
console.log(template.features);   // Array of default features
```

### 3. Check Feature Access

```typescript
import { CheckFeatureAccess } from '@pos/application/tenants';

const checkFeature = new CheckFeatureAccess(featureRepo);
const result = await checkFeature.execute({
  tenant_id: 'tenant-123',
  feature_code: 'kitchen_display',
});

if (result.enabled) {
  // Feature is available
}
```

---

## Notes

- All business types start with the **Free** plan tier
- Premium features can be enabled through subscription or one-time purchase
- Module configurations can be customized per tenant
- Order types can be added/removed based on business needs
- Feature flags should always be checked before showing UI elements
