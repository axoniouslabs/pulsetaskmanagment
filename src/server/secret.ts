import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/** constant-time comparison of a supplied secret with the configured one (both trimmed) */
export function secretMatches(given: string | null | undefined, expected: string | null | undefined) {
  if (!given || !expected?.trim()) return false;
  // hash first so different lengths take the same time
  const a = createHash("sha256").update(given.trim()).digest();
  const b = createHash("sha256").update(expected.trim()).digest();
  return timingSafeEqual(a, b);
}
