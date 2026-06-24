# Replit/Codex Prompt — Build AuraPoS Real UI Mockup Assets Pipeline

## Context

AuraPoS needs landing page visual assets that look premium but are based on the **real application UI**, not AI-generated mockup images.

The goal is to create a repeatable pipeline for producing landing page mockup screenshots from the actual AuraPoS frontend using controlled demo data, then use those screenshots inside interactive landing page components.

This task is about building the **mockup asset system**, not redesigning the whole product and not generating fake UI images.

---

## Non-negotiable rules

1. Do **not** generate mockup images with AI.
2. Do **not** manually draw fake product screens that do not exist in the app.
3. Use the real AuraPoS UI components/pages wherever possible.
4. If a screen state is hard to reach naturally, create a demo/mockup route that renders the real component composition with realistic fixture data.
5. Do not break cashier/POS production flow.
6. Do not mix this task with payment refactor, entitlement refactor, order lifecycle refactor, or architecture cleanup.
7. Keep changes isolated under landing/mockup asset tooling and demo-only routes/components.
8. Use realistic Indonesian POS data: cafe/restaurant/retail, IDR currency, cashier, outlet, payment methods, product images/placeholders if needed.
9. All screenshots must be deterministic and repeatable.
10. The final output must be usable by the future AuraPoS landing page.

---

## Main objective

Build a system that can produce and serve these real UI mockup assets:

```txt
public/landing/mockups/
  pos-desktop.png
  payment-dialog-desktop.png
  active-orders-tablet.png
  reports-mobile.png
  inventory-desktop.png
  products-desktop.png
  restaurant-tables-desktop.png
  dashboard-desktop.png
```

And provide frontend components that can display them in the landing page:

```txt
apps/pos-terminal-web/src/components/landing/
  DeviceMockup.tsx
  ProductShowcase.tsx
  FeatureShowcaseTabs.tsx
```

---

## Required screens to prepare

### 1. POS cashier desktop

Purpose: hero section main laptop mockup.

Required visual state:

```txt
- AuraPoS sidebar/header visible
- product grid visible
- category tabs visible
- cart/order panel visible
- subtotal/tax/total visible
- payment CTA visible
- realistic cafe/restaurant products
```

Suggested demo data:

```txt
Outlet: Aura Coffee
Cashier: Ayu Lestari
Products:
- Americano — Rp 22.000
- Cappuccino — Rp 26.000
- Es Kopi Susu — Rp 24.000
- Matcha Latte — Rp 28.000
- Nasi Goreng — Rp 32.000
- Mie Goreng — Rp 28.000
- Chicken Burger — Rp 35.000
- French Fries — Rp 20.000
- Brownies — Rp 22.000
```

Cart example:

```txt
- Americano x1
- Nasi Goreng x1
- Es Kopi Susu x2
- French Fries x1
Total sekitar Rp 134.200 dengan pajak
```

---

### 2. Payment dialog desktop

Purpose: show AuraPoS payment capabilities.

Required visual state:

```txt
- same POS screen background if possible
- payment dialog open
- payment options visible:
  - Bayar Penuh
  - DP
  - Multi Payment
  - Split Bill if implemented enough to show safely
- methods visible:
  - Cash
  - QRIS Manual
  - Transfer Manual
- paid/remaining summary if existing UI supports it
```

Important:

```txt
Do not create fake payment logic.
This is a visual demo state only.
If the existing payment dialog is unstable, render the real dialog component with fixture props in a mockup-only wrapper.
```

---

### 3. Active orders tablet

Purpose: tablet mockup for order management.

Required visual state:

```txt
- active orders board/cards
- tabs: Semua, Dine In, Take Away, Delivery
- several order cards with status chips
- table/order labels such as Meja 01, Take Away, Delivery
- totals and time visible
```

Statuses:

```txt
- Baru
- Diproses
- Siap Saji
- Dikirim
```

---

### 4. Reports mobile

Purpose: phone mockup for owner/manager view.

Required visual state:

```txt
- compact mobile dashboard/report screen
- today revenue card
- transactions count
- average transaction
- best-selling item
- cash vs non-cash summary
- bottom navigation if available
```

Example data:

```txt
Penjualan Hari Ini: Rp 5.742.000
Transaksi: 128
Rata-rata transaksi: Rp 44.859
Item terjual: 339
Pembayaran Tunai: Rp 2.350.000
Pembayaran Non Tunai: Rp 3.392.000
```

---

### 5. Inventory desktop

Purpose: feature section for stock control.

Required visual state:

```txt
- inventory list/table
- stock status chips
- low stock alert
- stock movement or adjustment entry if available
```

Example items:

```txt
- Biji Kopi Arabica — stok 12 kg
- Susu Fresh Milk — stok 8 liter
- Gula Aren — stok 5 botol
- Cup 16oz — stok 240 pcs
- Tepung Ayam Crispy — stok rendah
```

---

### 6. Products/catalog desktop

Purpose: feature section for product management.

Required visual state:

```txt
- product table or product cards
- categories
- price
- stock/availability
- edit/add product CTA if available
```

---

### 7. Restaurant tables desktop

Purpose: show restaurant/table service capability.

Required visual state:

```txt
- table layout / denah meja if available
- occupied/available table state
- active order tied to table
- clean visual suitable for landing page
```

If restaurant table view is not stable, create a mockup-only fixture route that renders the existing table components as closely as possible without changing production behavior.

---

### 8. Dashboard desktop

Purpose: alternative hero/feature mockup.

Required visual state:

```txt
- sales summary
- chart/cards if existing
- top products
- recent transactions
- outlet selector if available
```

---

## Implementation plan

### Phase 1 — Create deterministic mockup fixtures

Create mockup fixture data in a dedicated folder, for example:

```txt
apps/pos-terminal-web/src/mockup-assets/
  fixtures/
    mockupTenant.ts
    mockupProducts.ts
    mockupOrders.ts
    mockupReports.ts
    mockupInventory.ts
    mockupPayments.ts
```

Rules:

```txt
- Fixture data must be local frontend data only.
- Do not call production APIs for mockup asset generation.
- Keep names and currency realistic.
- Keep data deterministic.
```

---

### Phase 2 — Create mockup-only routes/pages

Create mockup asset pages that can be captured by Playwright.

Suggested structure:

```txt
apps/pos-terminal-web/src/mockup-assets/pages/
  MockupPOSDesktopPage.tsx
  MockupPaymentDialogPage.tsx
  MockupActiveOrdersTabletPage.tsx
  MockupReportsMobilePage.tsx
  MockupInventoryDesktopPage.tsx
  MockupProductsDesktopPage.tsx
  MockupRestaurantTablesDesktopPage.tsx
  MockupDashboardDesktopPage.tsx
```

Register routes under a safe internal path:

```txt
/mockup-assets/pos-desktop
/mockup-assets/payment-dialog-desktop
/mockup-assets/active-orders-tablet
/mockup-assets/reports-mobile
/mockup-assets/inventory-desktop
/mockup-assets/products-desktop
/mockup-assets/restaurant-tables-desktop
/mockup-assets/dashboard-desktop
```

Important safety requirement:

```txt
These routes must be hidden from normal navigation.
If the app has environment config, gate these routes behind a dev/demo flag such as VITE_ENABLE_MOCKUP_ASSETS=true.
If route gating is not available yet, at minimum keep them unlinked and clearly isolated.
```

---

### Phase 3 — Reuse real UI components

Use existing UI components as much as possible:

```txt
- POS layout/product grid/cart/payment dialog
- order board/card components
- report/dashboard cards
- inventory/product components
- table layout components
```

If an existing component is too tightly coupled to API hooks, create a thin presentational wrapper rather than rewriting a fake screen.

Preferred pattern:

```txt
Existing production component
→ extract presentational component if needed
→ production page passes live data
→ mockup page passes fixture data
```

Avoid this pattern:

```txt
Copy-paste full UI into fake landing/mockup screen
```

---

### Phase 4 — Add Playwright screenshot script

Add a script that captures screenshots deterministically.

Suggested files:

```txt
apps/pos-terminal-web/scripts/capture-mockup-assets.ts
apps/pos-terminal-web/playwright.mockup.config.ts
```

The script should:

```txt
1. Open each /mockup-assets/* route.
2. Set viewport size.
3. Wait until fonts/layout are stable.
4. Capture screenshot.
5. Save into public/landing/mockups/*.png.
```

Required viewport sizes:

```txt
Desktop: 1440x1024
Tablet: 1024x768
Mobile: 390x844
```

Suggested screenshot outputs:

```txt
public/landing/mockups/pos-desktop.png
public/landing/mockups/payment-dialog-desktop.png
public/landing/mockups/active-orders-tablet.png
public/landing/mockups/reports-mobile.png
public/landing/mockups/inventory-desktop.png
public/landing/mockups/products-desktop.png
public/landing/mockups/restaurant-tables-desktop.png
public/landing/mockups/dashboard-desktop.png
```

Add package script if this package owns frontend scripts:

```json
{
  "scripts": {
    "mockup:capture": "tsx scripts/capture-mockup-assets.ts"
  }
}
```

Adjust command to match the repo tooling if `tsx` is not already available.

---

### Phase 5 — Create reusable landing mockup components

Create:

```txt
apps/pos-terminal-web/src/components/landing/DeviceMockup.tsx
apps/pos-terminal-web/src/components/landing/ProductShowcase.tsx
apps/pos-terminal-web/src/components/landing/FeatureShowcaseTabs.tsx
```

`DeviceMockup.tsx` should support:

```txt
- laptop frame
- tablet frame
- phone frame
- plain image frame
```

`ProductShowcase.tsx` should support:

```txt
- hero composition: laptop + tablet + phone
- feature mode: one selected screenshot
- responsive layout
```

`FeatureShowcaseTabs.tsx` should support tabs:

```txt
POS
Pembayaran
Pesanan
Inventory
Laporan
Restaurant
```

Data shape example:

```ts
export const landingMockups = [
  {
    key: 'pos',
    title: 'POS cepat untuk kasir modern',
    description: 'Pilih produk, kelola cart, dan proses pembayaran dari satu layar.',
    desktopImage: '/landing/mockups/pos-desktop.png',
  },
  {
    key: 'payment',
    title: 'Pembayaran fleksibel',
    description: 'Cash, QRIS manual, transfer manual, DP, multi payment, dan split bill.',
    desktopImage: '/landing/mockups/payment-dialog-desktop.png',
  },
  {
    key: 'orders',
    title: 'Pantau pesanan aktif',
    description: 'Kelola dine-in, take away, dan delivery dalam satu tampilan.',
    desktopImage: '/landing/mockups/active-orders-tablet.png',
  },
  {
    key: 'reports',
    title: 'Laporan penjualan real-time',
    description: 'Owner bisa melihat omzet, transaksi, dan metode pembayaran dari mobile.',
    mobileImage: '/landing/mockups/reports-mobile.png',
  },
];
```

---

## Styling requirements

Mockup pages and landing components should look premium and clean:

```txt
- use existing AuraPoS blue/indigo accent
- rounded device frames
- soft shadows
- subtle gradient background allowed
- no overdone animation
- no fake clutter
- clean spacing
- responsive on desktop/tablet/mobile
```

Do not introduce a new design system. Use existing Tailwind/shadcn conventions already present in the project.

---

## Asset quality requirements

Screenshots must be:

```txt
- sharp
- not blurry
- not cropped incorrectly
- not showing broken images
- not showing dev errors
- not showing empty states unless intentional
- not showing localhost URL bars
- not showing debug panels
- not showing auth/login walls
```

Mockup screenshots should look like a real SaaS product demo.

---

## Testing and validation

Run the relevant checks available in the repo.

Minimum expected checks:

```bash
pnpm type-check
pnpm --filter @pos/terminal-web type-check
pnpm --filter @pos/terminal-web build
```

If these commands differ in this repo, inspect package scripts and run the nearest equivalent.

Also validate manually:

```txt
1. Each /mockup-assets/* route renders without crash.
2. Screenshot script produces files in public/landing/mockups.
3. ProductShowcase renders with generated screenshots.
4. Existing POS/customer app route still works.
5. No production menu/sidebar links point to mockup asset routes.
```

---

## Expected final deliverables

Commit must include:

```txt
1. Mockup fixture data.
2. Mockup-only capture routes/pages.
3. Screenshot capture script/config.
4. public/landing/mockups/.gitkeep or generated sample screenshots if feasible.
5. Landing mockup display components.
6. README or docs note explaining how to regenerate assets.
```

Suggested docs file:

```txt
docs/landing/mockup-assets.md
```

Docs must explain:

```txt
- purpose of mockup assets
- how to enable mockup routes
- how to run screenshot capture
- where generated files are stored
- how landing page components consume them
```

---

## Acceptance criteria

This task is complete only if:

```txt
- There is a repeatable way to capture real AuraPoS UI screenshots.
- The screenshot routes use realistic deterministic fixture data.
- Landing components can render laptop/tablet/mobile mockups from those screenshots.
- The generated asset paths are stable under public/landing/mockups.
- Mockup routes are isolated from normal app navigation.
- No AI-generated UI image is used as source of truth.
- Existing POS production behavior is not changed.
- Type-check/build passes or any pre-existing failure is documented clearly.
```

---

## Commit message

Use this commit message:

```txt
feat(landing): add real app mockup asset pipeline
```

---

## Important implementation note

If any existing production component is too coupled to live API state, do not force risky refactor. Instead:

```txt
1. Create a small presentational component extracted from the production component.
2. Keep production behavior unchanged.
3. Let production pass live data.
4. Let mockup pages pass fixture data.
```

The priority is a safe, repeatable, real-product mockup asset pipeline for AuraPoS landing page visuals.
