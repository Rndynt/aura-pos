# AuraPoS - Multi-Tenant Point of Sale System

## ⚡ Quick Start for New Agent Sessions

**READ THIS FIRST — skip exploration, go straight here:**

### Workflow
- `npm run dev` — starts AuraPoS API only; used by the Replit **Start application** workflow
- `npm run dev:turbo` — optional Turborepo dev workflow if needed (starts API + frontend via Turborepo)
- If startup fails, check `BETTER_AUTH_SECRET` env var is set (64-char string)

### Key directories
```
apps/
  api/                          — Express backend (main AuraPoS API)
  pos-terminal-web/             — React 19 + Vite frontend (main POS UI)
  payment-orchestration-service/— Standalone payment microservice (Phase 8D+)
packages/
  core/                         — Shared utilities, tenant.ts (CURRENT_TENANT_ID here)
  payment-orchestration-core/   — workspace package / future standalone package containing payment domain types/interfaces
  payment-orchestration-client-sdk/ — typed HTTP client for future app integrations
shared/
  schema.ts                     — Drizzle ORM schema (source of truth for DB types)
docs/
  reports/                      — Implementation reports per phase
  *.md                          — Phase prompt specs (e.g. phase-8d1-8e-*.md)
```

### Tenant switching (no login)
Edit `packages/core/tenant.ts` line 1: `export const CURRENT_TENANT_ID = "demo-tenant"`
Available: `demo-tenant` (cafe/restaurant), `laundry-indo` (laundry), `minimarket-demo` (retail)

### Test command (payment orchestration)
```
npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/<file>.test.ts
```

### Type-check commands
```
pnpm --filter @northflow/payment-orchestration-core type-check
pnpm --filter @northflow/payment-orchestration-service type-check
```

### Critical constraints
- `tenants.id` is a slug string (e.g. `"demo-tenant"`), NOT uuid
- No intentional changes to embedded payment runtime unless a phase explicitly says so:
  - `apps/api/src/http/routes/payment-engine.ts`
  - `packages/application/payments/*`
  - `packages/domain/payments/*`
  - `packages/infrastructure/payments/providers/*`
- `IDEMPOTENCY_SCOPE = 'create_gateway_payment'` in CreateGatewayPayment (not 'gateway_payment')
- Webhook route registered BEFORE auth middleware in `app.ts`
- Memory: `.agents/memory/MEMORY.md` — read this for cross-session decisions

---

## Overview
AuraPoS is a modern, multi-tenant Point of Sale (POS) management system designed for cafés, restaurants, and retail businesses, supporting dine-in, takeaway, and delivery orders. Its primary purpose is to provide a robust and flexible solution for order and payment processing with a focus on real-time operations and data isolation.

Key capabilities include:
- Full order lifecycle management (draft → confirmed → preparing → completed)
- Multi-tenant architecture with complete data isolation
- Kitchen Display System (KDS) with real-time ticket management
- Flexible payment processing (full/partial, multiple methods)
- Dynamic table management for dine-in service
- 1-click quick charge for counter service
- Atomic order+payment transactions
- Responsive design for various devices.

## User Preferences
I prefer iterative development with a focus on delivering functional, tested features in small increments. Please ask before making major architectural changes or introducing new external dependencies. I value clear, concise communication and prefer detailed explanations for complex logic or design decisions. I expect the agent to maintain the established coding standards and adhere to the project's technology stack.

## Recent Fixes (Nov 29, 2025 - Current Session)

### ✅ Mobile Cart Drawer - Fixed Tablet/Desktop Breakpoint Issue
- **Problem**: MobileCartDrawer was appearing on tablet/desktop, covering the screen and disrupting UX
- **Root Cause**: Drawer was always rendered regardless of screen size; only overlay was hidden on md+
- **Solution**: 
  - Use `useIsMobile()` hook to conditionally render MobileCartDrawer only on mobile (<768px)
  - Changed CartPanel wrapper from `lg:flex` (1024px+) to `md:flex` (768px+) to cover tablets
  - Removed unnecessary `md:` responsive fallback classes from MobileCartDrawer since it won't render on tablets
  - Also conditionally render UnifiedBottomNav only on mobile
- **Files Modified**: `pos.tsx` (lines 25, 48, 654-698), `MobileCartDrawer.tsx` (lines 139-151, 291, 349)
- **Result**: Clean separation - Mobile shows drawer + bottom nav, Tablet/Desktop shows full CartPanel

### ✅ Paid Order - Hide Continue Order Button
- If order.paymentStatus === "paid", the "Continue Order" button is completely hidden
- Only UNPAID orders show the "Continue Order" button
- Users must create a new order for tables with paid orders

### ✅ Feature Flag System - Full Protection (3-Layer)
- **Route Protection** (App.tsx): Protected routes render 404 if feature disabled
- **Mobile Nav** (UnifiedBottomNav.tsx): Tables button hides if feature disabled
- **Sidebar** (Sidebar.tsx): Desktop sidebar has feature flag checks
- **Result**: Tables & Kitchen features fully protected across ALL access points

### ✅ Product Variant Selection - Responsive Drawer + Dialog (useIsMobile Hook - FIXED)
- **Mobile (< 768px)**: Shows as **Drawer** (slides from bottom via vaul library)
- **Desktop (≥ 768px)**: Shows as **Dialog** (centered modal via shadcn/ui)
- **Implementation**: 
  - Uses official `useIsMobile()` hook from `/hooks/use-mobile.tsx`
  - Both branches use proper shadcn/ui components (Drawer + DrawerContent for mobile, Dialog + DialogContent for desktop)
  - Logic: `if (!isDesktop) return <Drawer> else return <Dialog>`
- **Fix Applied**: Replaced custom div Dialog with proper `<Dialog>` component to ensure correct z-index stacking and Portal rendering
- **Styling**: Unified appearance (white bg, slate borders, blue actions)
- **Quantity**: Footer/action area with compact controls
- **Files**: `ProductOptionsDialog.tsx` (line 42-43: isMobile + isDesktop logic, line 407-421: Drawer, line 425-443: Dialog)

### ✅ Inline Edit Category Names - Preserved Expand/Collapse
- **Product Management Page** (`/products`) - Daftar Produk tab
- **Click on category name** → Enter inline edit mode
- **Click on chevron/empty space** → Toggle expand/collapse
- **Edit flow**:
  - Type new name
  - Press **Enter** to save or **Escape** to cancel
  - Click outside (blur) to save automatically
- **Behavior**: Updates ALL products in that category via batch API calls
- **Files**: `products.tsx` (lines 41-43, 80-116, 490-535)

### ✅ Indonesian Laundry Demo Tenant - Complete Data Model
- **Function**: `seedIndonesianLaundryTenant()` - 10 realistic services with Indo pricing
- **Tenant ID**: `laundry-indo` (PT Cucian Cepat Indonesia)
- **10 Services**: Cuci Satuan (9.5k/kg), Cuci+Setrika (12k/kg), Cuci Kilat (18k/kg), Setrika (6k/kg), Dry Cleaning (45k), Sprai (25k), Selimut (35k), Karpet (50k/m²), Sofa (75k), Hapus Noda (15k)
- **Order Types**: DROP OFF, PICKUP & DELIVERY, EXPRESS
- **Modules**: Delivery ✅, Appointments ✅, Loyalty ✅
- **Implementation**: Replaced generic `seedLaundryTenant()` with Indonesia-specific data
- **Files**: `apps/api/src/seed.ts` (lines 914-1033), `packages/core/tenant.ts` (line 1)

## Session Summary (Nov 29, 2025)

### Implemented Features:
1. ✅ Mobile Cart Drawer - Fixed tablet/desktop breakpoint issue (useIsMobile + md:flex)
2. ✅ Paid Order Logic - Hide continue button
3. ✅ Feature Flags - Full 3-layer protection  
4. ✅ Responsive Product Variant UI - Drawer + Dialog with optimized quantity layout
5. ✅ Inline Category Edit - Preserves expand/collapse with smart click detection
6. ✅ Demo Tenants - 3 complete business types with supporting data

### Demo Tenants Created:
1. **Restaurant/Cafe** (`demo-tenant`)
   - Order types: DINE_IN, TAKE_AWAY, DELIVERY
   - 8 products with variants (Burger, Coffee, Pizza, Wings, etc.)
   - 10 demo tables with floor plan
   - 3 open orders for testing
   - Modules: Table Management ✅, Kitchen Ticket ✅

2. **Laundry Service** (`laundry-demo`)
   - Order types: DROPOFF, PICKUP_DELIVERY, EXPRESS
   - 6 services: Regular Wash, Premium Wash, Express, Ironing, Dry Cleaning, Stain Removal
   - Modules: Delivery ✅, Appointments ✅, Inventory ✅, Loyalty ✅

3. **Minimarket/Retail** (`minimarket-demo`)
   - Order types: WALK_IN, SELF_CHECKOUT, PICKUP_STORE
   - 12 products across categories: Beverages, Snacks, Daily Essentials, Beauty & Care
   - Stock tracking enabled for inventory management
   - Modules: Inventory ✅, Loyalty ✅

### Files Modified:
- `apps/pos-terminal-web/src/pages/tables-management.tsx` - Hide continue button for paid orders
- `apps/pos-terminal-web/src/App.tsx` - Route protection
- `apps/pos-terminal-web/src/components/navigation/UnifiedBottomNav.tsx` - Mobile nav feature flag
- `apps/pos-terminal-web/src/components/pos/ProductOptionsDialog.tsx` - Responsive drawer + dialog with optimized quantity
- `apps/pos-terminal-web/src/pages/products.tsx` - Inline category edit with preserved expand/collapse
- `apps/api/src/seed.ts` - Added seedLaundryTenant() & seedMinimarketTenant() functions
- `replit.md` - Documentation

## Tenant Switching (No Login - Hardcoded)

**File:** `packages/core/tenant.ts`
```typescript
export const CURRENT_TENANT_ID = "laundry-indo"; // Change this to switch tenant
```

**Available Tenants:**
1. **`demo-tenant`** - Restaurant/Cafe
   - Order Types: DINE_IN, TAKE_AWAY, DELIVERY
   - Products: 8 items with variants (Burger, Coffee, Pizza, Wings, etc.)
   - Tables: 10 for floor plan
   - Open Orders: 3 (for testing "Continue Order")
   - Modules: Table Management ✅, Kitchen Display ✅
   
2. **`laundry-indo`** - Indonesian Laundry Service (NEW! Indonesia-specific)
   - Tenant Name: **Cucian Cepat Indonesia** - PT Layanan Laundry Profesional
   - Address: Jl. Merdeka No. 123, Jakarta Selatan
   - Order Types: DROP OFF, PICKUP & DELIVERY, EXPRESS
   - **10 Services (Indonesia-Realistic Pricing):**
     - Cuci Satuan: Rp 9.500/kg (3-5 hari)
     - Cuci + Setrika: Rp 12.000/kg (2-3 hari)
     - Cuci Kilat: Rp 18.000/kg (1 hari)
     - Setrika Saja: Rp 6.000/kg
     - Dry Cleaning: Rp 45.000/item
     - Cuci Sprai & Sarung Bantal: Rp 25.000/set
     - Cuci Selimut & Bedcover: Rp 35.000/item
     - Cuci Karpet & Tikar: Rp 50.000/m²
     - Cuci Sofa & Mebel: Rp 75.000/bagian
     - Hapus Noda Membandel: Rp 15.000/item
   - Modules: Delivery ✅, Appointments ✅, Loyalty ✅
   
3. **`minimarket-demo`** - Retail/Minimarket
   - Order Types: WALK_IN, SELF_CHECKOUT, PICKUP_STORE
   - Products: 12 items (Beverages, Snacks, Essentials, Beauty & Care)
   - Stock Tracking: Enabled
   - Modules: Inventory ✅, Loyalty ✅

**To Switch Tenant:**
1. Edit `packages/core/tenant.ts` line 2: `CURRENT_TENANT_ID = "laundry-indo"` (or any tenant ID)
2. Save file - dev server auto-reloads
3. **Hard Refresh browser (Ctrl+Shift+R)** - now using new tenant data

**Alternative (localStorage):** Tenant can be switched via localStorage or URL query param (auto-resolved in frontend)

## System Architecture

### UI/UX Decisions
The frontend is built with React 19, TypeScript, Vite, and TailwindCSS for a responsive design that adapts across mobile, tablet, and desktop. UI components are built using `shadcn/ui` (Radix primitives + Tailwind) and `Lucide React` for icons.
- **Mobile (< 768px)**: Bottom navigation, slide-out cart, drawer panels.
- **Tablet (768-1024px)**: Split view with a collapsible cart, drawer panels.
- **Desktop (> 1024px)**: Full sidebar layout, centered dialogs.
- The system simplifies user interaction by auto-selecting the first order type and required product options where applicable, and ensures "Simpan" (draft save) works independently without dialogs. Payment dialogs are designed for a streamlined flow.

### Technical Implementations
- **Frontend**: React 19, TypeScript, Vite, TailwindCSS, React Query, React Hook Form, Zod validation.
- **Backend**: Express.js, TypeScript, Node.js 20, middleware pattern, repository pattern, use case layer.
- **Database**: PostgreSQL with Drizzle ORM for type-safe schema definitions.
- **Build**: Turborepo for monorepo management.
- **Order Flow**: DRAFT → CONFIRMED → IN_PROGRESS → COMPLETED states with flexible payment recording.
- **Data Isolation**: All core tables include `tenant_id` for multi-tenant isolation.
- **Feature Flags**: Multi-tenant feature management via `tenant_module_configurations` table, checked at route and UI layer.

### Feature Specifications
- **POS Terminal (`/pos`)**: Product browsing, shopping cart, order types, customer/table assignment, payment methods, quick charge, partial payment, real-time queue.
- **Kitchen Display (`/kitchen`)**: Real-time ticket queue, status management, preparation tracking. Feature flag: `enable_kitchen_ticket`
- **Table Management (`/tables`)**: Dynamic table layout, occupancy status, order continuation. Feature flag: `enable_table_management`
- **Order Queue Panel**: Real-time order display with payment status visibility.
- **Business Type Templates**: Quick setup for Cafe/Restaurant, Retail, Laundry, Service, Digital/PPOB.

### System Design Choices
- Modular structure: `apps/` (frontend/backend), `packages/` (shared logic), `shared/` (database schema)
- Turborepo for monorepo management
- Core utilities centralized in `packages/core/utils/`

## External Dependencies
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **HTTP Client**: Node-fetch
- **UI Libraries**: shadcn/ui (Radix primitives + Tailwind), Lucide React (icons)
