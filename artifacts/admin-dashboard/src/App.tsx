import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useEffect, Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
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
import InvoicesPage, { InvoiceFormPage } from "@/pages/invoices";
import CalcInvoicePage from "@/pages/calc-invoice";
import StockLedgerPage from "@/pages/stock-ledger";
import StaffPage from "@/pages/staff";
import StaffNewPage from "@/pages/staff-new";
import HrmRolesPage from "@/pages/hrm-roles";
import HrmOrgPage from "@/pages/hrm-org";
import RecruitmentPage from "@/pages/recruitment";
import CustomersPage from "@/pages/customers";
import CustomerNewPage from "@/pages/customer-new";
import ProductsPage from "@/pages/products";
import ProductNewPage from "@/pages/product-new";
import CategoriesPage from "@/pages/categories";
import ProductGroupsPage from "@/pages/product-groups";
import BrandsPage from "@/pages/brands";
import ProductDepartmentsPage from "@/pages/product-departments";
import AttributesPage from "@/pages/attributes";
import UnitsPage from "@/pages/units";
import ShareholdersPage from "@/pages/shareholders";
import InvestmentPlansPage from "@/pages/investment-plans";
import MediaLibraryPage from "@/pages/media";
import SettingsPage from "@/pages/settings";
import PrintTemplatesPage from "@/pages/print-templates";
import InvoiceTemplatePage from "@/pages/invoice-template";
import TenantsPage from "@/pages/tenants";
import ModuleGroupsPage from "@/pages/module-groups";
import ChartOfAccountsPage from "@/pages/chart-of-accounts";
import JournalEntryPage from "@/pages/journal-entry";
import BalanceSheetPage from "@/pages/balance-sheet";
import LedgerReportPage from "@/pages/ledger-report";
import PlsReportPage from "@/pages/pls-report";
import TrialBalancePage from "@/pages/trial-balance";
import TrialBalance6ColPage from "@/pages/trial-balance-6col";
import ExpenseReportPage from "@/pages/expense-report";
import IncomeReportPage from "@/pages/income-report";
import ReceiptPaymentPage from "@/pages/receipt-payment";
import SaleReturnPage from "@/pages/sale-return";
import SalesAgentsPage from "@/pages/sales-agents";
import AgentNewPage from "@/pages/agent-new";
import AgentPerformancePage from "@/pages/agent-performance";
import AreasPage from "@/pages/areas";
import RawMaterialsPage from "@/pages/raw-materials";
import ManufacturingPage from "@/pages/manufacturing";
import ProductionGuidePage from "@/pages/production-guide";
import WebsiteCmsPage from "@/pages/website-cms";
import RepairPage from "@/pages/repair";
import PaymentAccountsPage from "@/pages/payment-accounts";

const queryClient = new QueryClient();

// Error boundary — prevents any page crash from showing a blank screen
class PageErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("Page error:", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <span className="text-destructive text-2xl">!</span>
          </div>
          <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
          <p className="text-sm text-muted-foreground max-w-md">{this.state.error.message}</p>
          <button
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
            <PageErrorBoundary>
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/leads" component={Leads} />
              <Route path="/documents" component={Documents} />
              <Route path="/documents/new" component={NewDocument} />
              <Route path="/documents/edit/:id" component={NewDocument} />
              <Route path="/documents/:id" component={DocumentDetail} />
              <Route path="/customers/new" component={CustomerNewPage} />
              <Route path="/customers" component={CustomersPage} />
              <Route path="/products/new" component={ProductNewPage} />
              <Route path="/products" component={ProductsPage} />
              <Route path="/brands" component={BrandsPage} />
              <Route path="/product-departments" component={ProductDepartmentsPage} />
              <Route path="/categories" component={CategoriesPage} />
              <Route path="/product-groups" component={ProductGroupsPage} />
              <Route path="/attributes" component={AttributesPage} />
              <Route path="/units" component={UnitsPage} />
              <Route path="/shareholders" component={ShareholdersPage} />
              <Route path="/investment-plans" component={InvestmentPlansPage} />
              <Route path="/purchases">{() => { const [,nav]=useLocation(); useEffect(()=>{nav("/invoices?type=purchase",{replace:true});},[]);return null; }}</Route>
              <Route path="/media" component={MediaLibraryPage} />
              <Route path="/invoices/new" component={InvoiceFormPage} />
              <Route path="/invoices/:id" component={InvoiceFormPage} />
              <Route path="/invoices" component={InvoicesPage} />
              <Route path="/calc-invoice" component={CalcInvoicePage} />
              <Route path="/sales-agents/new" component={AgentNewPage} />
              <Route path="/sales-agents" component={SalesAgentsPage} />
              <Route path="/agent-performance" component={AgentPerformancePage} />
              <Route path="/areas" component={AreasPage} />
              <Route path="/raw-materials" component={RawMaterialsPage} />
              <Route path="/manufacturing" component={ManufacturingPage} />
              <Route path="/production-guide" component={ProductionGuidePage} />
              <Route path="/sales/new" component={SalesPage} />
              <Route path="/sales" component={SalesPage} />
              <Route path="/stock-ledger" component={StockLedgerPage} />
              <Route path="/staff/new" component={StaffNewPage} />
              <Route path="/staff" component={StaffPage} />
              <Route path="/roles" component={HrmRolesPage} />
              <Route path="/hrm-org" component={HrmOrgPage} />
              <Route path="/recruitment" component={RecruitmentPage} />
              <Route path="/users" component={UsersPage} />
              <Route path="/tenants" component={TenantsPage} />
              <Route path="/module-groups" component={ModuleGroupsPage} />
              <Route path="/chart-of-accounts" component={ChartOfAccountsPage} />
              <Route path="/journal-entry" component={JournalEntryPage} />
              <Route path="/balance-sheet" component={BalanceSheetPage} />
              <Route path="/ledger-report" component={LedgerReportPage} />
              <Route path="/pls-report" component={PlsReportPage} />
              <Route path="/trial-balance" component={TrialBalancePage} />
              <Route path="/trial-balance-6col" component={TrialBalance6ColPage} />
              <Route path="/income-report" component={IncomeReportPage} />
              <Route path="/expense-report" component={ExpenseReportPage} />
              <Route path="/receipt-payment" component={ReceiptPaymentPage} />
              <Route path="/payment-accounts" component={PaymentAccountsPage} />
              <Route path="/sale-return" component={SaleReturnPage} />
              <Route path="/website-cms" component={WebsiteCmsPage} />
              <Route path="/repair" component={RepairPage} />
              <Route path="/settings" component={SettingsPage} />
              <Route path="/print-templates" component={PrintTemplatesPage} />
              <Route path="/invoice-template" component={InvoiceTemplatePage} />
              <Route component={NotFound} />
            </Switch>
            </PageErrorBoundary>
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
