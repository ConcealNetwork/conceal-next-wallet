"use client";

import { useEffect, useState } from "react";

/** Seconds elapsed since a unix timestamp; ticks every second. */
export function useLiveAgeSeconds(sinceSec: number): number {
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (sinceSec <= 0) return;
    const id = window.setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [sinceSec]);

  if (sinceSec <= 0) return 0;
  return Math.max(0, nowSec - sinceSec);
}
