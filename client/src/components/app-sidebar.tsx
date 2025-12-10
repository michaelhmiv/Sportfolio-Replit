import { Home, TrendingUp, Trophy, User, Settings, BarChart3, Crown } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/lib/notification-context";

const menuItems = [
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
    title: "Analytics",
    url: "/analytics",
    icon: BarChart3,
  },
  {
    title: "Contests",
    url: "/contests",
    icon: Trophy,
  },
  {
    title: "Portfolio",
    url: "/portfolio",
    icon: User,
  },
  {
    title: "Premium",
    url: "/premium",
    icon: Crown,
  },
];

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const { unreadCount } = useNotifications();
  const isPremium = user?.isPremium || false;

  const handleNavigation = (item: typeof menuItems[0], e: React.MouseEvent) => {
    // Portfolio and Premium tabs require authentication
    if ((item.url === "/portfolio" || item.url === "/premium") && !isAuthenticated) {
      e.preventDefault();
      toast({
        title: "Authentication Required",
        description: item.url === "/premium" 
          ? "Please create an account or log in to access Premium features."
          : "Please create an account or log in to view your portfolio.",
        variant: "destructive",
      });
    }
  };

  return (
    <Sidebar className={isPremium ? "shadow-[4px_0_20px_rgba(234,179,8,0.3)] border-r-yellow-500/50" : ""}>
      <SidebarContent className="p-4">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold tracking-wider uppercase mb-2">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link 
                      href={item.url} 
                      data-testid={`link-${item.title.toLowerCase()}`}
                      onClick={(e) => handleNavigation(item, e)}
                      className={item.title === "Premium" ? "text-yellow-500 hover:text-yellow-400" : ""}
                    >
                      <item.icon className={item.title === "Premium" ? "w-5 h-5 text-yellow-500" : "w-5 h-5"} />
                      <span>{item.title}</span>
                      {item.title === "Portfolio" && unreadCount > 0 && (
                        <Badge 
                          variant="default" 
                          className="ml-auto min-w-5 h-5 flex items-center justify-center px-1.5 text-xs"
                          data-testid="badge-notification-count"
                        >
                          {unreadCount}
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
