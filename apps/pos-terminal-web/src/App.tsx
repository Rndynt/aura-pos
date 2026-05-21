import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PortraitOverlay } from "@/components/PortraitOverlay";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState } from "react";
import HomePage from "@/pages/home";
import POSPage from "@/pages/pos";
import OrdersPage from "@/pages/orders";
import TablesManagementPage from "@/pages/tables-management";
import DashboardPage from "@/pages/dashboard";
import ProductsPage from "@/pages/products";
import ReportsPage from "@/pages/reports";
import StockPage from "@/pages/stock";
import EmployeesPage from "@/pages/employees";
import StoreProfilePage from "@/pages/store-profile";
import KitchenDisplayPage from "@/pages/kitchen-display";
import CustomerDisplayPage from "@/pages/customer-display";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import { TenantProvider, useTenant } from "@/context/TenantContext";
import { MainLayout } from "@/components/layout/MainLayout";

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

const DashboardPageWithLayout = () => (
  <MainLayout>
    <DashboardPage />
  </MainLayout>
);

const ProductsPageWithLayout = () => (
  <MainLayout>
    <ProductsPage />
  </MainLayout>
);

const StockPageWithLayout = () => (
  <MainLayout>
    <StockPage />
  </MainLayout>
);

const EmployeesPageWithLayout = () => (
  <MainLayout>
    <EmployeesPage />
  </MainLayout>
);

const ReportsPageWithLayout = () => (
  <MainLayout>
    <ReportsPage />
  </MainLayout>
);

const StoreProfilePageWithLayout = () => (
  <MainLayout>
    <StoreProfilePage />
  </MainLayout>
);

const KitchenDisplayPageWithLayout = () => (
  <MainLayout hideBottomNav>
    <KitchenDisplayPage />
  </MainLayout>
);

const NotFoundWithLayout = () => (
  <MainLayout>
    <NotFound />
  </MainLayout>
);

function ProtectedKitchenRoute() {
  const { hasModule } = useTenant();
  return hasModule("enable_kitchen_ticket") ? <KitchenDisplayPageWithLayout /> : <NotFoundWithLayout />;
}

function ProtectedTablesRoute() {
  const { hasModule } = useTenant();
  return hasModule("enable_table_management") ? <TablesManagementPageWithLayout /> : <NotFoundWithLayout />;
}

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [, setLocation] = useLocation();

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => {
        if (r.ok) {
          setStatus("authenticated");
        } else {
          setStatus("unauthenticated");
        }
      })
      .catch(() => setStatus("unauthenticated"));
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      setLocation("/login");
    }
  }, [status, setLocation]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        {/* Skeleton: category chips */}
        <div className="px-4 pt-4 pb-2 flex gap-2">
          <Skeleton className="h-9 w-24 rounded-full flex-shrink-0" />
          <Skeleton className="h-9 w-20 rounded-full flex-shrink-0" />
          <Skeleton className="h-9 w-20 rounded-full flex-shrink-0" />
        </div>
        {/* Skeleton: search + draft */}
        <div className="px-4 pb-3 flex gap-2">
          <Skeleton className="h-9 flex-1 rounded-xl" />
          <Skeleton className="h-9 w-20 rounded-xl flex-shrink-0" />
        </div>
        {/* Skeleton: product grid */}
        <div className="px-4 grid grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl overflow-hidden border border-slate-100">
              <Skeleton className="h-32 w-full" />
              <div className="p-3 space-y-2">
                <Skeleton className="h-4 w-3/4 rounded" />
                <Skeleton className="h-3 w-1/2 rounded" />
                <Skeleton className="h-3 w-1/3 rounded" />
                <Skeleton className="h-8 w-full rounded-lg mt-1" />
              </div>
            </div>
          ))}
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
        <RequireAuth>
          <POSPageWithLayout />
        </RequireAuth>
      </Route>
      <Route path="/hub">
        <RequireAuth>
          <HomePageWithLayout />
        </RequireAuth>
      </Route>
      <Route path="/pos">
        <RequireAuth>
          <POSPageWithLayout />
        </RequireAuth>
      </Route>
      <Route path="/orders">
        <RequireAuth>
          <OrdersPageWithLayout />
        </RequireAuth>
      </Route>
      <Route path="/kitchen">
        <RequireAuth>
          <ProtectedKitchenRoute />
        </RequireAuth>
      </Route>
      <Route path="/tables">
        <RequireAuth>
          <ProtectedTablesRoute />
        </RequireAuth>
      </Route>
      <Route path="/dashboard">
        <RequireAuth>
          <DashboardPageWithLayout />
        </RequireAuth>
      </Route>
      <Route path="/products">
        <RequireAuth>
          <ProductsPageWithLayout />
        </RequireAuth>
      </Route>
      <Route path="/stock">
        <RequireAuth>
          <StockPageWithLayout />
        </RequireAuth>
      </Route>
      <Route path="/employees">
        <RequireAuth>
          <EmployeesPageWithLayout />
        </RequireAuth>
      </Route>
      <Route path="/reports">
        <RequireAuth>
          <ReportsPageWithLayout />
        </RequireAuth>
      </Route>
      <Route path="/store-profile">
        <RequireAuth>
          <StoreProfilePageWithLayout />
        </RequireAuth>
      </Route>
      {/* Customer Facing Display — tidak butuh auth, full-screen tanpa layout */}
      <Route path="/display" component={CustomerDisplayPage} />
      <Route component={NotFoundWithLayout} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TenantProvider>
        <TooltipProvider>
          <ToastProvider>
            <Router />
            <PortraitOverlay />
          </ToastProvider>
        </TooltipProvider>
      </TenantProvider>
    </QueryClientProvider>
  );
}

export default App;
