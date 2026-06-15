# Entitlement Phase 2 Bundle UI Patch — Replit Agent Prompt

## Context

Phase 2 final implementation has moved AuraPoS to the new entitlement model:

```txt
packages/application/entitlements/entitlementCatalog.ts
GET /api/me/entitlements
frontend useEntitlements()/can()
tenant_entitlements as the only tenant grant table
```

The old frontend `featureCatalog.ts` has been removed, and active frontend gating must use entitlement codes only.

However, the marketplace currently does not show the bundle chips that used to exist in the older marketplace UI. Example expected chips for the Kitchen module:

```txt
Tiket Dapur
Layar KDS
Printer Dapur
```

These bundle chips are UI metadata only. They must not become entitlements, offers, grants, plan entries, or database rows.

## Goal

Restore marketplace bundle chip display using SOT metadata, not local hardcode.

Final behavior:

```txt
restaurant_kitchen_ops = one commercial entitlement
Tiket Dapur / Layar KDS / Printer Dapur = display-only bundle chips from SOT
```

## Important existing state

Before editing, inspect the latest files:

```txt
packages/application/entitlements/entitlementCatalog.ts
apps/pos-terminal-web/src/pages/marketplace.tsx
apps/pos-terminal-web/src/hooks/api/useEntitlements.ts
apps/pos-terminal-web/src/context/TenantContext.tsx
apps/pos-terminal-web/src/lib/entitlementIcons.ts
```

`entitlementCatalog.ts` may already contain `bundleItems` on some entitlement entries. If yes, preserve and use them. If not, add them as described below.

## Non-negotiable rules

Do not recreate `apps/pos-terminal-web/src/lib/featureCatalog.ts`.

Do not recreate:

```txt
MODULE_CATALOG_DATA
FEATURE_CATALOG_DATA
MODULE_REQUIRED_PLAN
FEATURE_REQUIRED_PLAN
PLAN_RANK as frontend SOT
moduleConfig gating
hasModule
hasFeature
activeFeatures
tenant_features
tenant_module_configs
```

Do not add child bundle items as actual entitlement codes.

Do not add these as entries in `ENTITLEMENT_CATALOG.entitlements`:

```txt
kitchen_ticket
kitchen_display
kitchen_printer
inventory_tracking
inventory_reports
analytics_dashboard
receipt_printer
product_variants
discounts
```

Do not add child bundle items into:

```txt
plans[*].included
offers
tenant_entitlements
route guards
DB migrations
```

Child bundle items are labels only.

## SOT update

In:

```txt
packages/application/entitlements/entitlementCatalog.ts
```

Ensure entitlement entries support optional `bundleItems`:

```ts
bundleItems: [
  { label: 'Tiket Dapur' },
  { label: 'Layar KDS' },
  { label: 'Printer Dapur' },
]
```

Add/verify these bundle metadata entries:

### inventory_advanced_stock

```txt
Mutasi Stok
Opname
Transfer Stok
Low Stock Alert
Laporan Stok
```

### restaurant_table_service

```txt
Denah Meja
Status Meja
Order per Meja
```

### restaurant_kitchen_ops

```txt
Tiket Dapur
Layar KDS
Printer Dapur
```

### reports_advanced

```txt
Analitik Penjualan
Performa Kasir
Ringkasan Bisnis
```

### multi_location

```txt
Cabang
Stok Cabang
Laporan Cabang
```

Keep these labels only under the parent commercial entitlement. Do not define them as standalone commercial entitlement keys.

If useful, export a type:

```ts
export type EntitlementBundleItem = { label: string };
```

But do not create another SOT file.

## Marketplace update

In:

```txt
apps/pos-terminal-web/src/pages/marketplace.tsx
```

Update `EntitlementRow` to include:

```ts
bundleItems: Array<{ label: string }>;
```

Update `buildEntitlementRows()` so it reads:

```ts
bundleItems: [...(meta.bundleItems ?? [])]
```

from `ENTITLEMENT_CATALOG.entitlements[code]`.

Add a small rendering helper:

```tsx
function BundleChips({ items }: { items: Array<{ label: string }> }) {
  if (!items.length) return null;
  return (
    <div data-testid="bundle-chips" className="flex flex-wrap gap-1.5 mt-3">
      {items.map((item) => (
        <span key={item.label} className="...">
          {item.label}
        </span>
      ))}
    </div>
  );
}
```

Style should match the current marketplace visual language: small rounded chips, light background, border, slate text.

Render bundle chips in two places:

```txt
1. Marketplace card under the short description.
2. Detail drawer under the long description.
```

For Kitchen Display / restaurant_kitchen_ops, the UI must visibly show:

```txt
Tiket Dapur
Layar KDS
Printer Dapur
```

The chips should come from SOT metadata only.

## Expected behavior

When `restaurant_kitchen_ops` appears in marketplace:

```txt
Card title: Kitchen Display (KDS) or Operasional Dapur, depending SOT label
Description: kitchen operations description from SOT
Bundle chips: Tiket Dapur, Layar KDS, Printer Dapur
```

When the card is opened:

```txt
Detail drawer long description from SOT
Bundle chips repeated below long description
Activation/upgrade button unchanged
```

For `inventory_advanced_stock`, show chips such as:

```txt
Mutasi Stok
Opname
Transfer Stok
Low Stock Alert
Laporan Stok
```

For parents without `bundleItems`, render no chip section.

## Tests

Add or update focused tests if test infrastructure allows.

Required test intent:

```txt
1. restaurant_kitchen_ops has bundleItems in entitlementCatalog.
2. kitchen bundle labels are not entitlement keys.
3. marketplace row builder reads bundleItems from SOT.
4. bundle chips render Tiket Dapur / Layar KDS / Printer Dapur.
5. no `featureCatalog.ts` is recreated.
6. no MODULE_CATALOG_DATA / FEATURE_CATALOG_DATA / MODULE_REQUIRED_PLAN / FEATURE_REQUIRED_PLAN is reintroduced.
```

If component render tests are hard in current setup, add a pure test for the SOT/row builder, or document limitation in the report.

## Audit commands

Run:

```bash
rg -n "featureCatalog|MODULE_CATALOG_DATA|FEATURE_CATALOG_DATA|MODULE_REQUIRED_PLAN|FEATURE_REQUIRED_PLAN|PLAN_RANK|moduleConfig|activeFeatures|hasModule|hasFeature|TenantModuleConfig|TenantFeature|FEATURE_CODES" apps packages shared

rg -n "kitchen_ticket|kitchen_display|kitchen_printer|inventory_tracking|inventory_reports|analytics_dashboard|receipt_printer|product_variants|discounts" apps packages shared
```

Expected:

```txt
- No active old gating system is reintroduced.
- Kitchen child labels may exist only as bundle label metadata, not entitlement keys, route guards, offers, or DB records.
```

## Validation commands

Run at minimum:

```bash
pnpm --filter @pos/application type-check
pnpm --filter @pos/terminal-web type-check
pnpm type-check
```

If available and not too slow:

```bash
pnpm check:boundaries
pnpm run db:check
pnpm --filter @pos/api test
```

## Required report

Create:

```txt
roadmap/entitlement/phase_2_bundle_ui_patch_report.md
```

Report format:

```md
# Entitlement Phase 2 Bundle UI Patch Report

## Summary

## SOT bundle metadata
- inventory_advanced_stock bundleItems: yes/no
- restaurant_table_service bundleItems: yes/no
- restaurant_kitchen_ops bundleItems: yes/no
- reports_advanced bundleItems: yes/no
- multi_location bundleItems: yes/no

## Marketplace rendering
- Card chips render from SOT: yes/no
- Detail drawer chips render from SOT: yes/no
- Kitchen chips visible: yes/no

## Safety checks
- Child bundle labels are not entitlement keys: yes/no
- No featureCatalog.ts recreated: yes/no
- No old module/feature gating reintroduced: yes/no

## Tests

## Commands run

## Remaining blockers
```

## Commit

Use commit message:

```bash
git commit -m "fix(marketplace): render entitlement bundle chips from SOT"
```

Then push.

## Final response required

Return:

```txt
Bundle UI patch status:
Commit SHA:
Files changed:
SOT bundleItems added: yes/no
Kitchen bundle chips visible: yes/no
Marketplace card chips from SOT: yes/no
Marketplace detail chips from SOT: yes/no
Child bundle labels are not entitlements: yes/no
featureCatalog not recreated: yes/no
Tests/commands run:
Remaining blockers:
```
