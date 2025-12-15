import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBalance(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  
  if (isNaN(num)) return "$0.00";
  if (num === 0) return "$0.00";
  
  if (num >= 1_000_000) {
    return "$" + (num / 1_000_000).toFixed(2) + "M";
  } else if (num >= 1_000) {
    return "$" + (num / 1_000).toFixed(1) + "k";
  } else {
    return "$" + num.toFixed(2);
  }
}
