import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import OrdersPage from "@/pages/orders";
import OrderDetailPage from "@/pages/order-detail";
import ProfilePage from "@/pages/profile";
import ClubCardPage from "@/pages/clubcard";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

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
    <Switch>
      <Route path="/"           component={DashboardPage} />
      <Route path="/orders"     component={OrdersPage} />
      <Route path="/orders/:id" component={OrderDetailPage} />
      <Route path="/profile"    component={ProfilePage} />
      <Route path="/clubcard"   component={ClubCardPage} />
      <Route component={NotFound} />
    </Switch>
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
