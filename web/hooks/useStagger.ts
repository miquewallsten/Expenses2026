import { useMemo } from "react";

export interface StaggerOptions {
  /** Number of items to generate delays for */
  count: number;
  /** Base delay in milliseconds before the first item */
  baseDelay?: number;
  /** Increment in milliseconds between each item */
  increment?: number;
  /** Maximum delay cap in milliseconds */
  maxDelay?: number;
}

export interface StaggerItem {
  animationDelay: string;
}

/**
 * Generate staggered animation delays for a list of items.
 *
 * @example
 * const delays = useStagger({ count: 5 });
 * // Returns: [{ animationDelay: '0ms' }, { animationDelay: '30ms' }, ...]
 *
 * @example
 * // With custom options
 * const delays = useStagger({ count: 10, baseDelay: 100, increment: 50, maxDelay: 500 });
 */
export function useStagger({
  count,
  baseDelay = 0,
  increment = 30,
  maxDelay = 300,
}: StaggerOptions): StaggerItem[] {
  return useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        animationDelay: `${Math.min(baseDelay + i * increment, maxDelay)}ms`,
      })),
    [count, baseDelay, increment, maxDelay]
  );
}