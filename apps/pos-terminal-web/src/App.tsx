import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PortraitOverlay } from "@/components/PortraitOverlay";
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
import PrintersPage from "@/pages/printers";
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

const PrintersPageWithLayout = () => (
  <MainLayout>
    <PrintersPage />
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
      <Route path="/printers">
        <RequireAuth>
          <PrintersPageWithLayout />
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
