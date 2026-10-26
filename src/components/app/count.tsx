"use client";

import * as React from "react";

/**
 * A number that counts up once when it first appears and glides when it changes.
 * Drawn straight into the DOM (no re-renders); instant when the device asks for reduced motion.
 */
export function Count({ value, duration = 720, className }: { value: number; duration?: number; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const shown = React.useRef(0);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = shown.current;
    const to = value;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || from === to) {
      el.textContent = String(to);
      shown.current = to;
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(from + (to - from) * eased);
      el.textContent = String(v);
      shown.current = v;
      if (p < 1) raf = requestAnimationFrame(step);
    };
    el.textContent = String(from);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span ref={ref} className={className ? `tabular ${className}` : "tabular"} aria-label={String(value)} />;
}
