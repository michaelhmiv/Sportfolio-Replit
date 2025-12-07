import { motion, AnimatePresence, useInView, useSpring, useTransform } from "framer-motion";
import React, { useRef, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export function AnimatedNumber({
  value,
  duration = 0.8,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
}: AnimatedNumberProps) {
  const spring = useSpring(0, { 
    stiffness: 100 / duration,
    damping: 20,
    mass: 1,
  });
  const display = useTransform(spring, (current) =>
    `${prefix}${current.toFixed(decimals)}${suffix}`
  );
  const [displayValue, setDisplayValue] = useState(`${prefix}${value.toFixed(decimals)}${suffix}`);

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  useEffect(() => {
    return display.on("change", (latest) => {
      setDisplayValue(latest);
    });
  }, [display]);

  return <span className={className}>{displayValue}</span>;
}

interface FadeInProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
  direction?: "up" | "down" | "left" | "right" | "none";
  distance?: number;
}

export function FadeIn({
  children,
  delay = 0,
  duration = 0.5,
  className,
  direction = "up",
  distance = 20,
}: FadeInProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  const getInitialPosition = () => {
    switch (direction) {
      case "up": return { y: distance };
      case "down": return { y: -distance };
      case "left": return { x: distance };
      case "right": return { x: -distance };
      default: return {};
    }
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, ...getInitialPosition() }}
      animate={isInView ? { opacity: 1, x: 0, y: 0 } : { opacity: 0, ...getInitialPosition() }}
      transition={{ duration, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface SlideInProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
  from?: "left" | "right" | "top" | "bottom";
  distance?: number;
}

export function SlideIn({
  children,
  delay = 0,
  duration = 0.4,
  className,
  from = "left",
  distance = 30,
}: SlideInProps) {
  const getInitialPosition = () => {
    switch (from) {
      case "left": return { x: -distance };
      case "right": return { x: distance };
      case "top": return { y: -distance };
      case "bottom": return { y: distance };
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, ...getInitialPosition() }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, ...getInitialPosition() }}
      transition={{ duration, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface ScaleInProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
  origin?: "center" | "top" | "bottom" | "left" | "right";
}

export function ScaleIn({
  children,
  delay = 0,
  duration = 0.3,
  className,
  origin = "center",
}: ScaleInProps) {
  const originClass = {
    center: "origin-center",
    top: "origin-top",
    bottom: "origin-bottom",
    left: "origin-left",
    right: "origin-right",
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ 
        duration, 
        delay, 
        type: "spring",
        stiffness: 300,
        damping: 25
      }}
      className={cn(originClass[origin], className)}
    >
      {children}
    </motion.div>
  );
}

interface StaggerContainerProps {
  children: React.ReactNode;
  className?: string;
  staggerDelay?: number;
}

export function StaggerContainer({
  children,
  className,
  staggerDelay = 0.05,
}: StaggerContainerProps) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: staggerDelay,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface StaggerItemProps {
  children: React.ReactNode;
  className?: string;
}

export function StaggerItem({ children, className }: StaggerItemProps) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 },
      }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface PulseProps {
  children: React.ReactNode;
  className?: string;
  duration?: number;
}

export function Pulse({ children, className, duration = 2 }: PulseProps) {
  return (
    <motion.div
      animate={{
        scale: [1, 1.02, 1],
        opacity: [1, 0.8, 1],
      }}
      transition={{
        duration,
        repeat: Infinity,
        ease: "easeInOut",
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface FlashProps {
  children: React.ReactNode;
  flash: boolean;
  color?: "green" | "red" | "yellow";
  className?: string;
}

export function Flash({ children, flash, color = "green", className }: FlashProps) {
  const colorClasses = {
    green: "bg-emerald-500/20",
    red: "bg-red-500/20",
    yellow: "bg-yellow-500/20",
  };

  return (
    <motion.div
      className={cn("relative", className)}
      animate={flash ? { 
        backgroundColor: ["transparent", colorClasses[color], "transparent"],
      } : {}}
      transition={{ duration: 0.6 }}
    >
      {children}
    </motion.div>
  );
}

interface ShimmerProps {
  className?: string;
  width?: string;
  height?: string;
}

export function Shimmer({ className, width = "100%", height = "20px" }: ShimmerProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-muted",
        className
      )}
      style={{ width, height }}
    >
      <motion.div
        className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent"
        animate={{ x: ["0%", "200%"] }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: "linear",
        }}
      />
    </div>
  );
}

interface ShimmerCardProps {
  className?: string;
  lines?: number;
}

export function ShimmerCard({ className, lines = 3 }: ShimmerCardProps) {
  return (
    <div className={cn("space-y-3 p-4 rounded-lg border bg-card", className)}>
      <Shimmer height="24px" width="60%" />
      {Array.from({ length: lines }).map((_, i) => (
        <Shimmer key={i} height="16px" width={`${85 - i * 10}%`} />
      ))}
    </div>
  );
}

interface BounceProps {
  children: React.ReactNode;
  className?: string;
  trigger?: boolean;
}

export function Bounce({ children, className, trigger = false }: BounceProps) {
  return (
    <motion.div
      animate={trigger ? {
        y: [0, -8, 0],
        scale: [1, 1.05, 1],
      } : {}}
      transition={{
        duration: 0.4,
        ease: "easeOut",
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface PopInProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export function PopIn({ children, className, delay = 0 }: PopInProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 20,
        delay,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface CountUpProps {
  end: number;
  start?: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  separator?: string;
}

export function CountUp({
  end,
  start = 0,
  duration = 1,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
  separator = ",",
}: CountUpProps) {
  const [count, setCount] = useState(start);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;

    let startTime: number;
    let animationFrame: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);
      
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const current = start + (end - start) * easeOutQuart;
      
      setCount(current);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrame);
  }, [isInView, start, end, duration]);

  const formatNumber = (num: number) => {
    const fixed = num.toFixed(decimals);
    const [integer, decimal] = fixed.split(".");
    const formatted = integer.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
    return decimal ? `${formatted}.${decimal}` : formatted;
  };

  return (
    <span ref={ref} className={className}>
      {prefix}{formatNumber(count)}{suffix}
    </span>
  );
}

interface HighlightProps {
  children: React.ReactNode;
  className?: string;
  active?: boolean;
  color?: "primary" | "success" | "warning" | "destructive";
}

export function Highlight({
  children,
  className,
  active = false,
  color = "primary",
}: HighlightProps) {
  const colorMap = {
    primary: "ring-primary/50",
    success: "ring-emerald-500/50",
    warning: "ring-yellow-500/50",
    destructive: "ring-red-500/50",
  };

  return (
    <motion.div
      className={cn("relative rounded-md", className)}
      animate={active ? {
        boxShadow: [
          `0 0 0 0 transparent`,
          `0 0 0 4px var(--${color === "primary" ? "primary" : color === "success" ? "emerald-500" : color === "warning" ? "yellow-500" : "red-500"})`,
          `0 0 0 0 transparent`,
        ],
      } : {}}
      transition={{ duration: 0.6 }}
    >
      {children}
    </motion.div>
  );
}

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  direction?: "up" | "down" | "left" | "right" | "none";
  distance?: number;
  once?: boolean;
  threshold?: number;
  scale?: number;
}

export function ScrollReveal({
  children,
  className,
  delay = 0,
  duration = 0.5,
  direction = "up",
  distance = 30,
  once = true,
  threshold = 0.1,
  scale = 1,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once, amount: threshold });

  const getInitialTransform = () => {
    const transforms: { x?: number; y?: number; scale?: number } = {};
    switch (direction) {
      case "up": transforms.y = distance; break;
      case "down": transforms.y = -distance; break;
      case "left": transforms.x = distance; break;
      case "right": transforms.x = -distance; break;
    }
    if (scale !== 1) transforms.scale = scale;
    return transforms;
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, ...getInitialTransform() }}
      animate={isInView ? { opacity: 1, x: 0, y: 0, scale: 1 } : { opacity: 0, ...getInitialTransform() }}
      transition={{ duration, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface ScrollRevealGroupProps {
  children: React.ReactNode;
  className?: string;
  itemClassName?: string;
  staggerDelay?: number;
  direction?: "up" | "down" | "left" | "right" | "none";
  threshold?: number;
}

export function ScrollRevealGroup({
  children,
  className,
  itemClassName,
  staggerDelay = 0.1,
  direction = "up",
  threshold = 0.1,
}: ScrollRevealGroupProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: threshold });
  const childrenArray = React.Children.toArray(children);

  const getInitialPosition = () => {
    switch (direction) {
      case "up": return { y: 30 };
      case "down": return { y: -30 };
      case "left": return { x: 30 };
      case "right": return { x: -30 };
      default: return {};
    }
  };

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={{
        hidden: { opacity: 1 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: staggerDelay,
          },
        },
      }}
      className={className}
    >
      {childrenArray.map((child, index) => (
        <motion.div
          key={index}
          variants={{
            hidden: { opacity: 0, ...getInitialPosition() },
            visible: { opacity: 1, x: 0, y: 0 },
          }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className={itemClassName}
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}

export { AnimatePresence, motion };
