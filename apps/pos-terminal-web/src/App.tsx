import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 animate-pulse" />
          <p className="text-sm text-slate-400 font-medium">Memuat...</p>
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
          </ToastProvider>
        </TooltipProvider>
      </TenantProvider>
    </QueryClientProvider>
  );
}

export default App;
