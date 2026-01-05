import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { calculateVestingShares } from "@shared/vesting-utils";
import { useAuth } from "@/hooks/useAuth";
import { useVesting } from "@/lib/vesting-context";
import { cn } from "@/lib/utils";

interface VestingData {
  vesting: {
    sharesAccumulated: number;
    residualMs: number;
    lastAccruedAt: string | null;
    capLimit: number;
    sharesPerHour: number;
  };
}

interface VestingWidgetProps {
  onVestShares?: () => void;
  className?: string;
  compact?: boolean;
}

export function VestingWidget({ onVestShares, className, compact = false }: VestingWidgetProps) {
  const { openRedemptionModal } = useVesting();
  const { isAuthenticated, user } = useAuth();
  const [projectedShares, setProjectedShares] = useState(0);

  const { data } = useQuery<VestingData>({
    queryKey: ['/api/dashboard'],
    enabled: isAuthenticated,
  });

  const isPremium = user?.isPremium || false;
  const capLimit = isPremium ? 4800 : 2400;
  const sharesPerHour = isPremium ? 200 : 100;
  const hasNeverVested = (user?.totalSharesMined || 0) === 0;

  useEffect(() => {
    // Don't reset to 0 when data is loading/refetching - preserve previous value
    if (!data?.vesting) {
      return;
    }

    const vesting = data.vesting;

    const calculateProjection = () => {
      if (!vesting.lastAccruedAt) {
        setProjectedShares(vesting.sharesAccumulated || 0);
        return;
      }

      const result = calculateVestingShares({
        sharesAccumulated: vesting.sharesAccumulated || 0,
        residualMs: vesting.residualMs || 0,
        lastAccruedAt: vesting.lastAccruedAt,
        sharesPerHour: sharesPerHour,
        capLimit: capLimit,
      });

      setProjectedShares(Math.min(vesting.sharesAccumulated + result.sharesEarned, capLimit));
    };

    calculateProjection();
    const interval = setInterval(calculateProjection, 1000);
    return () => clearInterval(interval);
  }, [
    data?.vesting?.lastAccruedAt,
    data?.vesting?.residualMs,
    data?.vesting?.sharesAccumulated,
    sharesPerHour,
    capLimit,
  ]);

  if (!isAuthenticated) {
    return null;
  }

  const progress = (projectedShares / capLimit) * 100;
  const isAtCap = projectedShares >= capLimit;

  if (compact) {
    return (
      <button
        onClick={() => {
          if (onVestShares) onVestShares();
          else openRedemptionModal();
        }}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer hover-elevate",
          hasNeverVested && "first-time-indicator",
          className
        )}
        data-testid="button-vesting-widget-mobile"
      >
        <div className="relative w-20 h-5">
          <Progress
            value={progress}
            className={cn(
              "h-5 w-full",
              isAtCap && "bg-yellow-500/20"
            )}
          />
          <span
            className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-bold text-white"
            data-testid="text-vesting-shares-mobile"
          >
            {projectedShares.toLocaleString()} / {capLimit.toLocaleString()}
          </span>
        </div>
      </button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex flex-col items-start gap-0.5 px-3 py-1.5 rounded-md hover-elevate active-elevate-2 transition-colors cursor-pointer min-w-[140px]",
            hasNeverVested && "first-time-indicator",
            className
          )}
          data-testid="button-vesting-widget"
        >
          <span className="text-xs font-medium text-muted-foreground">Vesting</span>
          <div className="relative w-full h-5">
            <Progress
              value={progress}
              className={cn(
                "h-5 w-full",
                isAtCap && "bg-yellow-500/20"
              )}
              data-testid="progress-vesting-widget"
            />
            <span
              className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-bold text-white"
              data-testid="text-vesting-shares"
            >
              {projectedShares.toLocaleString()} / {capLimit.toLocaleString()}
            </span>
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-4" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Vested Shares</span>
            <span className={cn(
              "text-sm font-mono font-bold",
              isAtCap && "text-yellow-500"
            )}>
              {projectedShares.toLocaleString()} / {capLimit.toLocaleString()}
            </span>
          </div>
          <Progress
            value={progress}
            className={cn(
              "h-2",
              isAtCap && "bg-yellow-500/20"
            )}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Rate: {sharesPerHour} shares/hr</span>
            {isAtCap && <span className="text-yellow-500 font-medium">Cap reached!</span>}
          </div>
          <Button
            onClick={() => {
              if (onVestShares) onVestShares();
              else openRedemptionModal();
            }}
            className="w-full"
            disabled={projectedShares === 0}
            data-testid="button-vest-shares"
          >
            Vest Shares
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
