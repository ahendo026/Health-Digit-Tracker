import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryCache, MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { clearToken, redirectToLogin } from "@/lib/auth";
import NotFound from "@/pages/not-found";

// Pages
import UploadPage from "@/pages/upload";
import HistoryPage from "@/pages/history";
import DetailPage from "@/pages/detail";
import ReviewPage from "@/pages/review";
import SettingsPage from "@/pages/settings";
import LoginPage from "@/pages/login";

// Any 401 means this device's token is missing, invalid, or revoked — clear it
// and land on the login page (full reload, so the query cache is wiped).
function handleAuthError(error: unknown): void {
  if (error instanceof ApiError && error.status === 401) {
    clearToken();
    redirectToLogin();
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleAuthError }),
  mutationCache: new MutationCache({ onError: handleAuthError }),
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={UploadPage} />
      <Route path="/history" component={HistoryPage} />
      <Route path="/uploads/:id" component={DetailPage} />
      <Route path="/review" component={ReviewPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/login" component={LoginPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
