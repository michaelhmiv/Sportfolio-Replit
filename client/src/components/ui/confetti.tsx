import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface Particle {
  id: number;
  x: number;
  y: number;
  rotation: number;
  color: string;
  scale: number;
  type: "circle" | "square" | "coin";
}

interface ConfettiProps {
  active: boolean;
  duration?: number;
  particleCount?: number;
  colors?: string[];
  className?: string;
  type?: "confetti" | "coins" | "celebration";
}

const defaultColors = [
  "#10B981", // emerald
  "#3B82F6", // blue
  "#8B5CF6", // violet
  "#F59E0B", // amber
  "#EF4444", // red
  "#EC4899", // pink
];

const coinColors = ["#FFD700", "#FFA500", "#DAA520", "#F0E68C"];

export function Confetti({
  active,
  duration = 2500,
  particleCount = 50,
  colors = defaultColors,
  className,
  type = "confetti",
}: ConfettiProps) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [isActive, setIsActive] = useState(false);

  const createParticles = useCallback(() => {
    const usedColors = type === "coins" ? coinColors : colors;
    return Array.from({ length: particleCount }, (_, i) => ({
      id: i,
      x: 50 + (Math.random() - 0.5) * 30,
      y: 50,
      rotation: Math.random() * 360,
      color: usedColors[Math.floor(Math.random() * usedColors.length)],
      scale: 0.5 + Math.random() * 0.5,
      type: (type === "coins" ? "coin" : Math.random() > 0.5 ? "circle" : "square") as Particle["type"],
    }));
  }, [particleCount, colors, type]);

  useEffect(() => {
    if (active && !isActive) {
      setIsActive(true);
      setParticles(createParticles());
      
      const timer = setTimeout(() => {
        setIsActive(false);
        setParticles([]);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [active, isActive, createParticles, duration]);

  if (!isActive) return null;

  return (
    <div className={cn("fixed inset-0 pointer-events-none z-50 overflow-hidden", className)}>
      <AnimatePresence>
        {particles.map((particle) => (
          <motion.div
            key={particle.id}
            initial={{
              x: `${particle.x}vw`,
              y: "40vh",
              scale: 0,
              rotate: 0,
              opacity: 1,
            }}
            animate={{
              x: `${particle.x + (Math.random() - 0.5) * 60}vw`,
              y: "110vh",
              scale: particle.scale,
              rotate: particle.rotation + Math.random() * 720,
              opacity: [1, 1, 0],
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: duration / 1000,
              ease: [0.25, 0.46, 0.45, 0.94],
            }}
            className="absolute"
            style={{ originX: 0.5, originY: 0.5 }}
          >
            {particle.type === "coin" ? (
              <div
                className="w-6 h-6 rounded-full border-2 flex items-center justify-center font-bold text-xs"
                style={{ 
                  backgroundColor: particle.color,
                  borderColor: "#8B6914",
                  color: "#8B6914",
                }}
              >
                $
              </div>
            ) : particle.type === "circle" ? (
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: particle.color }}
              />
            ) : (
              <div
                className="w-3 h-3"
                style={{ backgroundColor: particle.color }}
              />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

interface CelebrationBurstProps {
  active: boolean;
  onComplete?: () => void;
}

export function CelebrationBurst({ active, onComplete }: CelebrationBurstProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (active) {
      setShow(true);
      const timer = setTimeout(() => {
        setShow(false);
        onComplete?.();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [active, onComplete]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.2, 1], opacity: [0, 1, 1] }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center"
        >
          <motion.div
            animate={{
              scale: [1, 1.5, 2],
              opacity: [0.5, 0.2, 0],
            }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="absolute w-32 h-32 rounded-full bg-emerald-500/30"
          />
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 20, delay: 0.1 }}
            className="relative z-10 bg-emerald-500 text-white p-4 rounded-full shadow-xl"
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <motion.path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.4, delay: 0.2 }}
              />
            </svg>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface SparkleProps {
  active: boolean;
  className?: string;
}

export function Sparkle({ active, className }: SparkleProps) {
  const sparkles = Array.from({ length: 6 }, (_, i) => ({
    id: i,
    angle: (360 / 6) * i,
    delay: i * 0.05,
  }));

  return (
    <AnimatePresence>
      {active && (
        <div className={cn("absolute inset-0 pointer-events-none", className)}>
          {sparkles.map((sparkle) => (
            <motion.div
              key={sparkle.id}
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: [0, 1, 0],
                opacity: [0, 1, 0],
                x: [0, Math.cos((sparkle.angle * Math.PI) / 180) * 30],
                y: [0, Math.sin((sparkle.angle * Math.PI) / 180) * 30],
              }}
              transition={{
                duration: 0.6,
                delay: sparkle.delay,
                ease: "easeOut",
              }}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            >
              <div className="w-2 h-2 bg-yellow-400 rounded-full" />
            </motion.div>
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}
