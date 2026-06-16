import React, { Suspense, lazy } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PortraitOverlay } from "@/components/PortraitOverlay";
import { PwaUpdatePrompt } from "@/components/offline/PwaUpdatePrompt";
import { PwaInstallPrompt } from "@/components/offline/PwaInstallPrompt";
import { useEffect, useState } from "react";
import HomePage from "@/pages/home";
import POSPage from "@/pages/pos";
import OrdersPage from "@/pages/orders";
import TablesManagementPage from "@/pages/tables-management";
import KitchenDisplayPage from "@/pages/kitchen-display";
import KDSPage from "@/pages/kds";
import KdsActivatePage from "@/pages/kds-activate";
import CustomerDisplayPage from "@/pages/customer-display";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import { TenantProvider, useTenant } from "@/context/TenantContext";
import { OutletProvider } from "@/context/OutletContext";
import { clearActiveTenantCache } from "@/lib/tenant";
import { clearActiveOutletId } from "@/lib/outlet";
import { MainLayout } from "@/components/layout/MainLayout";

const ReportsPage = lazy(() => import("@/pages/reports"));
const ProductsPage = lazy(() => import("@/pages/products"));
const StockPage = lazy(() => import("@/pages/stock"));
const EmployeesPage = lazy(() => import("@/pages/employees"));
const StoreProfilePage = lazy(() => import("@/pages/store-profile"));
const PrintersPage = lazy(() => import("@/pages/printers"));
const LocalOrdersPage = lazy(() => import("@/pages/local-orders"));
const SyncConflictsPage = lazy(() => import("@/pages/sync-conflicts"));
const OutletsPage = lazy(() => import("@/pages/outlets"));
const MarketplacePage = lazy(() => import("@/pages/marketplace"));
const MyFeaturesPage = lazy(() => import("@/pages/my-features"));
const DashboardPage = lazy(() => import("@/pages/dashboard"));

function RedirectToRegister() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation('/register', { replace: true });
  }, [setLocation]);

  return <PageLoading />;
}

function PageLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 animate-pulse" />
        <span className="text-sm text-slate-400">Loading…</span>
      </div>
    </div>
  );
}

const POSPageWithLayout = () => (
  <MainLayout hideBottomNav>
    <POSPage />
  </MainLayout>
);

const OrdersPageWithLayout = () => (
  <MainLayout hideBottomNav>
    <OrdersPage />
  </MainLayout>
);

const TablesManagementPageWithLayout = () => (
  <MainLayout hideBottomNav>
    <TablesManagementPage />
  </MainLayout>
);

const HomePageWithLayout = () => (
  <MainLayout hideBottomNav>
    <HomePage />
  </MainLayout>
);

const MarketplacePageWithLayout = () => (
  <MainLayout hideBottomNav>
    <Suspense fallback={<PageLoading />}>
      <MarketplacePage />
    </Suspense>
  </MainLayout>
);

const MyFeaturesPageWithLayout = () => (
  <MainLayout hideBottomNav>
    <Suspense fallback={<PageLoading />}>
      <MyFeaturesPage />
    </Suspense>
  </MainLayout>
);

const DashboardPageWithLayout = () => (
  <MainLayout>
    <Suspense fallback={<PageLoading />}>
      <DashboardPage />
    </Suspense>
  </MainLayout>
);

const ProductsPageWithLayout = () => (
  <MainLayout>
    <Suspense fallback={<PageLoading />}>
      <ProductsPage />
    </Suspense>
  </MainLayout>
);

const StockPageWithLayout = () => (
  <MainLayout>
    <Suspense fallback={<PageLoading />}>
      <StockPage />
    </Suspense>
  </MainLayout>
);

const EmployeesPageWithLayout = () => (
  <MainLayout>
    <Suspense fallback={<PageLoading />}>
      <EmployeesPage />
    </Suspense>
  </MainLayout>
);

const ReportsPageWithLayout = () => (
  <MainLayout>
    <Suspense fallback={<PageLoading />}>
      <ReportsPage />
    </Suspense>
  </MainLayout>
);

const StoreProfilePageWithLayout = () => (
  <MainLayout>
    <Suspense fallback={<PageLoading />}>
      <StoreProfilePage />
    </Suspense>
  </MainLayout>
);

const PrintersPageWithLayout = () => (
  <MainLayout>
    <Suspense fallback={<PageLoading />}>
      <PrintersPage />
    </Suspense>
  </MainLayout>
);

const KitchenDisplayPageWithLayout = () => (
  <MainLayout hideBottomNav={false}>
    <KitchenDisplayPage />
  </MainLayout>
);

const LocalOrdersPageWithLayout = () => (
  <MainLayout>
    <Suspense fallback={<PageLoading />}>
      <LocalOrdersPage />
    </Suspense>
  </MainLayout>
);

const SyncConflictsPageWithLayout = () => (
  <MainLayout>
    <Suspense fallback={<PageLoading />}>
      <SyncConflictsPage />
    </Suspense>
  </MainLayout>
);

const OutletsPageWithLayout = () => (
  <MainLayout>
    <Suspense fallback={<PageLoading />}>
      <OutletsPage />
    </Suspense>
  </MainLayout>
);

const NotFoundWithLayout = () => (
  <MainLayout>
    <NotFound />
  </MainLayout>
);

function ProtectedKitchenRoute() {
  const { can, isLoading, planTier } = useTenant();
  if (isLoading) return null;
  return can("restaurant_kitchen_ops") || planTier === "growth" || planTier === "pro" ? <KitchenDisplayPageWithLayout /> : <NotFoundWithLayout />;
}

function ProtectedTablesRoute() {
  const { can, isLoading, planTier } = useTenant();
  if (isLoading) return null;
  return can("restaurant_table_service") || planTier === "growth" || planTier === "pro" ? <TablesManagementPageWithLayout /> : <NotFoundWithLayout />;
}

const OFFLINE_SESSION_KEY = "aurapos_session_cached";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [, setLocation] = useLocation();

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => {
        if (r.ok) {
          r.json().then((body) => {
            try {
              localStorage.setItem(OFFLINE_SESSION_KEY, JSON.stringify(body));
            } catch {}
          }).catch(() => {});
          setStatus("authenticated");
        } else {
          localStorage.removeItem(OFFLINE_SESSION_KEY);
          clearActiveTenantCache();
          clearActiveOutletId();
          setStatus("unauthenticated");
        }
      })
      .catch(() => {
        const cached = localStorage.getItem(OFFLINE_SESSION_KEY);
        if (cached) {
          setStatus("authenticated");
        } else {
          clearActiveTenantCache();
          clearActiveOutletId();
          setStatus("unauthenticated");
        }
      });
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      setLocation("/login");
    }
  }, [status, setLocation]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect x="3" y="8" width="22" height="14" rx="3" stroke="white" strokeWidth="2" fill="none" />
              <path d="M9 8V6a5 5 0 0 1 10 0v2" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <circle cx="14" cy="15" r="2" fill="white" />
            </svg>
          </div>
          <div className="flex gap-1.5 items-center">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/">
        <RequireAuth><POSPageWithLayout /></RequireAuth>
      </Route>
      <Route path="/hub">
        <RequireAuth><HomePageWithLayout /></RequireAuth>
      </Route>
      <Route path="/marketplace">
        <RequireAuth><MarketplacePageWithLayout /></RequireAuth>
      </Route>
      <Route path="/my-features">
        <RequireAuth><MyFeaturesPageWithLayout /></RequireAuth>
      </Route>
      <Route path="/pos">
        <RequireAuth><POSPageWithLayout /></RequireAuth>
      </Route>
      <Route path="/orders">
        <RequireAuth><OrdersPageWithLayout /></RequireAuth>
      </Route>
      <Route path="/kitchen">
        <RequireAuth><ProtectedKitchenRoute /></RequireAuth>
      </Route>
      <Route path="/tables">
        <RequireAuth><ProtectedTablesRoute /></RequireAuth>
      </Route>
      <Route path="/dashboard">
        <RequireAuth><DashboardPageWithLayout /></RequireAuth>
      </Route>
      <Route path="/products">
        <RequireAuth><ProductsPageWithLayout /></RequireAuth>
      </Route>
      <Route path="/stock">
        <RequireAuth><StockPageWithLayout /></RequireAuth>
      </Route>
      <Route path="/employees">
        <RequireAuth><EmployeesPageWithLayout /></RequireAuth>
      </Route>
      <Route path="/reports">
        <RequireAuth><ReportsPageWithLayout /></RequireAuth>
      </Route>
      <Route path="/printers">
        <RequireAuth><PrintersPageWithLayout /></RequireAuth>
      </Route>
      <Route path="/local-orders">
        <RequireAuth><LocalOrdersPageWithLayout /></RequireAuth>
      </Route>
      <Route path="/sync-conflicts">
        <RequireAuth><SyncConflictsPageWithLayout /></RequireAuth>
      </Route>
      <Route path="/store-profile">
        <RequireAuth><StoreProfilePageWithLayout /></RequireAuth>
      </Route>
      <Route path="/outlets">
        <RequireAuth><OutletsPageWithLayout /></RequireAuth>
      </Route>
      <Route path="/display" component={CustomerDisplayPage} />
      <Route path="/kds/activate" component={KdsActivatePage} />
      <Route path="/kds" component={KDSPage} />
      <Route path="/register-tenant" component={RedirectToRegister} />
      <Route component={NotFoundWithLayout} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TenantProvider>
        <OutletProvider>
          <TooltipProvider>
            <ToastProvider>
              <Router />
              <PortraitOverlay />
              <PwaUpdatePrompt />
              <PwaInstallPrompt />
            </ToastProvider>
          </TooltipProvider>
        </OutletProvider>
      </TenantProvider>
    </QueryClientProvider>
  );
}

export default App;
