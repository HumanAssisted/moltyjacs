/**
 * HAI.ai API Client
 *
 * Provides functions to interact with HAI.ai for agent registration and verification.
 */

import type { HaiRegistration, TrustLevel, VerificationClaim } from "../index";

const DEFAULT_HAI_API_URL = "https://api.hai.ai";
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Get the HAI.ai API URL from environment or default
 */
export function getHaiApiUrl(): string {
  return process.env.HAI_API_URL || DEFAULT_HAI_API_URL;
}

/**
 * Verify that an agent is registered with HAI.ai
 *
 * @param agentId - The JACS agent ID (UUID)
 * @param publicKeyHash - The SHA-256 hash of the agent's public key (hex encoded)
 * @param apiUrl - Optional HAI.ai API URL override
 * @returns HaiRegistration with verification status
 */
export async function verifyHaiRegistration(
  agentId: string,
  publicKeyHash: string,
  apiUrl?: string
): Promise<HaiRegistration> {
  const url = apiUrl || getHaiApiUrl();
  const endpoint = `${url}/v1/agents/${agentId}`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Agent '${agentId}' is not registered with HAI.ai`);
    }
    throw new Error(`HAI.ai API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    agent_id?: string;
    public_key_hash?: string;
    verified?: boolean;
    verified_at?: string;
    registration_type?: string;
  };

  // Validate the response
  if (!data.agent_id) {
    throw new Error("Invalid response from HAI.ai: missing agent_id");
  }

  // Check public key hash matches
  if (data.public_key_hash && publicKeyHash && data.public_key_hash !== publicKeyHash) {
    throw new Error("Public key hash mismatch: agent may have been re-keyed");
  }

  return {
    verified: data.verified ?? false,
    verified_at: data.verified_at,
    registration_type: data.registration_type || "agent",
    agent_id: data.agent_id,
    public_key_hash: data.public_key_hash || publicKeyHash,
  };
}

/**
 * Register an agent with HAI.ai
 *
 * @param agentId - The JACS agent ID
 * @param publicKey - The PEM-encoded public key
 * @param publicKeyHash - The SHA-256 hash of the public key
 * @param agentName - Optional human-readable name
 * @param apiKey - HAI.ai API key (or from HAI_API_KEY env var)
 * @param apiUrl - Optional HAI.ai API URL override
 * @returns HaiRegistration result
 */
export async function registerWithHai(
  agentId: string,
  publicKey: string,
  publicKeyHash: string,
  agentName?: string,
  apiKey?: string,
  apiUrl?: string
): Promise<HaiRegistration> {
  const url = apiUrl || getHaiApiUrl();
  const key = apiKey || process.env.HAI_API_KEY;
  const endpoint = `${url}/v1/agents`;

  if (!key) {
    throw new Error("HAI.ai API key required. Set HAI_API_KEY environment variable or provide apiKey.");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      agent_id: agentId,
      public_key: publicKey,
      public_key_hash: publicKeyHash,
      name: agentName,
    }),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Invalid HAI.ai API key");
    }
    if (response.status === 409) {
      throw new Error("Agent already registered with HAI.ai");
    }
    const errorText = await response.text();
    throw new Error(`HAI.ai registration failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    agent_id: string;
    public_key_hash: string;
    verified: boolean;
    verified_at: string;
    registration_type: string;
  };

  return {
    verified: data.verified,
    verified_at: data.verified_at,
    registration_type: data.registration_type,
    agent_id: data.agent_id,
    public_key_hash: data.public_key_hash,
  };
}

/**
 * Check registration status for an agent
 *
 * @param agentId - The JACS agent ID
 * @param apiKey - HAI.ai API key (optional, for authenticated status check)
 * @param apiUrl - Optional HAI.ai API URL override
 * @returns HaiRegistration or null if not registered
 */
export async function checkHaiStatus(
  agentId: string,
  apiKey?: string,
  apiUrl?: string
): Promise<HaiRegistration | null> {
  const url = apiUrl || getHaiApiUrl();
  const endpoint = `${url}/v1/agents/${agentId}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  const key = apiKey || process.env.HAI_API_KEY;
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`HAI.ai API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      agent_id: string;
      public_key_hash: string;
      verified: boolean;
      verified_at: string;
      registration_type: string;
    };

    return {
      verified: data.verified,
      verified_at: data.verified_at,
      registration_type: data.registration_type,
      agent_id: data.agent_id,
      public_key_hash: data.public_key_hash,
    };
  } catch (err: any) {
    if (err.name === "TimeoutError") {
      throw new Error("HAI.ai API request timed out");
    }
    throw err;
  }
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
 * @param haiRegistered - Whether agent is HAI.ai registered
 * @returns Error message or null if valid
 */
export function validateClaimRequirements(
  claim: VerificationClaim,
  hasDomain: boolean,
  haiRegistered: boolean
): string | null {
  if (claim === "verified" && !hasDomain) {
    return "Claim 'verified' requires jacsAgentDomain to be configured";
  }
  if (claim === "verified-hai.ai" && !haiRegistered) {
    return "Claim 'verified-hai.ai' requires registration with HAI.ai";
  }
  return null;
}
