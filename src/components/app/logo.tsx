import type * as React from "react";

/**
 * Pulse mark: a rounded square with a single heartbeat line.
 * `inverse` is for dark backgrounds. `trace` draws the line once (sign-in, first load);
 * `beat` traces it gently on repeat, used only while Pulse is loading.
 */
export function Logo({ size = 32, inverse = false, trace }: { size?: number; inverse?: boolean; trace?: "once" | "beat" }) {
  const line = inverse ? "#0f3d47" : "#fff";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <rect width="32" height="32" rx="9" fill={inverse ? "#ffffff" : "#0f3d47"} />
      <path
        d="M6 17h5l2.4-6 4.2 11 2.6-5H26"
        pathLength={100}
        fill="none"
        stroke={line}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={trace === "once" ? "trace" : trace === "beat" ? "trace-loop" : undefined}
        style={trace ? ({ "--trace-len": 100 } as React.CSSProperties) : undefined}
      />
      <circle
        cx="26"
        cy="17"
        r="2"
        fill="#f2b33d"
        className={trace === "once" ? "enter" : undefined}
        style={trace === "once" ? ({ "--d": "900ms" } as React.CSSProperties) : undefined}
      />
    </svg>
  );
}
