"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AMOUNT_COUNT_UP_MS } from "@/lib/ui/animation";

type UseCountUpOptions = {
  durationMs?: number;
  formatter?: (value: number) => string;
};

const easeOutCubic = (value: number) => 1 - (1 - value) ** 3;
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    function handleChange() {
      setPrefersReducedMotion(mediaQuery.matches);
    }

    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return prefersReducedMotion;
}

export function useCountUp(target: number, options: UseCountUpOptions = {}) {
  const { durationMs = AMOUNT_COUNT_UP_MS, formatter } = options;
  const prefersReducedMotion = usePrefersReducedMotion();
  const [displayValue, setDisplayValue] = useState(target);
  // Track the latest shown value (and whether we've animated once) so a new
  // target continues from where we are instead of snapping back to 0. During
  // sync the target updates a few times a second; restarting from 0 each time
  // made the value visibly "reload". The entrance still counts up from 0.
  const displayRef = useRef(target);
  const hasAnimated = useRef(false);

  useIsomorphicLayoutEffect(() => {
    const mediaQuery =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    if (prefersReducedMotion || mediaQuery?.matches || durationMs <= 0) {
      hasAnimated.current = true;
      displayRef.current = target;
      setDisplayValue(target);
      return;
    }

    const startValue = hasAnimated.current ? displayRef.current : 0;
    hasAnimated.current = true;
    let animationFrame = 0;
    let startedAt: number | null = null;

    function tick(timestamp: number) {
      startedAt ??= timestamp;
      const elapsed = timestamp - startedAt;
      const progress = Math.min(elapsed / durationMs, 1);
      const value =
        progress < 1 ? startValue + (target - startValue) * easeOutCubic(progress) : target;
      displayRef.current = value;
      setDisplayValue(value);

      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(tick);
      }
    }

    displayRef.current = startValue;
    setDisplayValue(startValue);
    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [durationMs, prefersReducedMotion, target]);

  return useMemo(
    () => (formatter ? formatter(displayValue) : displayValue),
    [displayValue, formatter],
  );
}
