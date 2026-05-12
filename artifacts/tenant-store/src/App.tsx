import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StoreProvider } from "@/contexts/store-context";
import { CartProvider } from "@/lib/cart";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { CartDrawer } from "@/components/cart-drawer";
import NotFound from "@/pages/not-found";

// Lazy-loaded page components — fetched on-demand as the user navigates
const HomePage         = lazy(() => import("@/pages/home").then(m => ({ default: m.HomePage })));
const ShopPage         = lazy(() => import("@/pages/shop").then(m => ({ default: m.ShopPage })));
const ProductDetailPage = lazy(() => import("@/pages/product-detail").then(m => ({ default: m.ProductDetailPage })));
const CategoryPage     = lazy(() => import("@/pages/category").then(m => ({ default: m.CategoryPage })));
const CheckoutPage     = lazy(() => import("@/pages/checkout").then(m => ({ default: m.CheckoutPage })));
const ServicesPage     = lazy(() => import("@/pages/services").then(m => ({ default: m.ServicesPage })));
const AboutPage        = lazy(() => import("@/pages/about").then(m => ({ default: m.AboutPage })));
const ContactPage      = lazy(() => import("@/pages/contact").then(m => ({ default: m.ContactPage })));

const queryClient = new QueryClient();

function PageSkeleton() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="w-6 h-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
    </div>
  );
}

// ── Inner router (all routes relative to /{tenantId}) ──────────────────────────
function StoreRouter() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-slate-950">
      <Header />
      <main className="flex-1">
        <Suspense fallback={<PageSkeleton />}>
          <Switch>
            <Route path="/"               component={HomePage} />
            <Route path="/home"           component={HomePage} />
            <Route path="/shop"           component={ShopPage} />
            <Route path="/product/:id"    component={ProductDetailPage} />
            <Route path="/category/:slug" component={CategoryPage} />
            <Route path="/checkout"       component={CheckoutPage} />
            <Route path="/services"       component={ServicesPage} />
            <Route path="/about"          component={AboutPage} />
            <Route path="/contact"        component={ContactPage} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </main>
      <Footer />
      <CartDrawer />
    </div>
  );
}

// ── Tenant router — reads tenantId from first URL path segment ─────────────────
// Lives inside the outer WouterRouter (base = Vite BASE_URL), so useLocation()
// already has the base stripped, e.g.  "/12/shop"
function TenantRouter() {
  const [location] = useLocation();

  // First non-empty segment is the tenantId
  const tenantId = location.split("/").filter(Boolean)[0] ?? null;

  if (!tenantId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center px-6">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">No store selected</h1>
          <p className="text-slate-400 text-sm">
            Please use your tenant store link, e.g.<br />
            <span className="text-blue-400 font-mono">/STORE_ID/home</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <StoreProvider tenantId={tenantId}>
      <CartProvider>
        {/* Nested router: base = /{tenantId} — all <Link href="/shop"> become /{tenantId}/shop */}
        <WouterRouter base={`/${tenantId}`}>
          <StoreRouter />
        </WouterRouter>
      </CartProvider>
    </StoreProvider>
  );
}

// ── Root app ───────────────────────────────────────────────────────────────────
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {/* Outer router strips the Vite base path (e.g. /tenant-store) */}
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <TenantRouter />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
