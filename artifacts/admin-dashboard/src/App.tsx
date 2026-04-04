import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/contexts/auth-context";
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

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/share/:id" component={ShareDocument} />
      <Route>
        <Layout>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/leads" component={Leads} />
            <Route path="/documents" component={Documents} />
            <Route path="/documents/new" component={NewDocument} />
            <Route path="/documents/edit/:id" component={NewDocument} />
            <Route path="/documents/:id" component={DocumentDetail} />
            <Route path="/users" component={UsersPage} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
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
