# Plan Modal Inherited Feature Summary Prompt

## Goal

Update the Marketplace plan modal so higher-tier plans summarize inherited lower-tier features instead of repeating every lower-tier entitlement line.

## Expected UX

Starter:

```txt
Stok Dasar
DP / Bayar Sebagian
```

Growth:

```txt
Semua fitur Starter
Antrian Order
Kitchen Display (KDS)
Laporan Lanjutan
```

Pro:

```txt
Semua fitur Growth
Stok Lanjutan
Multi Payment
Split Bill
Ekspor Laporan
Multi Lokasi
Payment Gateway
API Access
```

## File

```txt
apps/pos-terminal-web/src/pages/marketplace.tsx
```

## Implementation

Keep cumulative entitlement logic for actual access checks.

Only change the plan modal presentation.

Add helpers near PLAN_ORDER:

```ts
function previousPlanCode(planCode: PlanCode): PlanCode | null {
  const index = PLAN_ORDER.indexOf(planCode);
  return index > 0 ? PLAN_ORDER[index - 1] : null;
}

function directPlanEntitlements(planCode: PlanCode): EntitlementCode[] {
  return [...ENTITLEMENT_CATALOG.plans[planCode].included] as EntitlementCode[];
}
```

In the plan modal mapping, replace:

```ts
const included = getPlanIncludedEntitlements(planCode);
```

with:

```ts
const inheritedPlanCode = previousPlanCode(planCode);
const inheritedPlan = inheritedPlanCode ? ENTITLEMENT_CATALOG.plans[inheritedPlanCode] : null;
const directIncluded = directPlanEntitlements(planCode);
```

Render first inherited summary when available:

```tsx
{inheritedPlan && (
  <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-100 px-2.5 py-1.5">
    <CheckCircle2 size={12} className="text-emerald-500" />
    <span className="text-xs font-bold text-slate-700">
      Semua fitur {inheritedPlan.label}
    </span>
  </div>
)}
```

Then render only `directIncluded` lines.

Do not change entitlement resolution.
Do not change plan included data.
Do not change marketplace cards.
Only change plan modal display.

## Commit

```bash
git commit -m "fix(marketplace): summarize inherited plan features"
```
