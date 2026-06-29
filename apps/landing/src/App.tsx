import LandingPage from "@/pages/LandingPage";
import MockupPOSDesktopPage from "@/mockup-assets/pages/MockupPOSDesktopPage";
import MockupActiveOrdersPage from "@/mockup-assets/pages/MockupActiveOrdersPage";
import MockupReportsMobilePage from "@/mockup-assets/pages/MockupReportsMobilePage";
import MockupPaymentDialogPage from "@/mockup-assets/pages/MockupPaymentDialogPage";
import MockupInventoryPage from "@/mockup-assets/pages/MockupInventoryPage";
import MockupProductsPage from "@/mockup-assets/pages/MockupProductsPage";
import MockupRestaurantTablesPage from "@/mockup-assets/pages/MockupRestaurantTablesPage";
import MockupDashboardPage from "@/mockup-assets/pages/MockupDashboardPage";

export default function App() {
  switch (window.location.pathname) {
    case "/":
    case "/landing":
      return <LandingPage />;
    case "/mockup-assets/pos-desktop":
      return <MockupPOSDesktopPage />;
    case "/mockup-assets/active-orders":
      return <MockupActiveOrdersPage />;
    case "/mockup-assets/reports-mobile":
      return <MockupReportsMobilePage />;
    case "/mockup-assets/payment-dialog":
      return <MockupPaymentDialogPage />;
    case "/mockup-assets/inventory":
      return <MockupInventoryPage />;
    case "/mockup-assets/products":
      return <MockupProductsPage />;
    case "/mockup-assets/restaurant-tables":
      return <MockupRestaurantTablesPage />;
    case "/mockup-assets/dashboard":
      return <MockupDashboardPage />;
    default:
      return <LandingPage />;
  }
}
