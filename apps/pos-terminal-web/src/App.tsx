import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
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

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/" component={POSPageWithLayout} />
      <Route path="/hub" component={HomePageWithLayout} />
      <Route path="/pos" component={POSPageWithLayout} />
      <Route path="/orders" component={OrdersPageWithLayout} />
      <Route path="/kitchen" component={ProtectedKitchenRoute} />
      <Route path="/tables" component={ProtectedTablesRoute} />
      <Route path="/dashboard" component={DashboardPageWithLayout} />
      <Route path="/products" component={ProductsPageWithLayout} />
      <Route path="/stock" component={StockPageWithLayout} />
      <Route path="/employees" component={EmployeesPageWithLayout} />
      <Route path="/reports" component={ReportsPageWithLayout} />
      <Route path="/store-profile" component={StoreProfilePageWithLayout} />
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
