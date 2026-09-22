import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LocalAuthProvider, useLocalAuth } from "./contexts/LocalAuthContext";
import { AppLayout } from "./components/AppLayout";
import Login from "./pages/Login";
import Home from "./pages/Home";
import MetaAds from "./pages/MetaAds";
import GoogleAds from "./pages/GoogleAds";
import Programatica from "./pages/Programatica";
import Leads from "./pages/Leads";
import Otimizacoes from "./pages/Otimizacoes";
import Metas from "./pages/Metas";
import Auditoria from "./pages/Auditoria";
import Usuarios from "./pages/Usuarios";
import { Loader2 } from "lucide-react";

function Router() {
  const { user, loading } = useLocalAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <Switch>
        <Route path="/login" component={Login} />
        <Route>{() => <Redirect to="/login" />}</Route>
      </Switch>
    );
  }

  return (
    <AppLayout>
      <Switch>
        <Route path="/login">{() => <Redirect to="/" />}</Route>
        <Route path="/" component={Home} />
        <Route path="/meta" component={MetaAds} />
        <Route path="/google" component={GoogleAds} />
        <Route path="/programatica" component={Programatica} />
        <Route path="/leads" component={Leads} />
        <Route path="/otimizacoes" component={Otimizacoes} />
        <Route path="/metas" component={Metas} />
        <Route path="/auditoria" component={Auditoria} />
        <Route path="/usuarios" component={Usuarios} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <LocalAuthProvider>
            <Router />
          </LocalAuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
