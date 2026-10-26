import { describe, expect, it } from "vitest";
import { accessOf } from "@/lib/access";

describe("a company's access", () => {
  it("is active unless the administrator paused it", () => {
    expect(accessOf({ status: "active" })).toBe("active");
    expect(accessOf({ status: "suspended" })).toBe("paused");
  });
});
