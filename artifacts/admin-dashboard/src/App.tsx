import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useEffect, Component, lazy, Suspense } from "react";
import { backfillMissingSKUs, backfillOpeningBalanceJEs, backfillPOSCreditSaleJEs, deduplicateOpeningBalanceJEs } from "@/lib/store";
import type { ErrorInfo, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { Layout } from "@/components/layout";

// Eagerly loaded — needed on first paint (login page, 404, auth shell)
import Login from "@/pages/login";
import NotFound from "@/pages/not-found";

// All page-level components are lazy-loaded so the initial JS bundle only
// contains the shell (auth, layout, routing). Each page chunk is fetched
// on-demand the first time a user navigates there.
const Dashboard             = lazy(() => import("@/pages/dashboard"));
const SuperAdminDashboard   = lazy(() => import("@/pages/dashboard").then(m => ({ default: m.SuperAdminDashboard })));
const ManagerDashboard      = lazy(() => import("@/pages/manager-dashboard"));
const Leads                 = lazy(() => import("@/pages/leads"));
const LeadsReportPage       = lazy(() => import("@/pages/leads-report"));
const Documents             = lazy(() => import("@/pages/documents"));
const DocumentDetail        = lazy(() => import("@/pages/document-detail"));
const NewDocument           = lazy(() => import("@/pages/new-document"));
const ShareDocument         = lazy(() => import("@/pages/share-document"));
const ShareInvoicePage      = lazy(() => import("@/pages/share-invoice"));
const UsersPage             = lazy(() => import("@/pages/users"));
const SalesPage             = lazy(() => import("@/pages/sales"));
const InvoicesPage          = lazy(() => import("@/pages/invoices"));
const InvoiceFormPage       = lazy(() => import("@/pages/invoices").then(m => ({ default: m.InvoiceFormPage })));
const CalcInvoicePage       = lazy(() => import("@/pages/calc-invoice"));
const StockLedgerPage       = lazy(() => import("@/pages/stock-ledger"));
const ProductStockReportPage = lazy(() => import("@/pages/product-stock-report"));
const StaffPage             = lazy(() => import("@/pages/staff"));
const StaffNewPage          = lazy(() => import("@/pages/staff-new"));
const StaffEditPage         = lazy(() => import("@/pages/staff-edit"));
const HrmSetupPage          = lazy(() => import("@/pages/hrm-setup"));
const SalaryPage            = lazy(() => import("@/pages/salary"));
const SalaryTemplatePage    = lazy(() => import("@/pages/salary-template"));
const SalaryAllowancesPage  = lazy(() => import("@/pages/salary-allowances"));
const SalaryDeductionsPage  = lazy(() => import("@/pages/salary-deductions"));
const AdvanceSalaryPage     = lazy(() => import("@/pages/advance-salary"));
const MyApplicationPage     = lazy(() => import("@/pages/my-application"));
const ManageApplicationPage = lazy(() => import("@/pages/manage-application"));
const AttendancePage        = lazy(() => import("@/pages/attendance"));
const CustomersPage         = lazy(() => import("@/pages/customers"));
const CustomerNewPage       = lazy(() => import("@/pages/customer-new"));
const SupplierNewPage       = lazy(() => import("@/pages/supplier-new"));
const CustomerEditPage      = lazy(() => import("@/pages/customer-edit"));
const CustomerWalletPage    = lazy(() => import("@/pages/customer-wallet"));
const ProductsPage          = lazy(() => import("@/pages/products"));
const ProductNewPage        = lazy(() => import("@/pages/product-new"));
const CategoriesPage        = lazy(() => import("@/pages/categories"));
const ProductGroupsPage     = lazy(() => import("@/pages/product-groups"));
const BrandsPage            = lazy(() => import("@/pages/brands"));
const ProductDepartmentsPage = lazy(() => import("@/pages/product-departments"));
const AttributesPage        = lazy(() => import("@/pages/attributes"));
const UnitsPage             = lazy(() => import("@/pages/units"));
const ShareholdersPage      = lazy(() => import("@/pages/shareholders"));
const InvestmentPlansPage   = lazy(() => import("@/pages/investment-plans"));
const MediaLibraryPage      = lazy(() => import("@/pages/media"));
const SettingsPage          = lazy(() => import("@/pages/settings"));
const PrintTemplatesPage    = lazy(() => import("@/pages/print-templates"));
const InvoiceTemplatePage   = lazy(() => import("@/pages/invoice-template"));
const TenantsPage           = lazy(() => import("@/pages/tenants"));
const ModuleGroupsPage      = lazy(() => import("@/pages/module-groups"));
const ChartOfAccountsPage   = lazy(() => import("@/pages/chart-of-accounts"));
const JournalEntryPage      = lazy(() => import("@/pages/journal-entry"));
const BalanceSheetPage      = lazy(() => import("@/pages/balance-sheet"));
const LedgerReportPage      = lazy(() => import("@/pages/ledger-report"));
const PlsReportPage         = lazy(() => import("@/pages/pls-report"));
const TrialBalancePage      = lazy(() => import("@/pages/trial-balance"));
const TrialBalance6ColPage  = lazy(() => import("@/pages/trial-balance-6col"));
const ExpenseReportPage     = lazy(() => import("@/pages/expense-report"));
const IncomeReportPage      = lazy(() => import("@/pages/income-report"));
const ReceiptPaymentPage    = lazy(() => import("@/pages/receipt-payment"));
const RpSummaryPage         = lazy(() => import("@/pages/rp-summary"));
const TransactionHistoryPage = lazy(() => import("@/pages/transaction-history"));
const WalletReportPage       = lazy(() => import("@/pages/wallet-report"));
const ReturnsPage           = lazy(() => import("@/pages/returns"));
const SalesAgentsPage       = lazy(() => import("@/pages/sales-agents"));
const AgentNewPage          = lazy(() => import("@/pages/agent-new"));
const AgentPerformancePage  = lazy(() => import("@/pages/agent-performance"));
const AreasPage             = lazy(() => import("@/pages/areas"));
const RawMaterialsPage      = lazy(() => import("@/pages/raw-materials"));
const ManufacturingPage     = lazy(() => import("@/pages/manufacturing"));
const ProductionGuidePage   = lazy(() => import("@/pages/production-guide"));
const ProductionReportPage  = lazy(() => import("@/pages/production-report"));
const WebsiteCmsPage        = lazy(() => import("@/pages/website-cms"));
const RepairPage            = lazy(() => import("@/pages/repair"));
const RepairReportPage      = lazy(() => import("@/pages/repair-report"));
const PaymentAccountsPage   = lazy(() => import("@/pages/payment-accounts"));
const DatabaseViewerPage    = lazy(() => import("@/pages/database-viewer"));
const ActivityLogPage       = lazy(() => import("@/pages/activity-log"));

const queryClient = new QueryClient();

function PageSkeleton() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="w-6 h-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
    </div>
  );
}

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

function PurchasesRedirect() {
  const [, nav] = useLocation();
  useEffect(() => { nav("/invoices?type=purchase", { replace: true }); }, []);
  return null;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [location, navigate] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate(`/login?from=${encodeURIComponent(location)}`, { replace: true });
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      deduplicateOpeningBalanceJEs(); // must run before backfill to fix any corrupted entries first
      backfillMissingSKUs();
      backfillOpeningBalanceJEs();
      backfillPOSCreditSaleJEs();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ key: string; message: string }>).detail;
      toast({
        title: "Save failed — please refresh",
        description: `Could not save to server (${detail?.key ?? "unknown"}). Your recent change may be lost after refresh. Check your connection.`,
        variant: "destructive",
        duration: 8000,
      });
    };
    window.addEventListener("onesoft:write-error", handler);
    return () => window.removeEventListener("onesoft:write-error", handler);
  }, [toast]);

  if (!isAuthenticated) return null;
  return <>{children}</>;
}

function HomeRoute() {
  const { isManager, isSuperAdmin, currentTenantId } = useAuth();
  if (isSuperAdmin && !currentTenantId) return <SuperAdminDashboard />;
  if (isManager) return <ManagerDashboard />;
  return <Dashboard />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/share/:id">
        <Suspense fallback={<PageSkeleton />}><ShareDocument /></Suspense>
      </Route>
      <Route path="/invoice-view/:id">
        <Suspense fallback={<PageSkeleton />}><ShareInvoicePage /></Suspense>
      </Route>
      <Route>
        <RequireAuth>
          <Layout>
            <PageErrorBoundary>
              <Suspense fallback={<PageSkeleton />}>
                <Switch>
                  <Route path="/" component={HomeRoute} />
                  <Route path="/manager-dashboard" component={ManagerDashboard} />
                  <Route path="/leads-report"       component={LeadsReportPage} />
                  <Route path="/leads"              component={Leads} />
                  <Route path="/documents/new"      component={NewDocument} />
                  <Route path="/documents/edit/:id" component={NewDocument} />
                  <Route path="/documents/:id"      component={DocumentDetail} />
                  <Route path="/documents"          component={Documents} />
                  <Route path="/customers/new"           component={CustomerNewPage} />
                  <Route path="/suppliers/new"           component={SupplierNewPage} />
                  <Route path="/customers/:id/wallet"    component={CustomerWalletPage} />
                  <Route path="/customers/:id/edit"      component={CustomerEditPage} />
                  <Route path="/customers"               component={CustomersPage} />
                  <Route path="/product-stock-report" component={ProductStockReportPage} />
                  <Route path="/products/new"       component={ProductNewPage} />
                  <Route path="/products"           component={ProductsPage} />
                  <Route path="/brands"             component={BrandsPage} />
                  <Route path="/product-departments" component={ProductDepartmentsPage} />
                  <Route path="/categories"         component={CategoriesPage} />
                  <Route path="/product-groups"     component={ProductGroupsPage} />
                  <Route path="/attributes"         component={AttributesPage} />
                  <Route path="/units"              component={UnitsPage} />
                  <Route path="/shareholders"       component={ShareholdersPage} />
                  <Route path="/investment-plans"   component={InvestmentPlansPage} />
                  <Route path="/purchases"          component={PurchasesRedirect} />
                  <Route path="/media"              component={MediaLibraryPage} />
                  <Route path="/invoices/new"       component={InvoiceFormPage} />
                  <Route path="/invoices/:id"       component={InvoiceFormPage} />
                  <Route path="/invoices"           component={InvoicesPage} />
                  <Route path="/calc-invoice"       component={CalcInvoicePage} />
                  <Route path="/sales-agents/new"   component={AgentNewPage} />
                  <Route path="/sales-agents"       component={SalesAgentsPage} />
                  <Route path="/agent-performance"  component={AgentPerformancePage} />
                  <Route path="/areas"              component={AreasPage} />
                  <Route path="/raw-materials"      component={RawMaterialsPage} />
                  <Route path="/manufacturing"      component={ManufacturingPage} />
                  <Route path="/production-guide"   component={ProductionGuidePage} />
                  <Route path="/production-report"  component={ProductionReportPage} />
                  <Route path="/sales/new"          component={SalesPage} />
                  <Route path="/sales"              component={SalesPage} />
                  <Route path="/stock-ledger"       component={StockLedgerPage} />
                  <Route path="/staff/:id/edit"     component={StaffEditPage} />
                  <Route path="/staff/new"          component={StaffNewPage} />
                  <Route path="/staff"              component={StaffPage} />
                  <Route path="/roles"   component={HrmSetupPage} />
                  <Route path="/hrm-org" component={HrmSetupPage} />
                  <Route path="/hrm-setup"          component={HrmSetupPage} />
                  <Route path="/salary"             component={SalaryPage} />
                  <Route path="/salary-template"    component={SalaryTemplatePage} />
                  <Route path="/salary-allowances"  component={SalaryAllowancesPage} />
                  <Route path="/salary-deductions"  component={SalaryDeductionsPage} />
                  <Route path="/advance-salary"     component={AdvanceSalaryPage} />
                  <Route path="/my-application"     component={MyApplicationPage} />
                  <Route path="/manage-application" component={ManageApplicationPage} />
                  <Route path="/attendance"         component={AttendancePage} />
                  <Route path="/users"              component={UsersPage} />
                  <Route path="/tenants"            component={TenantsPage} />
                  <Route path="/module-groups"      component={ModuleGroupsPage} />
                  <Route path="/database"           component={DatabaseViewerPage} />
                  <Route path="/activity-log"       component={ActivityLogPage} />
                  <Route path="/chart-of-accounts"  component={ChartOfAccountsPage} />
                  <Route path="/journal-entry"      component={JournalEntryPage} />
                  <Route path="/balance-sheet"      component={BalanceSheetPage} />
                  <Route path="/ledger-report"      component={LedgerReportPage} />
                  <Route path="/pls-report"         component={PlsReportPage} />
                  <Route path="/trial-balance"      component={TrialBalancePage} />
                  <Route path="/trial-balance-6col" component={TrialBalance6ColPage} />
                  <Route path="/income-report"      component={IncomeReportPage} />
                  <Route path="/expense-report"     component={ExpenseReportPage} />
                  <Route path="/receipt-payment"    component={ReceiptPaymentPage} />
                  <Route path="/rp-summary"         component={RpSummaryPage} />
                  <Route path="/transaction-history" component={TransactionHistoryPage} />
                  <Route path="/payment-accounts"   component={PaymentAccountsPage} />
                  <Route path="/wallet-report"       component={WalletReportPage} />
                  <Route path="/returns"            component={ReturnsPage} />
                  <Route path="/website-cms"        component={WebsiteCmsPage} />
                  <Route path="/repair"             component={RepairPage} />
                  <Route path="/repair-report"      component={RepairReportPage} />
                  <Route path="/settings"           component={SettingsPage} />
                  <Route path="/print-templates"    component={PrintTemplatesPage} />
                  <Route path="/invoice-template"   component={InvoiceTemplatePage} />
                  <Route component={NotFound} />
                </Switch>
              </Suspense>
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
