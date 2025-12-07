import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme") as "light" | "dark" | null;
    const initialTheme = stored || "dark";
    setTheme(initialTheme);
    document.documentElement.classList.toggle("dark", initialTheme === "dark");
  }, []);

  const ANIMATION_DURATION = 300;

  const toggleTheme = () => {
    if (isAnimating) return;
    
    setIsAnimating(true);
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    document.documentElement.classList.toggle("dark", newTheme === "dark");
    
    setTimeout(() => setIsAnimating(false), ANIMATION_DURATION);
  };

  const iconVariants = {
    initial: { 
      scale: 0,
      rotate: -180,
      opacity: 0 
    },
    animate: { 
      scale: 1,
      rotate: 0,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 260,
        damping: 20,
        duration: ANIMATION_DURATION / 1000
      }
    },
    exit: { 
      scale: 0,
      rotate: 180,
      opacity: 0,
      transition: {
        duration: 0.15,
        ease: "easeIn"
      }
    }
  };

  const rayVariants = {
    animate: {
      scale: [1, 1.2, 1],
      opacity: [1, 0.8, 1],
      transition: {
        duration: 2,
        repeat: Infinity,
        ease: "easeInOut"
      }
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      data-testid="button-theme-toggle"
      className="relative overflow-visible"
      disabled={isAnimating}
    >
      <AnimatePresence mode="wait" initial={false}>
        {theme === "light" ? (
          <motion.div
            key="moon"
            variants={iconVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute inset-0 flex items-center justify-center"
          >
            <Moon className="h-5 w-5" />
          </motion.div>
        ) : (
          <motion.div
            key="sun"
            variants={iconVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute inset-0 flex items-center justify-center"
          >
            <motion.div
              variants={rayVariants}
              animate="animate"
            >
              <Sun className="h-5 w-5" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Button>
  );
}
