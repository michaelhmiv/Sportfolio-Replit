import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { Button, ButtonProps } from "./button";
import { cn } from "@/lib/utils";
import { Loader2, Check, X } from "lucide-react";

interface LoadingButtonProps extends ButtonProps {
  loading?: boolean;
  success?: boolean;
  error?: boolean;
  loadingText?: string;
  successText?: string;
  errorText?: string;
  successDuration?: number;
  errorDuration?: number;
}

export function LoadingButton({
  children,
  loading = false,
  success = false,
  error = false,
  loadingText,
  successText,
  errorText,
  successDuration = 2000,
  errorDuration = 2000,
  className,
  disabled,
  ...props
}: LoadingButtonProps) {
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    if (success) {
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), successDuration);
      return () => clearTimeout(timer);
    }
  }, [success, successDuration]);

  useEffect(() => {
    if (error) {
      setShowError(true);
      const timer = setTimeout(() => setShowError(false), errorDuration);
      return () => clearTimeout(timer);
    }
  }, [error, errorDuration]);

  const getContent = () => {
    if (loading) {
      return (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex items-center gap-2"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          {loadingText || children}
        </motion.span>
      );
    }

    if (showSuccess) {
      return (
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          className="flex items-center gap-2"
        >
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
          >
            <Check className="h-4 w-4" />
          </motion.span>
          {successText || "Success!"}
        </motion.span>
      );
    }

    if (showError) {
      return (
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          className="flex items-center gap-2"
        >
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1, rotate: [0, -10, 10, 0] }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
          >
            <X className="h-4 w-4" />
          </motion.span>
          {errorText || "Error"}
        </motion.span>
      );
    }

    return children;
  };

  return (
    <Button
      className={cn(
        "relative overflow-hidden transition-all duration-300",
        showSuccess && "bg-emerald-600 hover:bg-emerald-700",
        showError && "bg-red-600 hover:bg-red-700",
        className
      )}
      disabled={disabled || loading || showSuccess || showError}
      {...props}
    >
      <AnimatePresence mode="wait">
        {getContent()}
      </AnimatePresence>
    </Button>
  );
}

interface AnimatedSubmitButtonProps extends ButtonProps {
  isPending?: boolean;
  isSuccess?: boolean;
  isError?: boolean;
}

export function AnimatedSubmitButton({
  children,
  isPending = false,
  isSuccess = false,
  isError = false,
  className,
  disabled,
  ...props
}: AnimatedSubmitButtonProps) {
  return (
    <LoadingButton
      loading={isPending}
      success={isSuccess}
      error={isError}
      loadingText="Submitting..."
      successText="Done!"
      errorText="Failed"
      className={className}
      disabled={disabled}
      {...props}
    >
      {children}
    </LoadingButton>
  );
}

interface PulsingButtonProps extends ButtonProps {
  pulse?: boolean;
}

export function PulsingButton({
  children,
  pulse = false,
  className,
  ...props
}: PulsingButtonProps) {
  return (
    <motion.div
      animate={pulse ? {
        scale: [1, 1.02, 1],
        boxShadow: [
          "0 0 0 0 rgba(var(--primary), 0)",
          "0 0 0 8px rgba(var(--primary), 0.2)",
          "0 0 0 0 rgba(var(--primary), 0)",
        ],
      } : {}}
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: "easeInOut",
      }}
      className="inline-block rounded-md"
    >
      <Button className={className} {...props}>
        {children}
      </Button>
    </motion.div>
  );
}
