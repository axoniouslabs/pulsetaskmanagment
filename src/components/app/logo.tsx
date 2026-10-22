/** Pulse mark: a rounded square with a single heartbeat line. `inverse` is for dark backgrounds. */
export function Logo({ size = 32, inverse = false }: { size?: number; inverse?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <rect width="32" height="32" rx="9" fill={inverse ? "#ffffff" : "#0f3d47"} />
      <path d="M6 17h5l2.4-6 4.2 11 2.6-5H26" fill="none" stroke={inverse ? "#0f3d47" : "#fff"} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="26" cy="17" r="2" fill="#f2b33d" />
    </svg>
  );
}
