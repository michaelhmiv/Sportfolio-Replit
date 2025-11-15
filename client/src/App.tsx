import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import Dashboard from "@/pages/dashboard";
import Marketplace from "@/pages/marketplace";
import PlayerPage from "@/pages/player";
import Contests from "@/pages/contests";
import ContestEntry from "@/pages/contest-entry";
import ContestLeaderboard from "@/pages/contest-leaderboard";
import Portfolio from "@/pages/portfolio";
import NotFound from "@/pages/not-found";
import logoUrl from "@assets/Sportfolio png_1763227952318.png";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/marketplace" component={Marketplace} />
      <Route path="/player/:id" component={PlayerPage} />
      <Route path="/contests" component={Contests} />
      <Route path="/contest/:id/entry" component={ContestEntry} />
      <Route path="/contest/:id/entry/:entryId" component={ContestEntry} />
      <Route path="/contest/:id/leaderboard" component={ContestLeaderboard} />
      <Route path="/portfolio" component={Portfolio} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SidebarProvider style={style as React.CSSProperties}>
          <div className="flex h-screen w-full overflow-x-hidden">
            <div className="hidden sm:flex">
              <AppSidebar />
            </div>
            <div className="flex flex-col flex-1 overflow-x-hidden">
              <header className="flex items-center justify-between h-16 px-4 border-b bg-card sticky top-0 z-10">
                <div className="flex items-center gap-4">
                  <div className="hidden sm:block">
                    <SidebarTrigger data-testid="button-sidebar-toggle" />
                  </div>
                  <div className="flex items-center gap-2">
                    <img src={logoUrl} alt="Sportfolio" className="w-8 h-8" />
                    <span className="text-2xl font-bold text-primary">
                      Sportfolio
                    </span>
                  </div>
                </div>
                <ThemeToggle />
              </header>
              <main className="flex-1 overflow-y-auto overflow-x-hidden pb-0 sm:pb-0">
                <div className="pb-20 sm:pb-0">
                  <Router />
                </div>
              </main>
            </div>
          </div>
          <BottomNav />
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
