import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface AnimatedListProps<T> {
  items: T[];
  keyExtractor: (item: T) => string | number;
  renderItem: (item: T, index: number) => React.ReactNode;
  className?: string;
  itemClassName?: string;
  staggerDelay?: number;
  animateDirection?: "left" | "right" | "top" | "bottom";
  highlightNew?: boolean;
  highlightDuration?: number;
}

export function AnimatedList<T>({
  items,
  keyExtractor,
  renderItem,
  className,
  itemClassName,
  staggerDelay = 0.05,
  animateDirection = "right",
  highlightNew = true,
  highlightDuration = 1000,
}: AnimatedListProps<T>) {
  const getInitialPosition = () => {
    switch (animateDirection) {
      case "left": return { x: -30, opacity: 0 };
      case "right": return { x: 30, opacity: 0 };
      case "top": return { y: -30, opacity: 0 };
      case "bottom": return { y: 30, opacity: 0 };
    }
  };

  return (
    <div className={className}>
      <AnimatePresence mode="popLayout">
        {items.map((item, index) => (
          <motion.div
            key={keyExtractor(item)}
            initial={getInitialPosition()}
            animate={{ x: 0, y: 0, opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{
              duration: 0.3,
              delay: index * staggerDelay,
              ease: "easeOut",
            }}
            layout
            className={cn(
              highlightNew && "animate-highlight-once",
              itemClassName
            )}
          >
            {renderItem(item, index)}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

interface AnimatedActivityItemProps {
  children: React.ReactNode;
  isNew?: boolean;
  className?: string;
  onClick?: () => void;
}

export function AnimatedActivityItem({
  children,
  isNew = false,
  className,
  onClick,
}: AnimatedActivityItemProps) {
  return (
    <motion.div
      initial={{ x: 30, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -30, opacity: 0 }}
      transition={{ duration: 0.3 }}
      onClick={onClick}
      className={cn(
        "relative rounded-lg hover:bg-muted/50 transition-colors",
        onClick && "cursor-pointer",
        className
      )}
    >
      {isNew && (
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 2, delay: 0.5 }}
          className="absolute inset-0 bg-primary/10 rounded-lg pointer-events-none"
        />
      )}
      {children}
    </motion.div>
  );
}

interface FadeInListProps {
  children: React.ReactNode[];
  className?: string;
  itemClassName?: string;
  staggerDelay?: number;
}

export function FadeInList({
  children,
  className,
  itemClassName,
  staggerDelay = 0.1,
}: FadeInListProps) {
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
      {children.map((child, index) => (
        <motion.div
          key={index}
          variants={{
            hidden: { opacity: 0, y: 20 },
            visible: { opacity: 1, y: 0 },
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

interface ScrollRevealListProps {
  children: React.ReactNode[];
  className?: string;
  itemClassName?: string;
  threshold?: number;
}

export function ScrollRevealList({
  children,
  className,
  itemClassName,
  threshold = 0.1,
}: ScrollRevealListProps) {
  return (
    <div className={className}>
      {children.map((child, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: threshold }}
          transition={{ duration: 0.5, delay: index * 0.1 }}
          className={itemClassName}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
}

interface ReorderableListProps<T> {
  items: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  onReorder?: (items: T[]) => void;
  className?: string;
}

export function ReorderableList<T>({
  items,
  keyExtractor,
  renderItem,
  className,
}: ReorderableListProps<T>) {
  return (
    <motion.div layout className={className}>
      <AnimatePresence>
        {items.map((item) => (
          <motion.div
            key={keyExtractor(item)}
            layout
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{
              layout: { type: "spring", stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 },
            }}
          >
            {renderItem(item)}
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
