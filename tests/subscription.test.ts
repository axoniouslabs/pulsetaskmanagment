import { describe, expect, it } from "vitest";
import { accessOf, canWrite, extendFrom } from "@/lib/subscription";

const now = new Date("2026-10-26T12:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

describe("a company's access", () => {
  it("never ends without a date", () => {
    const a = accessOf({ status: "active", expiresAt: null }, now);
    expect(a.state).toBe("active");
    expect(canWrite(a)).toBe(true);
  });

  it("warns in the last week, still working", () => {
    const a = accessOf({ status: "active", expiresAt: days(5) }, now);
    expect(a.state).toBe("expiring");
    expect(a.daysLeft).toBe(5);
    expect(canWrite(a)).toBe(true);
  });

  it("becomes read-only once the date passes", () => {
    const a = accessOf({ status: "active", expiresAt: days(-1) }, now);
    expect(a.state).toBe("expired");
    expect(canWrite(a)).toBe(false);
  });

  it("is fully paused when suspended, whatever the date", () => {
    expect(accessOf({ status: "suspended", expiresAt: days(200) }, now).state).toBe("suspended");
    expect(canWrite(accessOf({ status: "suspended", expiresAt: null }, now))).toBe(false);
  });
});

describe("recording a payment", () => {
  it("adds months after the current paid-up date when it's still ahead", () => {
    const { from, to } = extendFrom(days(10), 2, now);
    expect(from).toEqual(days(10));
    expect(to.getUTCMonth()).toBe((days(10).getUTCMonth() + 2) % 12);
  });

  it("starts from today when the subscription had already ended", () => {
    const { from } = extendFrom(days(-30), 1, now);
    expect(from).toEqual(now);
  });

  it("never skips a short month (31 Jan + 1 month is the end of February)", () => {
    const { to } = extendFrom(null, 1, new Date("2027-01-31T12:00:00"));
    expect(to.getMonth()).toBe(1);
  });
});
