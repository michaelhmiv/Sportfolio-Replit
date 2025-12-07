import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { 
  Inbox, 
  Search, 
  FileQuestion, 
  ShoppingCart, 
  TrendingUp,
  Users,
  Trophy,
  Wallet
} from "lucide-react";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: "inbox" | "search" | "file" | "cart" | "chart" | "users" | "trophy" | "wallet" | React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  size?: "sm" | "md" | "lg";
}

const iconMap = {
  inbox: Inbox,
  search: Search,
  file: FileQuestion,
  cart: ShoppingCart,
  chart: TrendingUp,
  users: Users,
  trophy: Trophy,
  wallet: Wallet,
};

export function EmptyState({
  title,
  description,
  icon = "inbox",
  action,
  className,
  size = "md",
}: EmptyStateProps) {
  const sizeClasses = {
    sm: {
      container: "py-6",
      icon: "w-10 h-10",
      title: "text-sm",
      description: "text-xs",
    },
    md: {
      container: "py-12",
      icon: "w-16 h-16",
      title: "text-lg",
      description: "text-sm",
    },
    lg: {
      container: "py-16",
      icon: "w-24 h-24",
      title: "text-xl",
      description: "text-base",
    },
  };

  const IconComponent = typeof icon === "string" && icon in iconMap 
    ? iconMap[icon as keyof typeof iconMap] 
    : null;
  const sizes = sizeClasses[size];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={cn(
        "flex flex-col items-center justify-center text-center",
        sizes.container,
        className
      )}
    >
      <motion.div
        animate={{
          y: [0, -8, 0],
          scale: [1, 1.02, 1],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="relative mb-4"
      >
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.1, 0.2, 0.1],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute inset-0 bg-primary/10 rounded-full blur-xl"
        />
        {IconComponent ? (
          <IconComponent 
            className={cn(
              "text-muted-foreground/50 relative z-10",
              sizes.icon
            )} 
          />
        ) : (
          <div className={cn("relative z-10", sizes.icon)}>
            {icon}
          </div>
        )}
      </motion.div>

      <motion.h3
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className={cn("font-semibold text-foreground mb-1", sizes.title)}
      >
        {title}
      </motion.h3>

      {description && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className={cn(
            "text-muted-foreground max-w-sm mb-4",
            sizes.description
          )}
        >
          {description}
        </motion.p>
      )}

      {action && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <motion.div
            animate={{
              scale: [1, 1.02, 1],
              boxShadow: [
                "0 0 0 0 rgba(var(--primary), 0)",
                "0 0 0 8px rgba(var(--primary), 0.1)",
                "0 0 0 0 rgba(var(--primary), 0)",
              ],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="rounded-md"
          >
            <Button onClick={action.onClick} size={size === "sm" ? "sm" : "default"}>
              {action.label}
            </Button>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}

interface NoResultsProps {
  query?: string;
  className?: string;
}

export function NoResults({ query, className }: NoResultsProps) {
  return (
    <EmptyState
      icon="search"
      title="No results found"
      description={
        query
          ? `We couldn't find anything matching "${query}". Try different keywords.`
          : "Try adjusting your search or filters."
      }
      className={className}
    />
  );
}

interface EmptyPortfolioProps {
  onBrowse?: () => void;
  className?: string;
}

export function EmptyPortfolio({ onBrowse, className }: EmptyPortfolioProps) {
  return (
    <EmptyState
      icon="wallet"
      title="Your portfolio is empty"
      description="Start trading to build your portfolio. Browse the marketplace to find players to invest in."
      action={onBrowse ? { label: "Browse Marketplace", onClick: onBrowse } : undefined}
      className={className}
    />
  );
}

interface EmptyContestsProps {
  onBrowse?: () => void;
  className?: string;
}

export function EmptyContests({ onBrowse, className }: EmptyContestsProps) {
  return (
    <EmptyState
      icon="trophy"
      title="No contests available"
      description="Check back soon for new contests, or explore other ways to trade."
      action={onBrowse ? { label: "View Past Contests", onClick: onBrowse } : undefined}
      className={className}
    />
  );
}

interface LoadingEmptyStateProps {
  className?: string;
}

export function LoadingEmptyState({ className }: LoadingEmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12", className)}>
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full"
      />
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mt-4 text-sm text-muted-foreground"
      >
        Loading...
      </motion.p>
    </div>
  );
}
