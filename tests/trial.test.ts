import { describe, expect, it } from "vitest";
import { accessOf, ALLOWED_AFTER_TRIAL, trialDaysLeft } from "@/lib/access";

const now = new Date("2026-10-29T12:00:00Z");
describe("free trial access", () => {
  it("a self sign-up is on trial for 3 days, then read-only; paid and paused are unchanged", () => {
    expect(accessOf({ status: "active" }, now)).toBe("active");
    expect(accessOf({ status: "active", trialEndsAt: "2026-11-01T12:00:00Z" }, now)).toBe("trial");
    expect(accessOf({ status: "active", trialEndsAt: "2026-10-29T11:59:00Z" }, now)).toBe("trial_ended");
    expect(accessOf({ status: "suspended", trialEndsAt: "2026-11-01T12:00:00Z" }, now)).toBe("paused");
    expect(trialDaysLeft("2026-11-01T12:00:00Z", now)).toBe(3);
    expect(trialDaysLeft("2026-10-29T18:00:00Z", now)).toBe(1);
  });
  it("after the trial only personal settings can change", () => {
    expect(ALLOWED_AFTER_TRIAL.has("markRead")).toBe(true);
    expect(ALLOWED_AFTER_TRIAL.has("createTask")).toBe(false);
  });
});
