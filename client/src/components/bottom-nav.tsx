import { Home, TrendingUp, Trophy, Briefcase, Newspaper } from "lucide-react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useNotifications } from "@/lib/notification-context";
import { useNewsNotifications } from "@/lib/news-notification-context";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSport, SPORTS, Sport } from "@/lib/sport-context";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";

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
    title: "News",
    url: "/news",
    icon: Newspaper,
  },
];

export function BottomNav() {
  const [location] = useLocation();
  const { unreadCount } = useNotifications();
  const { unreadNewsCount } = useNewsNotifications();
  const { user } = useAuth();
  const isPremium = user?.isPremium || false;
  const [previousLocation, setPreviousLocation] = useState(location);
  const [justActivated, setJustActivated] = useState<string | null>(null);

  // Sport Context & Filter
  const { sport, setSport } = useSport();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Haptic feedback helper
  const triggerHaptic = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(50);
    }
  };

  const handleClick = (e: React.MouseEvent, url: string) => {
    // If clicking Dashboard while already on Dashboard, open filter
    if (url === "/" && location === "/") {
      e.preventDefault();
      setIsDrawerOpen(true);
      triggerHaptic();
    }
  };

  useEffect(() => {
    if (location !== previousLocation) {
      setJustActivated(location);
      setPreviousLocation(location);
      const timer = setTimeout(() => setJustActivated(null), 400);
      return () => clearTimeout(timer);
    }
  }, [location, previousLocation]);

  const getSportIcon = (s: Sport) => {
    switch (s) {
      case "NBA": return "🏀";
      case "NFL": return "🏈";
      case "ALL": return "🌎";
    }
  };

  const getSportLabel = (s: Sport) => {
    switch (s) {
      case "NBA": return "NBA";
      case "NFL": return "NFL";
      case "ALL": return "All Sports";
    }
  };

  return (
    <>
      <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <DrawerContent>
          <div className="mx-auto w-full max-w-sm">
            <DrawerHeader>
              <DrawerTitle>Select Market</DrawerTitle>
              <DrawerDescription>Filter the entire app by sport.</DrawerDescription>
            </DrawerHeader>
            <div className="p-4 pb-8 grid grid-cols-1 gap-3">
              {SPORTS.map((s) => (
                <Button
                  key={s}
                  variant={sport === s ? "default" : "outline"}
                  className="h-14 text-lg justify-start gap-4 px-6 relative overflow-hidden"
                  onClick={() => {
                    setSport(s);
                    setIsDrawerOpen(false);
                    triggerHaptic();
                  }}
                >
                  <span className="text-2xl">{getSportIcon(s)}</span>
                  <span className="font-bold">{getSportLabel(s)}</span>
                  {sport === s && (
                    <div className="absolute right-4 w-3 h-3 rounded-full bg-primary-foreground animate-pulse" />
                  )}
                </Button>
              ))}
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      <nav className={cn(
        "fixed bottom-0 left-0 right-0 z-50 bg-card border-t sm:hidden select-none",
        isPremium && "shadow-[0_-4px_20px_rgba(234,179,8,0.3)] border-t-yellow-500/50"
      )}>
        <div className="grid grid-cols-5 h-16 max-w-md mx-auto">
          {navItems.map((item) => {
            const isActive = location === item.url;
            const wasJustActivated = justActivated === item.url;
            return (
              <div
                key={item.title}
                className="flex items-center justify-center"
              >
                <Link
                  href={item.url}
                  className="flex items-center justify-center w-full h-full"
                  onClick={(e) => handleClick(e, item.url)}
                >
                  <motion.div
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 py-1 rounded-none transition-colors w-full h-full relative",
                      isActive
                        ? "text-primary"
                        : "text-muted-foreground"
                    )}
                    data-testid={`button - nav - ${item.title.toLowerCase()} `}
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
                    <span className="text-[10px] font-medium">{item.title}</span>

                    {/* Active Overlay Background with Sport Watermark */}
                    <AnimatePresence>
                      {isActive && (
                        <motion.div
                          layoutId="activeTab"
                          className="absolute inset-x-1 inset-y-1 bg-primary/10 rounded-lg -z-10 flex items-center justify-center overflow-hidden"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ duration: 0.2 }}
                        >
                          <span className="text-3xl opacity-20 select-none grayscale cursor-default">
                            {getSportIcon(sport)}
                          </span>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Standard Dot Backup if we don't want the icon (Optional, using Icon for now) */}

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

                    {item.title === "News" && unreadNewsCount > 0 && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 500, damping: 25 }}
                        className="absolute top-1 right-2 z-[51]"
                      >
                        <Badge
                          variant="default"
                          className="min-w-5 h-5 flex items-center justify-center px-1.5 text-xs bg-blue-600"
                          data-testid="badge-news-count-mobile"
                        >
                          {unreadNewsCount}
                        </Badge>
                      </motion.div>
                    )}
                  </motion.div>
                </Link>
              </div>
            );
          })}
        </div>
      </nav>
    </>
  );
}
