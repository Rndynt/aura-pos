# Replit/Codex Prompt — Migrate AuraPoS Landing Page Into Separate `apps/landing`

Repository: `Rndynt/AuraPoS`
Target branch: `main`

## Objective

Migrate the landing page and mockup-preview assets that Replit previously added inside `apps/pos-terminal-web` into a completely separate workspace app:

```txt
apps/landing
```

The landing app must become an independent Vite React app. The existing POS terminal app must remain focused on authenticated POS operation only.

This migration is separation/refactor only. Do not redesign the landing page. Do not rewrite POS flows. Do not change payment, order, entitlement, tenant, offline, KDS, CFD, inventory, or backend behavior.

## Context From Last Landing Commits

The last landing-related commits added and refined these areas:

1. `88f8798ca696e1cd63bad224674aeb0020225a7c`
   - Added `LandingPage` inside `apps/pos-terminal-web`.
   - Added `DeviceMockup` iframe frame component.
   - Added mockup fixtures and multiple mockup pages.
   - Registered public routes in `apps/pos-terminal-web/src/App.tsx`:
     - `/landing`
     - `/mockup-assets/pos-desktop`
     - `/mockup-assets/active-orders`
     - `/mockup-assets/reports-mobile`
     - `/mockup-assets/payment-dialog`
     - `/mockup-assets/inventory`
     - `/mockup-assets/products`
     - `/mockup-assets/restaurant-tables`
     - `/mockup-assets/dashboard`

2. `38686807cb924b758880f7ca44772b66a5046985`
   - Updated POS desktop mockup visual density, sidebar, product card design, cart panel, and responsive styling.
   - This belongs to the landing/mockup app, not POS runtime.

3. `a07ad6d36a66a9fd9038cece324e617195b999c2`
   - Injected CSS in `apps/pos-terminal-web/index.html` to hide Replit badge.
   - Replaced mobile hero phone iframe with floating UI chips.
   - Increased desktop hero laptop mockup sizing.

4. `6d8ddf10f0460a779b0ef115413ac8ec22eb1414`
   - Added global CSS to hide Replit badge in `apps/pos-terminal-web/src/index.css`.
   - Refactored landing feature section to pre-render all iframe mockups and cross-fade them with opacity transitions.

The problem: all of this is currently mounted inside `apps/pos-terminal-web`, even though landing is a separate public marketing surface and should not live inside the POS terminal runtime.

## Non-Negotiable Scope Rules

### Allowed Changes

You may change only landing-separation related files:

```txt
apps/landing/**
apps/pos-terminal-web/src/App.tsx
apps/pos-terminal-web/src/pages/landing.tsx
apps/pos-terminal-web/src/components/landing/**
apps/pos-terminal-web/src/mockup-assets/**
apps/pos-terminal-web/public/landing/**
apps/pos-terminal-web/index.html          only landing/Replit-badge cleanup if applicable
apps/pos-terminal-web/src/index.css       only landing/Replit-badge cleanup if applicable
pnpm-lock.yaml                            only if workspace/package metadata changes require it
package.json                              only if strictly needed; avoid root behavior changes
```

### Forbidden Changes

Do not modify:

```txt
apps/api/**
packages/**
shared/**
apps/pos-terminal-web/src/pages/pos.tsx
apps/pos-terminal-web/src/features/pos-core/**
apps/pos-terminal-web/src/features/pos-flows/**
apps/pos-terminal-web/src/components/layout/**
apps/pos-terminal-web/src/context/**
apps/pos-terminal-web/src/lib/queryClient.ts
apps/pos-terminal-web/src/lib/tenant.ts
apps/pos-terminal-web/src/lib/outlet.ts
apps/pos-terminal-web/src/pages/orders.tsx
apps/pos-terminal-web/src/pages/tables-management.tsx
apps/pos-terminal-web/src/pages/kitchen-display.tsx
apps/pos-terminal-web/src/pages/kds.tsx
apps/pos-terminal-web/src/pages/customer-display.tsx
apps/pos-terminal-web/vite.config.ts      except only if landing code removal causes dead alias cleanup, which is not expected
root build/deploy scripts                 unless absolutely required
DB migrations
entitlement SOT
payment code
order lifecycle code
offline/PWA behavior
```

Do not rename or alter existing POS routes, except removing the landing/mockup public routes from the POS terminal router.

## Target Architecture

Create:

```txt
apps/landing/
  package.json
  index.html
  vite.config.ts
  tsconfig.json
  tailwind.config.ts
  postcss.config.js
  src/
    main.tsx
    App.tsx
    index.css
    pages/
      LandingPage.tsx
    components/
      DeviceMockup.tsx
    mockup-assets/
      fixtures.ts
      pages/
        MockupPOSDesktopPage.tsx
        MockupActiveOrdersPage.tsx
        MockupReportsMobilePage.tsx
        MockupPaymentDialogPage.tsx
        MockupInventoryPage.tsx
        MockupProductsPage.tsx
        MockupRestaurantTablesPage.tsx
        MockupDashboardPage.tsx
  public/
    landing/
      mockups/
        .gitkeep
```

Package name:

```json
"name": "@pos/landing"
```

Recommended scripts:

```json
{
  "dev": "vite --host 0.0.0.0 --port 5174 --strictPort",
  "build": "tsc && vite build",
  "preview": "vite preview --host 0.0.0.0 --port 5174 --strictPort",
  "type-check": "tsc --noEmit"
}
```

Use port `5174` so it does not conflict with `apps/pos-terminal-web` on port `5173`.

## Dependency Rules For `apps/landing`

The landing app should be lightweight.

Allowed runtime dependencies:

```txt
react
react-dom
lucide-react only if already used by migrated landing/mockup files
```

Allowed dev dependencies:

```txt
@vitejs/plugin-react
vite
typescript
tailwindcss
postcss
autoprefixer
@types/react
@types/react-dom
```

Do not depend on:

```txt
@pos/application
@pos/domain
@pos/infrastructure
@pos/offline
@tanstack/react-query
wouter
vite-plugin-pwa
POS context providers
POS layout components
backend API clients
```

If the existing landing code does not need a dependency, do not add it.

## Routing Rules

The landing app owns these routes internally:

```txt
/
/landing
/mockup-assets/pos-desktop
/mockup-assets/active-orders
/mockup-assets/reports-mobile
/mockup-assets/payment-dialog
/mockup-assets/inventory
/mockup-assets/products
/mockup-assets/restaurant-tables
/mockup-assets/dashboard
```

Implementation can be a small pathname switch in `apps/landing/src/App.tsx`. Do not add a heavy router unless necessary.

Example intent:

```tsx
const path = window.location.pathname;

switch (path) {
  case "/":
  case "/landing":
    return <LandingPage />;
  case "/mockup-assets/pos-desktop":
    return <MockupPOSDesktopPage />;
  // ...other mockup routes
  default:
    return <LandingPage />;
}
```

The mockup iframe `src` values may stay as same-origin paths like `/mockup-assets/pos-desktop`, because the landing app will host those routes itself.

## CTA Link Rules

Because landing will no longer run inside the POS terminal app, do not blindly assume `/login` and `/register` live on the landing deployment.

Add a tiny helper in the landing app:

```ts
const POS_APP_URL = import.meta.env.VITE_POS_APP_URL ?? "";
const appHref = (path: string) => `${POS_APP_URL}${path}`;
```

Then update landing CTA links:

```txt
/register -> appHref("/register")
/login    -> appHref("/login")
```

If `VITE_POS_APP_URL` is empty, same-origin links still work in local monorepo/dev. In production, the landing deploy can point to the POS terminal domain explicitly.

Document this in `apps/landing/README.md`:

```txt
VITE_POS_APP_URL=https://app.yourdomain.com
```

## Migration Steps

### Step 1 — Create independent landing app

Create `apps/landing` with Vite React TypeScript setup.

Use the same general Tailwind baseline as POS, but do not import POS app runtime, POS contexts, POS PWA, or POS query client.

`apps/landing/tailwind.config.ts` should follow the existing pattern:

```ts
import baseConfig from "../../tailwind.config";
import type { Config } from "tailwindcss";

const config: Config = {
  ...baseConfig,
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
};

export default config;
```

### Step 2 — Move landing page code

Move:

```txt
apps/pos-terminal-web/src/pages/landing.tsx
```

To:

```txt
apps/landing/src/pages/LandingPage.tsx
```

Then update imports:

```txt
@/components/landing/DeviceMockup
```

To:

```txt
@/components/DeviceMockup
```

Preserve the current design, copy, feature tabs, pricing cards, mobile floating UI chips, and cross-fade behavior. Do not redesign.

### Step 3 — Move device mockup component

Move:

```txt
apps/pos-terminal-web/src/components/landing/DeviceMockup.tsx
```

To:

```txt
apps/landing/src/components/DeviceMockup.tsx
```

Preserve iframe scaling behavior, native dimensions, sandbox config, laptop/tablet/phone frames, and pointer-events behavior.

### Step 4 — Move mockup fixtures and mockup pages

Move:

```txt
apps/pos-terminal-web/src/mockup-assets/**
```

To:

```txt
apps/landing/src/mockup-assets/**
```

Preserve all mockup pages and fixture values exactly unless import paths must change.

Expected migrated mockup pages:

```txt
MockupPOSDesktopPage.tsx
MockupActiveOrdersPage.tsx
MockupReportsMobilePage.tsx
MockupPaymentDialogPage.tsx
MockupInventoryPage.tsx
MockupProductsPage.tsx
MockupRestaurantTablesPage.tsx
MockupDashboardPage.tsx
```

### Step 5 — Move public landing assets

If this path exists:

```txt
apps/pos-terminal-web/public/landing/**
```

Move it to:

```txt
apps/landing/public/landing/**
```

Do not move POS icons, manifest, PWA assets, favicon, or unrelated public files.

### Step 6 — Remove landing from POS terminal router

Edit only landing-related imports/routes in:

```txt
apps/pos-terminal-web/src/App.tsx
```

Remove imports:

```ts
import LandingPage from "@/pages/landing";
import MockupPOSDesktopPage from "@/mockup-assets/pages/MockupPOSDesktopPage";
import MockupActiveOrdersPage from "@/mockup-assets/pages/MockupActiveOrdersPage";
import MockupReportsMobilePage from "@/mockup-assets/pages/MockupReportsMobilePage";
import MockupPaymentDialogPage from "@/mockup-assets/pages/MockupPaymentDialogPage";
import MockupInventoryPage from "@/mockup-assets/pages/MockupInventoryPage";
import MockupProductsPage from "@/mockup-assets/pages/MockupProductsPage";
import MockupRestaurantTablesPage from "@/mockup-assets/pages/MockupRestaurantTablesPage";
import MockupDashboardPage from "@/mockup-assets/pages/MockupDashboardPage";
```

Remove routes:

```tsx
<Route path="/landing" component={LandingPage} />
<Route path="/mockup-assets/pos-desktop" component={MockupPOSDesktopPage} />
<Route path="/mockup-assets/active-orders" component={MockupActiveOrdersPage} />
<Route path="/mockup-assets/reports-mobile" component={MockupReportsMobilePage} />
<Route path="/mockup-assets/payment-dialog" component={MockupPaymentDialogPage} />
<Route path="/mockup-assets/inventory" component={MockupInventoryPage} />
<Route path="/mockup-assets/products" component={MockupProductsPage} />
<Route path="/mockup-assets/restaurant-tables" component={MockupRestaurantTablesPage} />
<Route path="/mockup-assets/dashboard" component={MockupDashboardPage} />
```

Do not change any other POS routes.

The POS app should still keep:

```txt
/login
/register
/
/hub
/marketplace
/my-features
/pos
/orders
/kitchen
/tables
/dashboard
/products
/stock
/employees
/reports
/printers
/local-orders
/sync-conflicts
/store-profile
/outlets
/display
/kds/activate
/kds
```

### Step 7 — Remove landing-only files from POS terminal

After the landing app compiles, remove the old POS copies:

```txt
apps/pos-terminal-web/src/pages/landing.tsx
apps/pos-terminal-web/src/components/landing/**
apps/pos-terminal-web/src/mockup-assets/**
apps/pos-terminal-web/public/landing/**
```

Only remove directories if empty after moving landing files.

### Step 8 — Move Replit badge CSS out of POS if landing-only

The last landing commits injected Replit badge hiding in:

```txt
apps/pos-terminal-web/index.html
apps/pos-terminal-web/src/index.css
```

Move equivalent CSS to the new landing app if still needed:

```css
replit-badge,
#replit-dev-banner,
[data-replit-badge] {
  display: none !important;
  opacity: 0 !important;
  pointer-events: none !important;
}
```

Then remove only the landing/Replit-badge-injected lines from POS if they were introduced only for landing/mockup display.

Do not touch unrelated POS global CSS.

### Step 9 — Keep root build behavior stable

Do not change this existing root script behavior:

```txt
build:static:api copies apps/pos-terminal-web/dist into apps/api/dist/public
```

This migration should not embed the new landing app into the API static output unless explicitly requested later.

`apps/landing` should build to its own:

```txt
apps/landing/dist
```

Deployment for landing should be separate.

### Step 10 — Add README

Create:

```txt
apps/landing/README.md
```

Include:

```txt
- purpose: public AuraPoS marketing landing app
- dev command: pnpm --filter @pos/landing dev
- build command: pnpm --filter @pos/landing build
- preview command: pnpm --filter @pos/landing preview
- env: VITE_POS_APP_URL optional, points CTA links to POS app domain
- note: mockup routes are internal to landing app and are used by iframe previews
```

## Acceptance Criteria

### Landing App

Must pass:

```bash
pnpm --filter @pos/landing type-check
pnpm --filter @pos/landing build
```

Manual route checks in dev/preview:

```txt
http://localhost:5174/
http://localhost:5174/landing
http://localhost:5174/mockup-assets/pos-desktop
http://localhost:5174/mockup-assets/active-orders
http://localhost:5174/mockup-assets/reports-mobile
http://localhost:5174/mockup-assets/payment-dialog
http://localhost:5174/mockup-assets/inventory
http://localhost:5174/mockup-assets/products
http://localhost:5174/mockup-assets/restaurant-tables
http://localhost:5174/mockup-assets/dashboard
```

The landing page must still show:

```txt
- navbar
- hero section
- mobile floating UI chips
- desktop laptop mockup
- stats
- feature tabs
- pre-rendered/cross-faded device mockups
- business type cards
- pricing cards
- CTA section
- footer
```

### POS Terminal App

Must pass:

```bash
pnpm --filter @pos/terminal-web type-check
pnpm --filter @pos/terminal-web build
```

POS must no longer import or route:

```txt
LandingPage
MockupPOSDesktopPage
MockupActiveOrdersPage
MockupReportsMobilePage
MockupPaymentDialogPage
MockupInventoryPage
MockupProductsPage
MockupRestaurantTablesPage
MockupDashboardPage
```

POS must still compile and keep existing app routes unchanged except for removal of `/landing` and `/mockup-assets/*`.

### Full Repo Safety Check

Run if feasible:

```bash
pnpm type-check
pnpm build
```

If any pre-existing unrelated failure occurs, document it clearly with command output and do not hide it.

## Commit Requirements

Make one focused commit:

```txt
refactor(landing): move landing page into separate app
```

Commit must include only files required for this migration.

Before committing, run:

```bash
git status --short
git diff --stat
git diff -- apps/pos-terminal-web/src/App.tsx
```

Verify the diff does not include unrelated POS/payment/order/backend changes.

Push to the active branch after commit.

## Final Response Required From Codex

After implementation, report:

```txt
1. Commit SHA
2. Files moved from POS app
3. Files created in apps/landing
4. POS files cleaned
5. Validation commands run and results
6. Any intentionally skipped command with reason
```
