import { Switch, Route, Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { queryClient, apiRequest } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { HelpDialog } from "@/components/help-dialog";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { invalidatePortfolioQueries } from "@/lib/cache-invalidation";
import { WebSocketProvider, useWebSocket } from "@/lib/websocket";
import { ConnectionStatus } from "@/components/connection-status";
import { NotificationProvider } from "@/lib/notification-context";
import { useAuth, AuthProvider } from "@/hooks/useAuth";
import { OnboardingModal } from "@/components/onboarding-modal";
import { AnimatePresence, motion } from "framer-motion";
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
import AuthError from "@/pages/auth-error";
import NotFound from "@/pages/not-found";
import Blog from "@/pages/blog";
import BlogPost from "@/pages/blog-post";
import Privacy from "@/pages/privacy";
import Terms from "@/pages/terms";
import About from "@/pages/about";
import Contact from "@/pages/contact";
import HowItWorks from "@/pages/how-it-works";
import Analytics from "@/pages/analytics";
import Premium from "@/pages/premium";
import PremiumTrade from "@/pages/premium-trade";
import Login from "@/pages/Login";
import AuthCallback from "@/pages/AuthCallback";
import logoUrl from "@assets/Sportfolio png_1763227952318.png";
import { LogOut, User } from "lucide-react";
import { SiDiscord } from "react-icons/si";
import { SchemaOrg, schemas } from "@/components/schema-org";
import { VestingWidget } from "@/components/vesting-widget";
import { RedemptionModal } from "@/components/redemption-modal";
import { VestingProvider, useVesting } from "@/lib/vesting-context";

function OnboardingCheck() {
  const { user, isAuthenticated } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (isAuthenticated && user && user.hasSeenOnboarding === false) {
      setShowOnboarding(true);
    }
  }, [isAuthenticated, user]);

  const handleComplete = () => {
    setShowOnboarding(false);
  };

  return <OnboardingModal open={showOnboarding} onComplete={handleComplete} />;
}

const pageTransitionVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const pageTransitionSettings = {
  duration: 0.2,
  ease: "easeOut" as const,
};

function ProfileRedirect({ userId }: { userId: string }) {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate(`/user/${userId}`, { replace: true });
  }, [userId, navigate]);
  return null;
}

function Router() {
  const { user, isAuthenticated, isLoading, initError, retryInit } = useAuth();
  const [location, navigate] = useLocation();
  const [loadingTime, setLoadingTime] = useState(0);

  // Handle OAuth redirect hash tokens - redirect to /auth/callback if access_token is in hash
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes('access_token=')) {
      // Preserve the hash and redirect to auth callback
      navigate(`/auth/callback${hash}`, { replace: true });
    }
  }, [navigate]);

  // Track how long we've been loading
  useEffect(() => {
    if (isLoading) {
      const startTime = Date.now();
      const interval = setInterval(() => {
        setLoadingTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setLoadingTime(0);
    }
  }, [isLoading]);

  // Ensure viewport is properly set after OAuth redirect on mobile
  useEffect(() => {
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1, user-scalable=yes');
    }
  }, [isAuthenticated]);

  // Also restore viewport on mount to catch initial load
  useEffect(() => {
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1, user-scalable=yes');
    }
  }, []);

  // Show error state with retry option
  if (initError) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center max-w-md px-4">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>
          <h2 className="text-xl font-bold mb-2">Connection Issue</h2>
          <p className="text-muted-foreground mb-4">
            Unable to connect to the server. This may happen after a site update.
          </p>
          <p className="text-sm text-muted-foreground mb-4 font-mono bg-muted p-2 rounded">
            {initError}
          </p>
          <Button onClick={retryInit} data-testid="button-retry-connection">
            Retry Connection
          </Button>
          <p className="text-xs text-muted-foreground mt-4">
            If this persists, try refreshing the page or clearing your browser cache.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
          {loadingTime > 3 && (
            <p className="text-xs text-muted-foreground mt-2">
              Taking longer than usual... ({loadingTime}s)
            </p>
          )}
          {loadingTime > 10 && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => window.location.reload()}
              data-testid="button-refresh-page"
            >
              Refresh Page
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Public routes (accessible without authentication)
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={pageTransitionVariants}
        transition={pageTransitionSettings}
        className="w-full"
      >
        <Switch>
          {/* Auth routes */}
          <Route path="/login" component={Login} />
          <Route path="/auth/callback" component={AuthCallback} />

          {/* Dashboard is now public - shows live data with login CTAs for non-authenticated users */}
          <Route path="/" component={Dashboard} />

          {/* Public routes - contests and leaderboards */}
          <Route path="/contests" component={Contests} />
          <Route path="/contest/:id/leaderboard" component={ContestLeaderboard} />
          <Route path="/leaderboards" component={Leaderboards} />
          <Route path="/user/:id" component={UserProfile} />
          <Route path="/marketplace" component={Marketplace} />
          <Route path="/blog" component={Blog} />
          <Route path="/blog/:slug" component={BlogPost} />
          <Route path="/privacy" component={Privacy} />
          <Route path="/terms" component={Terms} />
          <Route path="/about" component={About} />
          <Route path="/contact" component={Contact} />
          <Route path="/how-it-works" component={HowItWorks} />
          <Route path="/analytics" component={Analytics} />

          {/* Protected routes - require authentication, redirect to dashboard if not logged in */}
          <Route path="/player/:id">
            {isAuthenticated ? <PlayerPage /> : <Dashboard />}
          </Route>
          <Route path="/contest/:id/entry">
            {isAuthenticated ? <ContestEntry /> : <Dashboard />}
          </Route>
          <Route path="/contest/:id/entry/:entryId">
            {isAuthenticated ? <ContestEntry /> : <Dashboard />}
          </Route>
          <Route path="/portfolio">
            {isAuthenticated ? <Portfolio /> : <Dashboard />}
          </Route>
          <Route path="/admin">
            {isAuthenticated ? <Admin /> : <Dashboard />}
          </Route>
          <Route path="/premium">
            {isAuthenticated ? <Premium /> : <Dashboard />}
          </Route>
          <Route path="/premium/trade">
            {isAuthenticated ? <PremiumTrade /> : <Dashboard />}
          </Route>
          <Route path="/profile">
            {isAuthenticated && user ? <ProfileRedirect userId={user.id} /> : <Dashboard />}
          </Route>

          {/* Auth error page - public, always accessible */}
          <Route path="/auth/error" component={AuthError} />

          <Route component={NotFound} />
        </Switch>
      </motion.div>
    </AnimatePresence>
  );
}

function Header({ onVestShares }: { onVestShares: () => void }) {
  const { user, isAuthenticated, logout } = useAuth();
  const [, navigate] = useLocation();
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

  const userName = user?.username || user?.email || "User";
  const isPremium = user?.isPremium || false;

  return (
    <header className={cn(
      "flex items-center justify-between h-16 px-4 border-b bg-card sticky top-0 z-10",
      isPremium && "shadow-[0_4px_20px_rgba(234,179,8,0.3)] border-b-yellow-500/50"
    )}>
      <div className="flex items-center gap-4">
        <div className="hidden sm:block">
          <SidebarTrigger data-testid="button-sidebar-toggle" />
        </div>
        <div className="flex items-center gap-2">
          <img src={logoUrl} alt="Sportfolio" className="w-10 h-10" />
          {isAuthenticated ? (
            <>
              <VestingWidget onVestShares={onVestShares} className="hidden sm:flex" />
              <VestingWidget onVestShares={onVestShares} compact className="flex sm:hidden" />
            </>
          ) : (
            <span className="text-xl font-extrabold tracking-tight text-primary">
              Sportfolio
            </span>
          )}
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
              size="icon"
              variant="ghost"
              asChild
              data-testid="button-profile"
              title="Profile"
              className="flex"
            >
              <Link href={user?.id ? `/user/${user.id}` : "/profile"}>
                <User className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={async () => {
                await logout();
                navigate("/");
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
            <Link href="/login">
              Sign In
            </Link>
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
      </div>
    </header>
  );
}

function AppContent() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  const { openRedemptionModal, redemptionModalOpen, setRedemptionModalOpen, preselectedPlayerIds } = useVesting();

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full overflow-x-hidden">
        <div className="hidden sm:flex">
          <AppSidebar />
        </div>
        <div className="flex flex-col flex-1 overflow-x-hidden">
          <Header onVestShares={() => openRedemptionModal()} />
          <main className="flex-1 overflow-y-auto overflow-x-hidden pb-0 sm:pb-0 flex flex-col">
            <div className="pb-20 sm:pb-0 flex-1">
              <Router />
            </div>
            <Footer />
          </main>
        </div>
      </div>
      <BottomNav />
      <OnboardingCheck />
      <RedemptionModal
        open={redemptionModalOpen}
        onOpenChange={setRedemptionModalOpen}
        preselectedPlayerIds={preselectedPlayerIds}
      />
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SchemaOrg schema={[schemas.organization, schemas.website, schemas.webApplication]} />
        <WebSocketProvider>
          <ConnectionStatus />
          <NotificationProvider>
            <TooltipProvider>
              <VestingProvider>
                <AppContent />
                <Toaster />
              </VestingProvider>
            </TooltipProvider>
          </NotificationProvider>
        </WebSocketProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
