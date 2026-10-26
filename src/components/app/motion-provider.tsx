"use client";

import { LazyMotion, MotionConfig, domMax } from "motion/react";

/** layout animations for the app; respects the device's "reduce motion" setting */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
