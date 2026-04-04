import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import RequirementDoc from "@/pages/RequirementDoc";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RequirementDoc />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
