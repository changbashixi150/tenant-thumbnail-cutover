import { describe, expect, it } from "vitest";
import { canGenerateThumbnails } from "../src/thumbnail_policy.js";

describe("tenant thumbnail gate", () => {
  it("allows only an onboarded tenant with an active account", () => {
    expect(canGenerateThumbnails({ accountStatus: "active", onboardingStatus: "complete" })).toBe(true);
    expect(canGenerateThumbnails({ accountStatus: "suspended", onboardingStatus: "complete" })).toBe(false);
    expect(canGenerateThumbnails({ accountStatus: "active", onboardingStatus: "pending" })).toBe(false);
  });
});
