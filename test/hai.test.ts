/**
 * Tests for HAI.ai API client functions
 */

import { describe, it, expect } from "vitest";
import {
  determineTrustLevel,
  canUpgradeClaim,
  validateClaimRequirements,
} from "../src/tools/hai";

describe("determineTrustLevel", () => {
  it("returns 'basic' when no domain, no DNS, no HAI", () => {
    expect(determineTrustLevel(false, false, false)).toBe("basic");
  });

  it("returns 'basic' when domain exists but no DNS verification", () => {
    expect(determineTrustLevel(true, false, false)).toBe("basic");
  });

  it("returns 'domain' when domain + DNS verified", () => {
    expect(determineTrustLevel(true, true, false)).toBe("domain");
  });

  it("returns 'attested' when HAI registered", () => {
    expect(determineTrustLevel(true, true, true)).toBe("attested");
  });

  it("returns 'attested' even without domain if HAI registered", () => {
    expect(determineTrustLevel(false, false, true)).toBe("attested");
  });

  it("returns 'domain' when DNS verified but not HAI registered", () => {
    expect(determineTrustLevel(true, true, false)).toBe("domain");
  });
});

describe("canUpgradeClaim", () => {
  it("allows same claim (no-op)", () => {
    expect(canUpgradeClaim("unverified", "unverified")).toBe(true);
    expect(canUpgradeClaim("verified", "verified")).toBe(true);
    expect(canUpgradeClaim("verified-hai.ai", "verified-hai.ai")).toBe(true);
  });

  it("allows upgrade from unverified to verified", () => {
    expect(canUpgradeClaim("unverified", "verified")).toBe(true);
  });

  it("allows upgrade from unverified to verified-hai.ai", () => {
    expect(canUpgradeClaim("unverified", "verified-hai.ai")).toBe(true);
  });

  it("allows upgrade from verified to verified-hai.ai", () => {
    expect(canUpgradeClaim("verified", "verified-hai.ai")).toBe(true);
  });

  it("prevents downgrade from verified to unverified", () => {
    expect(canUpgradeClaim("verified", "unverified")).toBe(false);
  });

  it("prevents downgrade from verified-hai.ai to verified", () => {
    expect(canUpgradeClaim("verified-hai.ai", "verified")).toBe(false);
  });

  it("prevents downgrade from verified-hai.ai to unverified", () => {
    expect(canUpgradeClaim("verified-hai.ai", "unverified")).toBe(false);
  });
});

describe("validateClaimRequirements", () => {
  it("returns null for unverified (no requirements)", () => {
    expect(validateClaimRequirements("unverified", false, false)).toBeNull();
  });

  it("returns error for verified without domain", () => {
    const error = validateClaimRequirements("verified", false, false);
    expect(error).toBeDefined();
    expect(error).toContain("jacsAgentDomain");
  });

  it("returns null for verified with domain", () => {
    expect(validateClaimRequirements("verified", true, false)).toBeNull();
  });

  it("returns error for verified-hai.ai without HAI registration", () => {
    const error = validateClaimRequirements("verified-hai.ai", true, false);
    expect(error).toBeDefined();
    expect(error).toContain("HAI");
  });

  it("returns null for verified-hai.ai with HAI registration", () => {
    expect(validateClaimRequirements("verified-hai.ai", true, true)).toBeNull();
  });
});
