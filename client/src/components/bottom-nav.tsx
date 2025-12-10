import { Home, TrendingUp, Trophy, Briefcase, BarChart3 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useNotifications } from "@/lib/notification-context";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

const navItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: Home,
  },
  {
    title: "Marketplace",
    url: "/marketplace",
    icon: TrendingUp,
  },
  {
    title: "Contests",
    url: "/contests",
    icon: Trophy,
  },
  {
    title: "Portfolio",
    url: "/portfolio",
    icon: Briefcase,
  },
  {
    title: "Analytics",
    url: "/analytics",
    icon: BarChart3,
  },
];

export function BottomNav() {
  const [location] = useLocation();
  const { unreadCount } = useNotifications();
  const { user } = useAuth();
  const isPremium = user?.isPremium || false;
  const [previousLocation, setPreviousLocation] = useState(location);
  const [justActivated, setJustActivated] = useState<string | null>(null);

  useEffect(() => {
    if (location !== previousLocation) {
      setJustActivated(location);
      setPreviousLocation(location);
      const timer = setTimeout(() => setJustActivated(null), 400);
      return () => clearTimeout(timer);
    }
  }, [location, previousLocation]);

  return (
    <nav className={cn(
      "fixed bottom-0 left-0 right-0 z-50 bg-card border-t sm:hidden",
      isPremium && "shadow-[0_-4px_20px_rgba(234,179,8,0.3)] border-t-yellow-500/50"
    )}>
      <div className="grid grid-cols-5 h-16 max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive = location === item.url;
          const wasJustActivated = justActivated === item.url;
          return (
            <Link
              key={item.title}
              href={item.url}
              className="flex items-center justify-center"
            >
              <motion.div
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2 rounded-none border-r border-b border-border transition-colors w-full relative",
                  isActive
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover-elevate"
                )}
                data-testid={`button-nav-${item.title.toLowerCase()}`}
                animate={wasJustActivated ? {
                  scale: [1, 1.15, 0.95, 1.05, 1],
                  y: [0, -6, 0, -2, 0],
                } : {}}
                transition={{
                  duration: 0.4,
                  ease: "easeOut",
                }}
              >
                <motion.div
                  animate={wasJustActivated ? {
                    scale: [1, 1.3, 1],
                    rotate: [0, -10, 10, 0],
                  } : {}}
                  transition={{ duration: 0.3 }}
                >
                  <item.icon className="w-5 h-5" />
                </motion.div>
                <span className="text-xs font-medium">{item.title}</span>
                
                {/* Active indicator dot */}
                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 500, damping: 25 }}
                      className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary"
                    />
                  )}
                </AnimatePresence>
                
                {item.title === "Portfolio" && unreadCount > 0 && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 25 }}
                    className="absolute top-1 right-2 z-[51]"
                  >
                    <Badge 
                      variant="default" 
                      className="min-w-5 h-5 flex items-center justify-center px-1.5 text-xs"
                      data-testid="badge-notification-count-mobile"
                    >
                      {unreadCount}
                    </Badge>
                  </motion.div>
                )}
              </motion.div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
