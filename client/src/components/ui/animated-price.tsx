import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";

interface AnimatedPriceProps {
  value: number;
  previousValue?: number;
  prefix?: string;
  decimals?: number;
  className?: string;
  showFlash?: boolean;
  showArrow?: boolean;
  size?: "sm" | "md" | "lg";
}

export function AnimatedPrice({
  value,
  previousValue,
  prefix = "$",
  decimals = 2,
  className,
  showFlash = true,
  showArrow = false,
  size = "md",
}: AnimatedPriceProps) {
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prevValueRef = useRef(previousValue ?? value);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      prevValueRef.current = value;
      return;
    }

    if (value !== prevValueRef.current) {
      if (value > prevValueRef.current) {
        setFlash("up");
      } else if (value < prevValueRef.current) {
        setFlash("down");
      }
      prevValueRef.current = value;

      const timer = setTimeout(() => setFlash(null), 600);
      return () => clearTimeout(timer);
    }
  }, [value]);

  const sizeClasses = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-xl font-semibold",
  };

  const flashClasses = {
    up: "bg-emerald-500/20 text-emerald-500",
    down: "bg-red-500/20 text-red-500",
  };

  const direction = previousValue !== undefined
    ? value > previousValue ? "up" : value < previousValue ? "down" : null
    : null;

  return (
    <motion.span
      className={cn(
        "inline-flex items-center gap-1 px-1 rounded transition-colors duration-300",
        sizeClasses[size],
        showFlash && flash && flashClasses[flash],
        className
      )}
      animate={flash ? { scale: [1, 1.05, 1] } : {}}
      transition={{ duration: 0.2 }}
    >
      {showArrow && direction && (
        <motion.span
          initial={{ opacity: 0, y: direction === "up" ? 5 : -5 }}
          animate={{ opacity: 1, y: 0 }}
          className={direction === "up" ? "text-emerald-500" : "text-red-500"}
        >
          {direction === "up" ? "↑" : "↓"}
        </motion.span>
      )}
      <AnimatedDigits value={value} prefix={prefix} decimals={decimals} />
    </motion.span>
  );
}

interface AnimatedDigitsProps {
  value: number;
  prefix?: string;
  decimals?: number;
}

function AnimatedDigits({ value, prefix = "", decimals = 2 }: AnimatedDigitsProps) {
  const formatted = `${prefix}${value.toFixed(decimals)}`;
  const digits = formatted.split("");

  return (
    <span className="inline-flex overflow-hidden">
      {digits.map((digit, i) => (
        <AnimatedDigit key={i} digit={digit} />
      ))}
    </span>
  );
}

function AnimatedDigit({ digit }: { digit: string }) {
  const isNumber = /\d/.test(digit);

  if (!isNumber) {
    return <span>{digit}</span>;
  }

  return (
    <span className="relative inline-block w-[0.6em] h-[1.2em]">
      <AnimatePresence mode="popLayout">
        <motion.span
          key={digit}
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -10, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="absolute inset-0 flex items-baseline justify-center"
        >
          {digit}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

interface PriceChangeIndicatorProps {
  change: number;
  changePercent?: number;
  showPercent?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function PriceChangeIndicator({
  change,
  changePercent,
  showPercent = true,
  className,
  size = "md",
}: PriceChangeIndicatorProps) {
  const isPositive = change >= 0;
  
  const sizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  return (
    <motion.span
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        "inline-flex items-center gap-0.5 font-medium",
        sizeClasses[size],
        isPositive ? "text-emerald-500" : "text-red-500",
        className
      )}
    >
      <motion.span
        animate={{ y: [0, isPositive ? -2 : 2, 0] }}
        transition={{ duration: 0.3 }}
      >
        {isPositive ? "▲" : "▼"}
      </motion.span>
      <span>${Math.abs(change).toFixed(2)}</span>
      {showPercent && changePercent !== undefined && (
        <span className="opacity-75">
          ({isPositive ? "+" : ""}{changePercent.toFixed(1)}%)
        </span>
      )}
    </motion.span>
  );
}

interface LivePriceTickerProps {
  prices: Array<{ symbol: string; price: number; change: number }>;
  className?: string;
}

export function LivePriceTicker({ prices, className }: LivePriceTickerProps) {
  return (
    <div className={cn("overflow-hidden", className)}>
      <motion.div
        className="flex gap-6 whitespace-nowrap"
        animate={{ x: [0, -50 * prices.length] }}
        transition={{
          duration: prices.length * 3,
          repeat: Infinity,
          ease: "linear",
        }}
      >
        {[...prices, ...prices].map((item, i) => (
          <span
            key={i}
            className={cn(
              "inline-flex items-center gap-2 text-sm",
              item.change >= 0 ? "text-emerald-500" : "text-red-500"
            )}
          >
            <span className="font-medium text-foreground">{item.symbol}</span>
            <span>${item.price.toFixed(2)}</span>
            <span>{item.change >= 0 ? "↑" : "↓"}{Math.abs(item.change).toFixed(1)}%</span>
          </span>
        ))}
      </motion.div>
    </div>
  );
}
