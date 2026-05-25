import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useEffect, useRef, Component, lazy, Suspense } from "react";
import type { ComponentType, LazyExoticComponent, ErrorInfo, ReactNode } from "react";
import { backfillMissingSKUs, backfillOpeningBalanceJEs, backfillPOSCreditSaleJEs, retryFailedWrites, hasFailedWrites } from "@/lib/store";
import { ToastAction } from "@/components/ui/toast";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { Layout } from "@/components/layout";

/**
 * Detect the "stale chunk after deploy" error pattern.
 * After a deploy, the old hashed JS chunks (e.g. dashboard-RjT8IM95.js) are
 * removed from the server. A long-lived SPA tab still references them, so the
 * next lazy() import 404s. Browsers report this as one of these messages.
 */
function _isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "";
  return (
    name === "ChunkLoadError" ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Loading chunk \d+ failed/i.test(msg)
  );
}

/**
 * lazy() wrapper that, when a chunk fails to load (typical after a deploy
 * replaces the hashed asset filenames), retries once and then performs a
 * one-shot hard reload so the browser fetches the new index.html and the
 * new chunk hashes. A sessionStorage flag prevents reload loops.
 */
function lazyWithRetry<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    const RELOAD_FLAG = "onesoft:chunk-reload";
    try {
      return await importer();
    } catch (err) {
      if (!_isChunkLoadError(err)) throw err;
      // One quick retry — covers transient network blips.
      try {
        await new Promise(r => setTimeout(r, 400));
        return await importer();
      } catch (err2) {
        if (!_isChunkLoadError(err2)) throw err2;
        // Hard reload once, guarded so we don't loop forever on a real outage.
        const alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG);
        if (!alreadyReloaded) {
          sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
          window.location.reload();
          // Return a never-resolving promise so React keeps the Suspense
          // fallback up until the reload navigates away.
          return new Promise<{ default: T }>(() => {});
        }
        throw err2;
      }
    }
  });
}

// Clear the reload-guard flag once any chunk loads successfully on the new bundle.
if (typeof window !== "undefined") {
  window.addEventListener("load", () => {
    sessionStorage.removeItem("onesoft:chunk-reload");
  });
}

// Eagerly loaded — needed on first paint (login page, 404, auth shell)
import Login from "@/pages/login";
import NotFound from "@/pages/not-found";

// All page-level components are lazy-loaded so the initial JS bundle only
// contains the shell (auth, layout, routing). Each page chunk is fetched
// on-demand the first time a user navigates there.
const Dashboard             = lazyWithRetry(() => import("@/pages/dashboard"));
const SuperAdminDashboard   = lazyWithRetry(() => import("@/pages/dashboard").then(m => ({ default: m.SuperAdminDashboard })));
const ManagerDashboard      = lazyWithRetry(() => import("@/pages/manager-dashboard"));
const Leads                 = lazyWithRetry(() => import("@/pages/leads"));
const LeadsReportPage       = lazyWithRetry(() => import("@/pages/leads-report"));
const Documents             = lazyWithRetry(() => import("@/pages/documents"));
const DocumentDetail        = lazyWithRetry(() => import("@/pages/document-detail"));
const NewDocument           = lazyWithRetry(() => import("@/pages/new-document"));
const ShareDocument         = lazyWithRetry(() => import("@/pages/share-document"));
const ShareInvoicePage      = lazyWithRetry(() => import("@/pages/share-invoice"));
const UsersPage             = lazyWithRetry(() => import("@/pages/users"));
const SalesPage             = lazyWithRetry(() => import("@/pages/sales"));
const InvoicesPage          = lazyWithRetry(() => import("@/pages/invoices"));
const InvoiceFormPage       = lazyWithRetry(() => import("@/pages/invoices").then(m => ({ default: m.InvoiceFormPage })));
const CalcInvoicePage       = lazyWithRetry(() => import("@/pages/calc-invoice"));
const StockLedgerPage       = lazyWithRetry(() => import("@/pages/stock-ledger"));
const ProductStockReportPage = lazyWithRetry(() => import("@/pages/product-stock-report"));
const StaffPage             = lazyWithRetry(() => import("@/pages/staff"));
const StaffNewPage          = lazyWithRetry(() => import("@/pages/staff-new"));
const StaffEditPage         = lazyWithRetry(() => import("@/pages/staff-edit"));
const HrmSetupPage          = lazyWithRetry(() => import("@/pages/hrm-setup"));
const SalaryPage            = lazyWithRetry(() => import("@/pages/salary"));
const SalaryTemplatePage    = lazyWithRetry(() => import("@/pages/salary-template"));
const SalaryAllowancesPage  = lazyWithRetry(() => import("@/pages/salary-allowances"));
const SalaryDeductionsPage  = lazyWithRetry(() => import("@/pages/salary-deductions"));
const AdvanceSalaryPage     = lazyWithRetry(() => import("@/pages/advance-salary"));
const MyApplicationPage     = lazyWithRetry(() => import("@/pages/my-application"));
const ManageApplicationPage = lazyWithRetry(() => import("@/pages/manage-application"));
const AttendancePage        = lazyWithRetry(() => import("@/pages/attendance"));
const CustomersPage         = lazyWithRetry(() => import("@/pages/customers"));
const CustomerNewPage       = lazyWithRetry(() => import("@/pages/customer-new"));
const SupplierNewPage       = lazyWithRetry(() => import("@/pages/supplier-new"));
const CustomerEditPage      = lazyWithRetry(() => import("@/pages/customer-edit"));
const CustomerWalletPage    = lazyWithRetry(() => import("@/pages/customer-wallet"));
const ProductsPage          = lazyWithRetry(() => import("@/pages/products"));
const ProductNewPage        = lazyWithRetry(() => import("@/pages/product-new"));
const CategoriesPage        = lazyWithRetry(() => import("@/pages/categories"));
const ProductGroupsPage     = lazyWithRetry(() => import("@/pages/product-groups"));
const BrandsPage            = lazyWithRetry(() => import("@/pages/brands"));
const ProductDepartmentsPage = lazyWithRetry(() => import("@/pages/product-departments"));
const AttributesPage        = lazyWithRetry(() => import("@/pages/attributes"));
const UnitsPage             = lazyWithRetry(() => import("@/pages/units"));
const ShareholdersPage      = lazyWithRetry(() => import("@/pages/shareholders"));
const InvestmentPlansPage   = lazyWithRetry(() => import("@/pages/investment-plans"));
const MediaLibraryPage      = lazyWithRetry(() => import("@/pages/media"));
const SettingsPage          = lazyWithRetry(() => import("@/pages/settings"));
const PrintTemplatesPage    = lazyWithRetry(() => import("@/pages/print-templates"));
const InvoiceTemplatePage   = lazyWithRetry(() => import("@/pages/invoice-template"));
const TenantsPage           = lazyWithRetry(() => import("@/pages/tenants"));
const ModuleGroupsPage      = lazyWithRetry(() => import("@/pages/module-groups"));
const ChartOfAccountsPage   = lazyWithRetry(() => import("@/pages/chart-of-accounts"));
const JournalEntryPage      = lazyWithRetry(() => import("@/pages/journal-entry"));
const BalanceSheetPage      = lazyWithRetry(() => import("@/pages/balance-sheet"));
const LedgerReportPage      = lazyWithRetry(() => import("@/pages/ledger-report"));
const PlsReportPage         = lazyWithRetry(() => import("@/pages/pls-report"));
const TrialBalancePage      = lazyWithRetry(() => import("@/pages/trial-balance"));
const TrialBalance6ColPage  = lazyWithRetry(() => import("@/pages/trial-balance-6col"));
const ExpenseReportPage     = lazyWithRetry(() => import("@/pages/expense-report"));
const IncomeReportPage      = lazyWithRetry(() => import("@/pages/income-report"));
const ReceiptPaymentPage    = lazyWithRetry(() => import("@/pages/receipt-payment"));
const RpSummaryPage         = lazyWithRetry(() => import("@/pages/rp-summary"));
const TransactionHistoryPage = lazyWithRetry(() => import("@/pages/transaction-history"));
const WalletReportPage       = lazyWithRetry(() => import("@/pages/wallet-report"));
const ReturnsPage           = lazyWithRetry(() => import("@/pages/returns"));
const SalesAgentsPage       = lazyWithRetry(() => import("@/pages/sales-agents"));
const AgentNewPage          = lazyWithRetry(() => import("@/pages/agent-new"));
const AgentPerformancePage  = lazyWithRetry(() => import("@/pages/agent-performance"));
const AreasPage             = lazyWithRetry(() => import("@/pages/areas"));
const RawMaterialsPage      = lazyWithRetry(() => import("@/pages/raw-materials"));
const ManufacturingPage     = lazyWithRetry(() => import("@/pages/manufacturing"));
const ProductionGuidePage   = lazyWithRetry(() => import("@/pages/production-guide"));
const ProductionReportPage  = lazyWithRetry(() => import("@/pages/production-report"));
const WebsiteCmsPage        = lazyWithRetry(() => import("@/pages/website-cms"));
const RepairPage            = lazyWithRetry(() => import("@/pages/repair"));
const RepairReportPage      = lazyWithRetry(() => import("@/pages/repair-report"));
const PaymentAccountsPage   = lazyWithRetry(() => import("@/pages/payment-accounts"));
const DatabaseViewerPage    = lazyWithRetry(() => import("@/pages/database-viewer"));
const ActivityLogPage       = lazyWithRetry(() => import("@/pages/activity-log"));

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
      const isChunkErr = _isChunkLoadError(this.state.error);
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <span className="text-destructive text-2xl">!</span>
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            {isChunkErr ? "A new version is available" : "Something went wrong"}
          </h2>
          <p className="text-sm text-muted-foreground max-w-md">
            {isChunkErr
              ? "The app was updated while this tab was open. Reload to load the latest version."
              : this.state.error.message}
          </p>
          <button
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90"
            onClick={() => {
              if (isChunkErr) {
                sessionStorage.removeItem("onesoft:chunk-reload");
                window.location.reload();
              } else {
                this.setState({ error: null });
              }
            }}
          >
            {isChunkErr ? "Reload page" : "Try again"}
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
  const { isAuthenticated, isBootstrapping, currentTenantId } = useAuth();
  const [location, navigate] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    // Hold the /login redirect while the auth context is still hydrating
    // the user record from the API (tenant/staff/agent logins need a sync
    // round-trip after a fresh page load). Without this gate, refresh would
    // briefly flash the login screen before bouncing back via ?from=…
    if (!isAuthenticated && !isBootstrapping) {
      navigate(`/login?from=${encodeURIComponent(location)}`, { replace: true });
    }
  }, [isAuthenticated, isBootstrapping]);

  // Run one-time backfills on login. Each backfill self-skips when the cache is
  // unsafe (failed writes or partial COA load) — see _isSafeToHeal() in store.ts.
  // _backfillsDoneRef ensures we don't loop them once they have completed.
  const _backfillsDoneRef = useRef(false);
  const runBackfillsIfSafe = () => {
    if (_backfillsDoneRef.current) return;
    // Each backfill returns true only if its _isSafeToHeal() guard passed AND
    // it executed (or no-op'd because data was already clean).  It returns
    // false when skipped due to unsafe cache (failed writes OR partial COA).
    const r1 = backfillMissingSKUs();
    const r2 = backfillOpeningBalanceJEs();
    const r3 = backfillPOSCreditSaleJEs();
    // Mark done ONLY when all three backfills actually ran AND no new failed
    // writes were generated during the run.  If any was skipped-unsafe, we
    // leave the ref false so the recovered/interval triggers will retry.
    if (r1 && r2 && r3 && !hasFailedWrites()) _backfillsDoneRef.current = true;
  };
  useEffect(() => {
    if (isAuthenticated) {
      // Reset on login AND on tenant context change (superadmin "switch to"
      // tenant view, exit-impersonation, etc.). Each tenant has its own
      // KV namespace, so backfills must be re-evaluated per tenant.
      _backfillsDoneRef.current = false;
      runBackfillsIfSafe();
    }
  }, [isAuthenticated, currentTenantId]);

  useEffect(() => {
    const errHandler = (e: Event) => {
      const detail = (e as CustomEvent<{ key: string; message: string }>).detail;
      toast({
        title: "Save failed — your change is held in memory",
        description: `Could not save to server (${detail?.key ?? "unknown"}). The dashboard will not overwrite this unsaved data on refresh. Click Retry once your connection is back.`,
        variant: "destructive",
        duration: 12000,
        action: (
          <ToastAction
            altText="Retry save"
            onClick={async () => {
              const { success, failed } = await retryFailedWrites();
              if (failed === 0 && success > 0) {
                toast({ title: "Saved", description: `Recovered ${success} unsaved change(s).` });
              } else if (failed > 0) {
                toast({
                  title: "Retry failed",
                  description: `${success} succeeded, ${failed} still failing. Check API server.`,
                  variant: "destructive",
                });
              }
            }}
          >
            Retry
          </ToastAction>
        ),
      });
    };
    const recHandler = (e: Event) => {
      const detail = (e as CustomEvent<{ key: string }>).detail;
      if (!hasFailedWrites()) {
        toast({
          title: "Connection recovered",
          description: `Server save succeeded (${detail?.key ?? "all changes"}). Your data is safe.`,
          duration: 4000,
        });
        // Now that the cache is safe again, retry any one-time backfills that
        // were skipped earlier by their _isSafeToHeal() guard.
        runBackfillsIfSafe();
      }
    };
    window.addEventListener("onesoft:write-error", errHandler);
    window.addEventListener("onesoft:write-recovered", recHandler);
    return () => {
      window.removeEventListener("onesoft:write-error", errHandler);
      window.removeEventListener("onesoft:write-recovered", recHandler);
    };
  }, [toast]);

  // Auto-retry failed writes every 15 s so transient outages self-heal
  // without the user having to click Retry manually.
  useEffect(() => {
    if (!isAuthenticated) return;
    const id = window.setInterval(() => {
      if (hasFailedWrites()) {
        void retryFailedWrites();
      } else {
        // Cache is currently safe — opportunistically retry any backfills that
        // were skipped on an earlier unsafe pass.
        runBackfillsIfSafe();
      }
    }, 15_000);
    return () => window.clearInterval(id);
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    // Still resolving the user from the API — render a neutral skeleton so
    // the auth page doesn't flash on refresh for tenant/staff/agent logins.
    if (isBootstrapping) return <PageSkeleton />;
    return null;
  }
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
