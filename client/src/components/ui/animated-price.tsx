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
      const newTrend = value > prevValueRef.current ? "up" : "down";
      setFlash(newTrend);
      prevValueRef.current = value;

      const timer = setTimeout(() => setFlash(null), 1500);
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

import { Link } from "wouter";

interface LivePriceTickerProps {
  prices: Array<{ symbol: string; price: number; change: number; link?: string }>;
  className?: string;
}

export function LivePriceTicker({ prices, className }: LivePriceTickerProps) {
  // If we have a very short list, we duplicate it sufficiently to fill a screen and create a loop illusion
  // But usage of 'queue' implies we prefer a stream.
  // The 'marquee' effect relies on translation.
  // With a constantly growing list (queue), we don't need to duplicate to array length * 2 if array is long enough.
  // However, simpler to just treat it as a stream.

  return (
    <div className={cn("overflow-hidden", className)}>
      <motion.div
        className="flex gap-8 whitespace-nowrap pl-full"
        animate={{ x: "-100%" }}
        transition={{
          duration: Math.max(20, prices.length * 4), // Dynamic duration based on content length
          repeat: Infinity,
          ease: "linear",
        }}
        // Start from right side (not exactly possible with just x: -100 without initial offset)
        // With x: -100%, we move the entire block left. 
        // We need the content to start off-screen right?
        // Let's us CSS Marquee for better robustness with dynamic width
        style={{
          width: "max-content",
          marginLeft: "100%" // Start pushed to the right
        }}
      >
        {prices.map((item, i) => (
          <TickerItem key={`${i}-${item.symbol}`} item={item} />
        ))}
      </motion.div>
    </div>
  );
}

function TickerItem({ item }: { item: { symbol: string; price: number; change: number; link?: string } }) {
  const content = (
    <>
      <span className="font-medium text-foreground hover:underline">{item.symbol}</span>
      <span>${item.price.toFixed(2)}</span>
      {item.change !== 0 && (
        <span>{item.change >= 0 ? "↑" : "↓"}{Math.abs(item.change).toFixed(1)}%</span>
      )}
    </>
  );

  const containerClass = cn(
    "inline-flex items-center gap-2 text-sm",
    item.change >= 0 ? "text-emerald-500" : "text-red-500"
  );

  if (item.link) {
    return (
      <Link href={item.link} className={containerClass}>
        {content}
      </Link>
    );
  }

  return <span className={containerClass}>{content}</span>;
}
