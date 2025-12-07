import { motion } from "framer-motion";
import { Card } from "./card";
import { cn } from "@/lib/utils";
import { forwardRef, HTMLAttributes } from "react";

interface AnimatedCardProps extends HTMLAttributes<HTMLDivElement> {
  hoverLift?: boolean;
  hoverGlow?: boolean;
  clickable?: boolean;
  glowColor?: "primary" | "success" | "warning" | "destructive";
  delay?: number;
}

export const AnimatedCard = forwardRef<HTMLDivElement, AnimatedCardProps>(
  ({ 
    children, 
    className, 
    hoverLift = true, 
    hoverGlow = false,
    clickable = false,
    glowColor = "primary",
    delay = 0,
    ...props 
  }, ref) => {
    const glowColors = {
      primary: "hover:shadow-primary/20",
      success: "hover:shadow-emerald-500/20",
      warning: "hover:shadow-yellow-500/20",
      destructive: "hover:shadow-red-500/20",
    };

    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay, ease: "easeOut" }}
        whileHover={hoverLift ? { 
          y: -4, 
          transition: { duration: 0.2, ease: "easeOut" } 
        } : undefined}
        whileTap={clickable ? { scale: 0.98 } : undefined}
        className={cn(
          "transition-shadow duration-300",
          hoverLift && "hover:shadow-lg",
          hoverGlow && glowColors[glowColor],
          clickable && "cursor-pointer",
        )}
      >
        <Card className={cn("h-full", className)} {...props}>
          {children}
        </Card>
      </motion.div>
    );
  }
);

AnimatedCard.displayName = "AnimatedCard";

interface FlipCardProps {
  front: React.ReactNode;
  back: React.ReactNode;
  className?: string;
  flipOnHover?: boolean;
}

export function FlipCard({ 
  front, 
  back, 
  className,
  flipOnHover = true 
}: FlipCardProps) {
  return (
    <motion.div
      className={cn("relative perspective-1000", className)}
      initial="front"
      whileHover={flipOnHover ? "back" : undefined}
    >
      <motion.div
        className="relative w-full h-full"
        style={{ transformStyle: "preserve-3d" }}
        variants={{
          front: { rotateY: 0 },
          back: { rotateY: 180 },
        }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <div
          className="absolute w-full h-full backface-hidden"
          style={{ backfaceVisibility: "hidden" }}
        >
          {front}
        </div>
        <div
          className="absolute w-full h-full backface-hidden"
          style={{ 
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          {back}
        </div>
      </motion.div>
    </motion.div>
  );
}

interface GlowCardProps extends HTMLAttributes<HTMLDivElement> {
  glowIntensity?: "low" | "medium" | "high";
  animated?: boolean;
}

export const GlowCard = forwardRef<HTMLDivElement, GlowCardProps>(
  ({ children, className, glowIntensity = "medium", animated = true, ...props }, ref) => {
    const intensityClasses = {
      low: "shadow-lg shadow-primary/5",
      medium: "shadow-xl shadow-primary/10",
      high: "shadow-2xl shadow-primary/20",
    };

    return (
      <motion.div
        ref={ref}
        animate={animated ? {
          boxShadow: [
            "0 20px 25px -5px rgba(var(--primary), 0.1)",
            "0 20px 25px -5px rgba(var(--primary), 0.2)",
            "0 20px 25px -5px rgba(var(--primary), 0.1)",
          ],
        } : undefined}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <Card 
          className={cn(intensityClasses[glowIntensity], className)} 
          {...props}
        >
          {children}
        </Card>
      </motion.div>
    );
  }
);

GlowCard.displayName = "GlowCard";

interface ExpandableCardProps extends HTMLAttributes<HTMLDivElement> {
  expandedContent?: React.ReactNode;
  isExpanded?: boolean;
  onToggle?: () => void;
}

export function ExpandableCard({
  children,
  expandedContent,
  isExpanded = false,
  onToggle,
  className,
  ...props
}: ExpandableCardProps) {
  return (
    <Card
      className={cn(
        "cursor-pointer transition-all duration-300",
        isExpanded && "ring-2 ring-primary",
        className
      )}
      onClick={onToggle}
      {...props}
    >
      {children}
      <motion.div
        initial={false}
        animate={{
          height: isExpanded ? "auto" : 0,
          opacity: isExpanded ? 1 : 0,
        }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="overflow-hidden"
      >
        {expandedContent}
      </motion.div>
    </Card>
  );
}
