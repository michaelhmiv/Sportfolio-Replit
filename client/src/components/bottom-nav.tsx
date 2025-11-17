import { Home, TrendingUp, Trophy, Briefcase, User } from "lucide-react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
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
];

export function BottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();

  // Add Profile item dynamically based on authenticated user
  const profileItem = {
    title: "Profile",
    url: user?.id ? `/user/${user.id}` : "/profile",
    icon: User,
  };

  const allItems = [...navItems, profileItem];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t sm:hidden">
      <div className="flex items-center justify-around h-16">
        {allItems.map((item) => {
          const isActive = location === item.url || (item.title === "Profile" && location.startsWith("/user/"));
          return (
            <Link
              key={item.title}
              href={item.url}
            >
              <div
                className={cn(
                  "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover-elevate"
                )}
                data-testid={`button-nav-${item.title.toLowerCase()}`}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-xs font-medium">{item.title}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
