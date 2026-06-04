"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";

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
  const { durationMs = 700, formatter } = options;
  const prefersReducedMotion = usePrefersReducedMotion();
  const [displayValue, setDisplayValue] = useState(target);

  useIsomorphicLayoutEffect(() => {
    const mediaQuery =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    if (prefersReducedMotion || mediaQuery?.matches || durationMs <= 0) {
      setDisplayValue(target);
      return;
    }

    const startValue = 0;
    let animationFrame = 0;
    let startedAt: number | null = null;

    function tick(timestamp: number) {
      startedAt ??= timestamp;
      const elapsed = timestamp - startedAt;
      const progress = Math.min(elapsed / durationMs, 1);
      setDisplayValue(startValue + (target - startValue) * easeOutCubic(progress));

      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(tick);
      } else {
        setDisplayValue(target);
      }
    }

    setDisplayValue(startValue);
    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [durationMs, prefersReducedMotion, target]);

  return useMemo(
    () => (formatter ? formatter(displayValue) : displayValue),
    [displayValue, formatter],
  );
}
