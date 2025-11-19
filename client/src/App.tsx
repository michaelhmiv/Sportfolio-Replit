import { Switch, Route, Link } from "wouter";
import { useEffect } from "react";
import { queryClient, apiRequest } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { HelpDialog } from "@/components/help-dialog";
import { Button } from "@/components/ui/button";
import { invalidatePortfolioQueries } from "@/lib/cache-invalidation";
import { WebSocketProvider, useWebSocket } from "@/lib/websocket";
import { useAuth } from "@/hooks/useAuth";
import Dashboard from "@/pages/dashboard";
import Marketplace from "@/pages/marketplace";
import PlayerPage from "@/pages/player";
import Contests from "@/pages/contests";
import ContestEntry from "@/pages/contest-entry";
import ContestLeaderboard from "@/pages/contest-leaderboard";
import Portfolio from "@/pages/portfolio";
import UserProfile from "@/pages/user-profile";
import Leaderboards from "@/pages/leaderboards";
import Admin from "@/pages/admin";
import Landing from "@/pages/landing";
import NotFound from "@/pages/not-found";
import logoUrl from "@assets/Sportfolio png_1763227952318.png";
import { LogOut, User } from "lucide-react";
import { SiDiscord } from "react-icons/si";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Public routes (accessible without authentication)
  return (
    <Switch>
      {/* Landing page for unauthenticated users at root */}
      <Route path="/">
        {isAuthenticated ? <Dashboard /> : <Landing />}
      </Route>
      
      {/* Public routes - contests and leaderboards */}
      <Route path="/contests" component={Contests} />
      <Route path="/contest/:id/leaderboard" component={ContestLeaderboard} />
      <Route path="/leaderboards" component={Leaderboards} />
      <Route path="/user/:id" component={UserProfile} />
      
      {/* Protected routes - require authentication */}
      <Route path="/marketplace">
        {isAuthenticated ? <Marketplace /> : <Landing />}
      </Route>
      <Route path="/player/:id">
        {isAuthenticated ? <PlayerPage /> : <Landing />}
      </Route>
      <Route path="/contest/:id/entry">
        {isAuthenticated ? <ContestEntry /> : <Landing />}
      </Route>
      <Route path="/contest/:id/entry/:entryId">
        {isAuthenticated ? <ContestEntry /> : <Landing />}
      </Route>
      <Route path="/portfolio">
        {isAuthenticated ? <Portfolio /> : <Landing />}
      </Route>
      <Route path="/admin">
        {isAuthenticated ? <Admin /> : <Landing />}
      </Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

function Header() {
  const { user, isAuthenticated } = useAuth();
  const { subscribe } = useWebSocket();
  const { data: dashboardData } = useQuery<{ user: { balance: string; portfolioValue: string } }>({ 
    queryKey: ['/api/dashboard'],
  });

  // WebSocket listener for real-time balance updates in header
  useEffect(() => {
    // Portfolio events will auto-invalidate dashboard queries via WebSocket provider
    // The header balance will update automatically
    const unsubPortfolio = subscribe('portfolio', () => {
      // Balance updates will be handled by the global WebSocket provider
    });

    return () => {
      unsubPortfolio();
    };
  }, [subscribe]);

  const handleAddCash = async () => {
    // Optimistically update the balance immediately
    const currentBalance = parseFloat(dashboardData?.user?.balance || "0");
    const newBalance = (currentBalance + 1).toFixed(2);
    
    // Update cache optimistically
    queryClient.setQueryData(['/api/dashboard'], (old: any) => ({
      ...old,
      user: {
        ...old?.user,
        balance: newBalance
      }
    }));

    try {
      const response = await fetch('/api/user/add-cash', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to add cash');
      
      // Refetch to ensure we have the correct server value across all pages
      invalidatePortfolioQueries();
    } catch (error) {
      console.error('Failed to add cash:', error);
      // Rollback on error
      queryClient.setQueryData(['/api/dashboard'], (old: any) => ({
        ...old,
        user: {
          ...old?.user,
          balance: dashboardData?.user?.balance
        }
      }));
    }
  };

  const userName = user?.username || user?.email || user?.firstName || "User";

  return (
    <header className="flex items-center justify-between h-16 px-4 border-b bg-card sticky top-0 z-10">
      <div className="flex items-center gap-4">
        <div className="hidden sm:block">
          <SidebarTrigger data-testid="button-sidebar-toggle" />
        </div>
        <div className="flex items-center gap-2">
          <img src={logoUrl} alt="Sportfolio" className="w-8 h-8" />
          <span className="text-lg font-bold text-primary">
            Sportfolio
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-sm">
          <span className="font-medium">Balance:</span>
          <span className="font-mono font-bold text-primary" data-testid="text-balance">
            ${dashboardData?.user?.balance || "0.00"}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isAuthenticated ? (
          <>
            <Link href={user?.id ? `/user/${user.id}` : "/profile"} className="hidden sm:block" data-testid="link-username">
              <div className="flex items-center gap-2 text-sm text-muted-foreground hover-elevate active-elevate-2 px-3 py-1.5 rounded-md transition-colors">
                <span data-testid="text-username">{userName}</span>
              </div>
            </Link>
            <Button 
              size="sm" 
              onClick={handleAddCash}
              data-testid="button-add-cash"
            >
              +$1
            </Button>
            <Button 
              size="icon"
              variant="ghost"
              asChild
              data-testid="button-profile"
              title="Profile"
              className="hidden sm:flex"
            >
              <Link href={user?.id ? `/user/${user.id}` : "/profile"}>
                <User className="h-4 w-4" />
              </Link>
            </Button>
            <Button 
              size="icon"
              variant="ghost"
              onClick={() => {
                // Invalidate auth cache before logout
                queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
                window.location.href = "/api/logout";
              }}
              data-testid="button-logout"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <Button 
            asChild
            data-testid="button-header-login"
          >
            <a href="/api/login">
              Sign In
            </a>
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => window.open('https://discord.gg/r8MsduNvXG', '_blank')}
          data-testid="button-discord"
          title="Join our Discord"
          className="hover-elevate active-elevate-2"
        >
          <SiDiscord className="w-5 h-5" />
        </Button>
        <HelpDialog />
        <ThemeToggle />
      </div>
    </header>
  );
}

function App() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <WebSocketProvider>
        <TooltipProvider>
          <SidebarProvider style={style as React.CSSProperties}>
          <div className="flex h-screen w-full overflow-x-hidden">
            <div className="hidden sm:flex">
              <AppSidebar />
            </div>
            <div className="flex flex-col flex-1 overflow-x-hidden">
              <Header />
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
      </WebSocketProvider>
    </QueryClientProvider>
  );
}

export default App;
