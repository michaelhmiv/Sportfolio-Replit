import { Home, TrendingUp, Trophy, Briefcase, BarChart3 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useNotifications } from "@/lib/notification-context";

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

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t sm:hidden">
      <div className="grid grid-cols-5 h-16 max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive = location === item.url;
          return (
            <Link
              key={item.title}
              href={item.url}
              className="flex items-center justify-center"
            >
              <div
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2 rounded-lg transition-colors w-full relative",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover-elevate"
                )}
                data-testid={`button-nav-${item.title.toLowerCase()}`}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-xs font-medium">{item.title}</span>
                {item.title === "Portfolio" && unreadCount > 0 && (
                  <Badge 
                    variant="default" 
                    className="absolute top-1 right-2 min-w-5 h-5 flex items-center justify-center px-1.5 text-xs"
                    data-testid="badge-notification-count-mobile"
                  >
                    {unreadCount}
                  </Badge>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
