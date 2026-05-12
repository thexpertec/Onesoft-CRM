import { useEffect, lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/auth-context";

// Eagerly loaded — shown immediately on first paint for unauthenticated users
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";

// Lazy-loaded — only fetched after the user is authenticated
const DashboardPage   = lazy(() => import("@/pages/dashboard"));
const OrdersPage      = lazy(() => import("@/pages/orders"));
const OrderDetailPage = lazy(() => import("@/pages/order-detail"));
const ProfilePage     = lazy(() => import("@/pages/profile"));
const ClubCardPage    = lazy(() => import("@/pages/clubcard"));

const queryClient = new QueryClient();

function PageSkeleton() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="w-6 h-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
    </div>
  );
}

function ProtectedRouter() {
  const { session } = useAuth();

  /* When session first becomes truthy, check for a returnTo param and
     redirect there (set by tenant-store checkout so the user comes back
     to the cart after signing in / signing up). */
  useEffect(() => {
    if (!session) return;
    const returnTo = new URLSearchParams(window.location.search).get("returnTo");
    if (returnTo) {
      window.location.href = returnTo;
    }
  }, [session]);

  if (!session) {
    return <LoginPage />;
  }

  return (
    <Suspense fallback={<PageSkeleton />}>
      <Switch>
        <Route path="/"           component={DashboardPage} />
        <Route path="/orders"     component={OrdersPage} />
        <Route path="/orders/:id" component={OrderDetailPage} />
        <Route path="/profile"    component={ProfilePage} />
        <Route path="/clubcard"   component={ClubCardPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <ProtectedRouter />
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
