import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// cn is a function that takes in any number of class names and merges them into a single string.
// It uses the clsx library to handle conditional class names and the tailwind-merge library 
// to merge Tailwind CSS classes, ensuring that the last class takes precedence in case of conflicts.
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
