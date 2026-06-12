# Tenant Entitlements (Frontend)

Commercial access on the frontend is driven entirely by **effective entitlements**
resolved from the entitlement single source of truth (SOT):

```
packages/application/entitlements/entitlementCatalog.ts
```

There is **no** frontend plan/module/feature catalog, and no legacy
feature/module table concept. The backend computes effective entitlements
(cumulative plan + business-type defaults + active grants) and exposes them at:

```
GET /api/me/entitlements
```

## `useEntitlements()` / `useTenant().can()`

Use the `can(entitlementCode)` helper to gate UI:

```tsx
import { useTenant } from "@/context/TenantContext";

function Example() {
  const { can, isLoading } = useTenant();
  if (isLoading) return null;

  return (
    <div>
      {can("restaurant_table_service") && <TablesMenu />}
      {can("restaurant_kitchen_ops") && <KitchenMenu />}
      {can("inventory_basic_stock") && <StockList />}
      {can("inventory_advanced_stock") && <StockMovements />}
      {can("reports_advanced") && <AnalyticsDashboard />}
      {can("multi_location") && <OutletsMenu />}
    </div>
  );
}
```

For the full entitlement map, grants, and catalog, use the hook directly:

```tsx
import { useEntitlements } from "@/hooks/api/useEntitlements";

const { can, entitlements, grants, catalog, tenant } = useEntitlements();
```

## Base vs commercial

Base POS operations are **never** gated commercially and must always render:

- Catalog / products / categories CRUD (incl. product variants)
- Order open / create / cancel / void / refund lifecycle
- Cash / manual payment behavior
- Standard receipt / reprint behavior

Only commercial entitlement codes from the SOT may gate UI. See the catalog for
the canonical list (e.g. `inventory_basic_stock`, `inventory_advanced_stock`,
`orders_queue`, `restaurant_table_service`, `restaurant_kitchen_ops`,
`reports_advanced`, `reports_export`, `multi_location`, `payments_partial_payment`,
`hardware_label_printer`, `hardware_barcode_scanner`, `integrations_*`).
