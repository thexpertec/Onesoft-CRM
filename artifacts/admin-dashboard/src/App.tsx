import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import Login from "@/pages/login";

import Dashboard from "@/pages/dashboard";
import Leads from "@/pages/leads";
import Documents from "@/pages/documents";
import DocumentDetail from "@/pages/document-detail";
import NewDocument from "@/pages/new-document";
import ShareDocument from "@/pages/share-document";
import UsersPage from "@/pages/users";
import SalesPage from "@/pages/sales";
import InvoicesPage from "@/pages/invoices";
import StockPage from "@/pages/stock";
import StaffPage from "@/pages/staff";
import HrmRolesPage from "@/pages/hrm-roles";
import CustomersPage from "@/pages/customers";
import ProductsPage from "@/pages/products";
import CategoriesPage from "@/pages/categories";
import BrandsPage from "@/pages/brands";
import AttributesPage from "@/pages/attributes";
import UnitsPage from "@/pages/units";
import SuppliersPage from "@/pages/suppliers";
import PurchasesPage from "@/pages/purchases";
import MediaLibraryPage from "@/pages/media";
import SettingsPage from "@/pages/settings";
import TenantsPage from "@/pages/tenants";
import ModuleGroupsPage from "@/pages/module-groups";

const queryClient = new QueryClient();

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate(`/login?from=${encodeURIComponent(location)}`, { replace: true });
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) return null;
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/share/:id" component={ShareDocument} />
      <Route>
        <RequireAuth>
          <Layout>
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/leads" component={Leads} />
              <Route path="/documents" component={Documents} />
              <Route path="/documents/new" component={NewDocument} />
              <Route path="/documents/edit/:id" component={NewDocument} />
              <Route path="/documents/:id" component={DocumentDetail} />
              <Route path="/customers" component={CustomersPage} />
              <Route path="/products" component={ProductsPage} />
              <Route path="/brands" component={BrandsPage} />
              <Route path="/categories" component={CategoriesPage} />
              <Route path="/attributes" component={AttributesPage} />
              <Route path="/units" component={UnitsPage} />
              <Route path="/suppliers" component={SuppliersPage} />
              <Route path="/purchases" component={PurchasesPage} />
              <Route path="/media" component={MediaLibraryPage} />
              <Route path="/invoices" component={InvoicesPage} />
              <Route path="/sales/new" component={SalesPage} />
              <Route path="/sales" component={SalesPage} />
              <Route path="/stock/holds" component={StockPage} />
              <Route path="/stock" component={StockPage} />
              <Route path="/staff" component={StaffPage} />
              <Route path="/roles" component={HrmRolesPage} />
              <Route path="/users" component={UsersPage} />
              <Route path="/tenants" component={TenantsPage} />
              <Route path="/module-groups" component={ModuleGroupsPage} />
              <Route path="/settings" component={SettingsPage} />
              <Route component={NotFound} />
            </Switch>
          </Layout>
        </RequireAuth>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="onesoft-theme">
        <AuthProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
