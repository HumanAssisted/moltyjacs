/**
 * HAI.ai Trust & Verification Logic
 *
 * Pure decision functions for trust level determination and verification claim validation.
 * Network I/O has been migrated to HaiClient from haisdk.
 */

import type { TrustLevel, VerificationClaim } from "../index";

/**
 * Get the HAI.ai API URL from environment or default
 */
export function getHaiApiUrl(): string {
  return process.env.HAI_API_URL || "https://hai.ai";
}

/**
 * Determine trust level based on verification status
 *
 * @param hasDomain - Whether the agent has a domain configured
 * @param dnsVerified - Whether DNS verification passed
 * @param haiRegistered - Whether agent is registered with HAI.ai
 * @returns TrustLevel
 */
export function determineTrustLevel(
  hasDomain: boolean,
  dnsVerified: boolean,
  haiRegistered: boolean
): TrustLevel {
  if (haiRegistered) {
    return "attested";
  }
  if (hasDomain && dnsVerified) {
    return "domain";
  }
  return "basic";
}

/**
 * Validate verification claim can be set
 * Claims can only be upgraded, never downgraded
 *
 * @param currentClaim - Current verification claim
 * @param newClaim - New verification claim to set
 * @returns true if upgrade is allowed
 */
export function canUpgradeClaim(
  currentClaim: VerificationClaim | undefined,
  newClaim: VerificationClaim
): boolean {
  const claimOrder: VerificationClaim[] = ["unverified", "verified", "verified-hai.ai"];
  const currentIndex = claimOrder.indexOf(currentClaim || "unverified");
  const newIndex = claimOrder.indexOf(newClaim);
  return newIndex >= currentIndex;
}

/**
 * Validate requirements for a verification claim
 *
 * @param claim - The claim to validate
 * @param hasDomain - Whether agent has domain configured
 * @param dnsVerified - Whether DNS TXT proof has been verified against the local key hash
 * @param haiRegistered - Whether agent is HAI.ai registered
 * @returns Error message or null if valid
 */
export function validateClaimRequirements(
  claim: VerificationClaim,
  hasDomain: boolean,
  dnsVerified: boolean,
  haiRegistered: boolean
): string | null {
  if (claim === "verified" && !hasDomain) {
    return "Claim 'verified' requires jacsAgentDomain to be configured";
  }
  if (claim === "verified" && !dnsVerified) {
    return "Claim 'verified' requires DNS TXT verification (published hash must match your current public key)";
  }
  if (claim === "verified-hai.ai" && !haiRegistered) {
    return "Claim 'verified-hai.ai' requires registration with HAI.ai";
  }
  return null;
}
