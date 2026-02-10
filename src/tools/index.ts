/**
 * JACS Agent Tools
 *
 * Tools that AI agents can use to sign and verify documents.
 */

import {
  hashString,
  JacsAgent,
  audit as jacsAudit,
  generateVerifyLink,
} from "@hai.ai/jacs/simple";
import { legacyVerifyString as verifyString } from "@hai.ai/jacs";
import * as dns from "dns";
import { promisify } from "util";
import type { OpenClawPluginAPI, TrustLevel, VerificationClaim, HaiRegistration, AttestationStatus } from "../index";
import {
  verifyHaiRegistration,
  checkHaiStatus,
  registerWithHai,
  determineTrustLevel,
  canUpgradeClaim,
  validateClaimRequirements,
} from "./hai";
import { registerDocumentTools } from "./documents";

const resolveTxt = promisify(dns.resolveTxt);

// Cache for fetched public keys (domain -> key info)
interface CachedKey {
  key: string;
  algorithm: string;
  agentId?: string;
  publicKeyHash?: string;
  fetchedAt: number;
}
const pubkeyCache: Map<string, CachedKey> = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Export CachedKey for use by CLI
export type { CachedKey };

export interface ToolResult {
  result?: any;
  error?: string;
}

// Tool parameter interfaces
export interface SignParams {
  document: any;
}

export interface VerifyParams {
  document: any;
}

export interface CreateAgreementParams {
  document: any;
  agentIds: string[];
  question?: string;
  context?: string;
}

export interface SignAgreementParams {
  document: any;
  agreementFieldname?: string;
}

export interface CheckAgreementParams {
  document: any;
  agreementFieldname?: string;
}

export interface HashParams {
  content: string;
}

export interface FetchPubkeyParams {
  domain: string;
  skipCache?: boolean;
}

export interface VerifyWithKeyParams {
  document: any;
  publicKey: string;
  algorithm?: string;
}

export interface VerifyAutoParams {
  document: any;
  domain?: string;
  verifyDns?: boolean;
  requiredTrustLevel?: TrustLevel;
}

export interface DnsLookupParams {
  domain: string;
}

export interface LookupAgentParams {
  domain: string;
}

export interface VerifyHaiRegistrationParams {
  agentId: string;
  publicKeyHash?: string;
  domain?: string;
}

export interface GetAttestationParams {
  domain?: string;
  agentId?: string;
}

export interface SetVerificationClaimParams {
  claim: VerificationClaim;
}

/**
 * Get the JACS agent instance from the API runtime
 */
function getAgent(api: OpenClawPluginAPI): JacsAgent | null {
  return api.runtime.jacs?.getAgent() || null;
}

/**
 * Sanitize domain by removing protocol prefix and trailing slash
 */
function sanitizeDomain(input: string): string {
  return input.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/**
 * Create a tool handler that requires JACS to be initialized.
 * Automatically handles the agent null check and error wrapping.
 */
function requireAgent<T>(
  api: OpenClawPluginAPI,
  handler: (agent: JacsAgent, params: any) => Promise<T>
): (params: any) => Promise<ToolResult> {
  return async (params: any): Promise<ToolResult> => {
    const agent = getAgent(api);
    if (!agent) {
      return { error: "JACS not initialized. Run 'openclaw jacs init' first." };
    }
    try {
      const result = await handler(agent, params);
      return { result };
    } catch (err: any) {
      return { error: err.message };
    }
  };
}

/**
 * Parse JACS DNS TXT record
 * Format: v=hai.ai; jacs_agent_id=UUID; alg=SHA-256; enc=hex; jac_public_key_hash=HASH
 */
export function parseDnsTxt(txt: string): {
  v?: string;
  jacsAgentId?: string;
  alg?: string;
  enc?: string;
  publicKeyHash?: string;
} {
  const result: Record<string, string> = {};
  const parts = txt.split(";").map((s) => s.trim());
  for (const part of parts) {
    const equalsIdx = part.indexOf("=");
    if (equalsIdx <= 0) {
      continue;
    }
    const key = part.slice(0, equalsIdx).trim();
    const value = part.slice(equalsIdx + 1).trim();
    if (key && value) {
      result[key] = value;
    }
  }
  return {
    v: result["v"],
    jacsAgentId: result["jacs_agent_id"],
    alg: result["alg"],
    enc: result["enc"],
    publicKeyHash: result["jac_public_key_hash"],
  };
}

/**
 * Resolve DNS TXT record for JACS agent
 */
export async function resolveDnsRecord(
  domain: string
): Promise<{ txt: string; parsed: ReturnType<typeof parseDnsTxt> } | null> {
  const owner = `_v1.agent.jacs.${domain.replace(/\.$/, "")}`;
  try {
    const records = await resolveTxt(owner);
    // TXT records come as arrays of strings, join them
    const txt = records.map((r) => r.join("")).join("");
    if (!txt) return null;
    return { txt, parsed: parseDnsTxt(txt) };
  } catch {
    return null;
  }
}

/**
 * Fetch public key from domain's well-known endpoint
 */
export async function fetchPublicKey(
  domain: string,
  skipCache = false
): Promise<{ data: CachedKey; cached: boolean } | { error: string }> {
  const cacheKey = domain.toLowerCase();

  // Check cache
  if (!skipCache) {
    const cached = pubkeyCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return { data: cached, cached: true };
    }
  }

  try {
    const url = `https://${domain}/.well-known/jacs-pubkey.json`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { error: `HTTP ${response.status} from ${domain}` };
    }

    const data = (await response.json()) as {
      publicKey?: string;
      algorithm?: string;
      agentId?: string;
      publicKeyHash?: string;
    };

    if (!data.publicKey) {
      return { error: `Missing publicKey in response from ${domain}` };
    }

    const keyInfo: CachedKey = {
      key: data.publicKey,
      algorithm: data.algorithm || "unknown",
      agentId: data.agentId,
      publicKeyHash: data.publicKeyHash,
      fetchedAt: Date.now(),
    };

    pubkeyCache.set(cacheKey, keyInfo);
    return { data: keyInfo, cached: false };
  } catch (err: any) {
    if (err.name === "TimeoutError") {
      return { error: `Timeout fetching from ${domain}` };
    }
    return { error: err.message };
  }
}

/**
 * Extract signer domain from a JACS document
 * Looks for jacsAgentDomain in the document or signature metadata
 */
function extractSignerDomain(doc: any): string | null {
  // Check document-level domain
  if (doc.jacsAgentDomain) return doc.jacsAgentDomain;

  // Check signature metadata
  if (doc.jacsSignature?.agentDomain) return doc.jacsSignature.agentDomain;

  return null;
}

/**
 * Register JACS tools with OpenClaw
 */
export function registerTools(api: OpenClawPluginAPI): void {
  // Tool: Sign a document
  api.registerTool({
    name: "jacs_sign",
    description:
      "Sign a document with JACS cryptographic provenance. Use this to create verifiable, tamper-proof documents that can be traced back to this agent.",
    parameters: {
      type: "object",
      properties: {
        document: {
          type: "object",
          description: "The document or data to sign (any JSON object)",
        },
      },
      required: ["document"],
    },
    handler: async (params: SignParams): Promise<ToolResult> => {
      const agent = getAgent(api);
      if (!agent) {
        return { error: "JACS not initialized. Run 'openclaw jacs init' first." };
      }

      try {
        const signed = agent.signRequest(params.document);
        const parsed = JSON.parse(signed);
        let verification_url: string | undefined;
        try {
          verification_url = generateVerifyLink(signed, "https://hai.ai");
        } catch {
          // Document too large for URL; omit link
        }
        return {
          result: verification_url != null ? { ...parsed, verification_url } : parsed,
        };
      } catch (err: any) {
        return { error: `Failed to sign: ${err.message}` };
      }
    },
  });

  // Tool: Get shareable verification link for a signed document
  api.registerTool({
    name: "jacs_verify_link",
    description:
      "Get a shareable verification URL for a signed JACS document. Recipients can open the link at https://hai.ai/jacs/verify to see signer and validity. Use after jacs_sign when sharing with humans. Fails if the document is too large for a URL (max ~1515 bytes).",
    parameters: {
      type: "object",
      properties: {
        document: {
          type: "object",
          description: "The signed JACS document (object or JSON string)",
        },
        baseUrl: {
          type: "string",
          description: "Base URL for the verifier (default https://hai.ai)",
        },
      },
      required: ["document"],
    },
    handler: async (params: {
      document: any;
      baseUrl?: string;
    }): Promise<ToolResult> => {
      try {
        const docStr =
          typeof params.document === "string"
            ? params.document
            : JSON.stringify(params.document);
        const url = generateVerifyLink(
          docStr,
          params.baseUrl ?? "https://hai.ai",
        );
        return { result: { verification_url: url } };
      } catch (err: any) {
        return {
          error: `Verification link failed (document may exceed URL size limit): ${err.message}`,
        };
      }
    },
  });

  // Tool: Verify a document
  api.registerTool({
    name: "jacs_verify",
    description:
      "Verify a JACS-signed document. Use this to check if a document was signed by a valid agent and has not been tampered with.",
    parameters: {
      type: "object",
      properties: {
        document: {
          type: "object",
          description: "The signed document to verify",
        },
      },
      required: ["document"],
    },
    handler: async (params: VerifyParams): Promise<ToolResult> => {
      const agent = getAgent(api);
      if (!agent) {
        return { error: "JACS not initialized. Run 'openclaw jacs init' first." };
      }

      try {
        const result = agent.verifyResponse(JSON.stringify(params.document));
        return { result };
      } catch (err: any) {
        return { error: `Verification failed: ${err.message}` };
      }
    },
  });

  // Tool: Create agreement
  api.registerTool({
    name: "jacs_create_agreement",
    description:
      "Create a multi-party agreement that requires signatures from multiple agents. Use this when multiple parties need to sign off on a decision or document.",
    parameters: {
      type: "object",
      properties: {
        document: {
          type: "object",
          description: "The document to create agreement on",
        },
        agentIds: {
          type: "array",
          items: { type: "string" },
          description: "List of agent IDs required to sign",
        },
        question: {
          type: "string",
          description: "The question or purpose of the agreement",
        },
        context: {
          type: "string",
          description: "Additional context for signers",
        },
      },
      required: ["document", "agentIds"],
    },
    handler: async (params: CreateAgreementParams): Promise<ToolResult> => {
      const agent = getAgent(api);
      if (!agent) {
        return { error: "JACS not initialized. Run 'openclaw jacs init' first." };
      }

      try {
        const result = await agent.createAgreement(
          JSON.stringify(params.document),
          params.agentIds,
          params.question,
          params.context
        );
        return { result: JSON.parse(result) };
      } catch (err: any) {
        return { error: `Failed to create agreement: ${err.message}` };
      }
    },
  });

  // Tool: Sign agreement
  api.registerTool({
    name: "jacs_sign_agreement",
    description:
      "Sign an existing agreement document. Use this when you need to add your signature to a multi-party agreement.",
    parameters: {
      type: "object",
      properties: {
        document: {
          type: "object",
          description: "The agreement document to sign",
        },
        agreementFieldname: {
          type: "string",
          description: "Name of the agreement field (optional)",
        },
      },
      required: ["document"],
    },
    handler: async (params: SignAgreementParams): Promise<ToolResult> => {
      const agent = getAgent(api);
      if (!agent) {
        return { error: "JACS not initialized. Run 'openclaw jacs init' first." };
      }

      try {
        const result = await agent.signAgreement(
          JSON.stringify(params.document),
          params.agreementFieldname
        );
        return { result: JSON.parse(result) };
      } catch (err: any) {
        return { error: `Failed to sign agreement: ${err.message}` };
      }
    },
  });

  // Tool: Check agreement status
  api.registerTool({
    name: "jacs_check_agreement",
    description:
      "Check the status of a multi-party agreement. Use this to see which parties have signed and which are still pending.",
    parameters: {
      type: "object",
      properties: {
        document: {
          type: "object",
          description: "The agreement document to check",
        },
        agreementFieldname: {
          type: "string",
          description: "Name of the agreement field (optional)",
        },
      },
      required: ["document"],
    },
    handler: async (params: CheckAgreementParams): Promise<ToolResult> => {
      const agent = getAgent(api);
      if (!agent) {
        return { error: "JACS not initialized. Run 'openclaw jacs init' first." };
      }

      try {
        const result = await agent.checkAgreement(
          JSON.stringify(params.document),
          params.agreementFieldname
        );
        return { result: JSON.parse(result) };
      } catch (err: any) {
        return { error: `Failed to check agreement: ${err.message}` };
      }
    },
  });

  // Tool: Hash content
  api.registerTool({
    name: "jacs_hash",
    description:
      "Create a cryptographic hash of content. Use this to create a unique fingerprint of data for verification purposes.",
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The content to hash",
        },
      },
      required: ["content"],
    },
    handler: async (params: HashParams): Promise<ToolResult> => {
      try {
        const hash = hashString(params.content);
        return { result: { hash, algorithm: "SHA-256" } };
      } catch (err: any) {
        return { error: `Failed to hash: ${err.message}` };
      }
    },
  });

  // Tool: Get agent identity
  api.registerTool({
    name: "jacs_identity",
    description:
      "Get the current agent's JACS identity information including trust level and verification claim. Use this to share your identity with other agents.",
    parameters: {
      type: "object",
      properties: {},
    },
    handler: async (): Promise<ToolResult> => {
      if (!api.runtime.jacs?.isInitialized()) {
        return { error: "JACS not initialized. Run 'openclaw jacs init' first." };
      }

      const config = api.config;
      const publicKey = api.runtime.jacs.getPublicKey();
      const publicKeyHash = publicKey ? hashString(publicKey) : undefined;

      // Determine trust level
      let haiRegistered = false;
      if (config.agentId && publicKeyHash) {
        try {
          const haiStatus = await checkHaiStatus(config.agentId);
          haiRegistered = haiStatus?.verified ?? false;
        } catch {
          // HAI.ai check failed, not registered
        }
      }

      // Check DNS verification
      let dnsVerified = false;
      if (config.agentDomain) {
        const dnsResult = await resolveDnsRecord(config.agentDomain);
        if (dnsResult && publicKeyHash) {
          const dnsHash = dnsResult.parsed.publicKeyHash;
          dnsVerified = dnsHash === publicKeyHash;
        }
      }

      const trustLevel = determineTrustLevel(
        !!config.agentDomain,
        dnsVerified,
        haiRegistered
      );

      return {
        result: {
          agentId: config.agentId,
          agentName: config.agentName,
          agentDescription: config.agentDescription,
          agentDomain: config.agentDomain,
          algorithm: config.keyAlgorithm,
          publicKeyHash,
          verificationClaim: config.verificationClaim || "unverified",
          trustLevel,
          haiRegistered,
          dnsVerified,
        },
      };
    },
  });

  // Tool: Fetch another agent's public key
  api.registerTool({
    name: "jacs_fetch_pubkey",
    description:
      "Fetch another agent's public key from their domain. Use this before verifying documents from other agents. Keys are fetched from https://<domain>/.well-known/jacs-pubkey.json",
    parameters: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "The domain of the agent whose public key to fetch (e.g., 'example.com')",
        },
        skipCache: {
          type: "boolean",
          description: "Force fetch even if key is cached (default: false)",
        },
      },
      required: ["domain"],
    },
    handler: async (params: FetchPubkeyParams): Promise<ToolResult> => {
      const domain = sanitizeDomain(params.domain);
      const cacheKey = domain.toLowerCase();

      // Check cache first
      if (!params.skipCache) {
        const cached = pubkeyCache.get(cacheKey);
        if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
          return {
            result: {
              domain,
              publicKey: cached.key,
              algorithm: cached.algorithm,
              cached: true,
              fetchedAt: new Date(cached.fetchedAt).toISOString(),
            },
          };
        }
      }

      try {
        const url = `https://${domain}/.well-known/jacs-pubkey.json`;
        const response = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(10000), // 10 second timeout
        });

        if (!response.ok) {
          return {
            error: `Failed to fetch public key from ${domain}: HTTP ${response.status}`,
          };
        }

        const data = (await response.json()) as {
          publicKey?: string;
          algorithm?: string;
          agentId?: string;
          agentName?: string;
        };

        if (!data.publicKey) {
          return { error: `Invalid response from ${domain}: missing publicKey field` };
        }

        // Cache the key
        pubkeyCache.set(cacheKey, {
          key: data.publicKey,
          algorithm: data.algorithm || "unknown",
          fetchedAt: Date.now(),
        });

        return {
          result: {
            domain,
            publicKey: data.publicKey,
            algorithm: data.algorithm || "unknown",
            agentId: data.agentId,
            agentName: data.agentName,
            cached: false,
            fetchedAt: new Date().toISOString(),
          },
        };
      } catch (err: any) {
        if (err.name === "TimeoutError") {
          return { error: `Timeout fetching public key from ${domain}` };
        }
        return { error: `Failed to fetch public key from ${domain}: ${err.message}` };
      }
    },
  });

  // Tool: Verify a document with a specific public key
  api.registerTool({
    name: "jacs_verify_with_key",
    description:
      "Verify a signed document using another agent's public key. Use jacs_fetch_pubkey first to get the key, then use this to verify documents from that agent.",
    parameters: {
      type: "object",
      properties: {
        document: {
          type: "object",
          description: "The signed document to verify",
        },
        publicKey: {
          type: "string",
          description: "The PEM-encoded public key of the signing agent",
        },
        algorithm: {
          type: "string",
          description: "The key algorithm (e.g., 'pq2025', 'ed25519'). Default: 'pq2025'",
        },
      },
      required: ["document", "publicKey"],
    },
    handler: async (params: VerifyWithKeyParams): Promise<ToolResult> => {
      try {
        const doc = params.document;
        const sig = doc.jacsSignature || doc.signature;

        if (!sig) {
          return { error: "Document does not contain a signature field (jacsSignature or signature)" };
        }

        // Get the actual signature string
        const signatureValue = typeof sig === "object" ? sig.signature : sig;
        if (!signatureValue) {
          return { error: "Could not extract signature value from document" };
        }

        // Determine algorithm from signature or parameter
        const algorithm = params.algorithm || sig.signingAlgorithm || "pq2025";

        // Convert public key to Buffer
        const publicKeyBuffer = Buffer.from(params.publicKey, "utf-8");

        // Build the data that was signed (document without signature fields)
        const docWithoutSig = { ...doc };
        delete docWithoutSig.jacsSignature;
        delete docWithoutSig.signature;
        delete docWithoutSig.jacsHash;
        const dataToVerify = JSON.stringify(docWithoutSig);

        // Use JACS verifyString to verify (static function)
        const isValid = verifyString(dataToVerify, signatureValue, publicKeyBuffer, algorithm);

        return {
          result: {
            valid: isValid,
            algorithm,
            agentId: sig.agentID || doc.jacsAgentId,
            agentVersion: sig.agentVersion,
            signedAt: sig.date,
            publicKeyHash: sig.publicKeyHash,
            documentId: doc.jacsId,
          },
        };
      } catch (err: any) {
        return { error: `Verification failed: ${err.message}` };
      }
    },
  });

  // Tool: Seamless verification with auto-fetch
  api.registerTool({
    name: "jacs_verify_auto",
    description:
      "Automatically verify a JACS-signed document by fetching the signer's public key. Supports trust level requirements: 'basic' (signature only), 'domain' (DNS verified), 'attested' (HAI.ai registered).",
    parameters: {
      type: "object",
      properties: {
        document: {
          type: "object",
          description: "The signed document to verify",
        },
        domain: {
          type: "string",
          description:
            "The domain of the signing agent (e.g., 'agent.example.com'). If not provided, will try to extract from document.",
        },
        verifyDns: {
          type: "boolean",
          description:
            "Also verify the public key hash against DNS TXT record (default: false). Provides stronger verification.",
        },
        requiredTrustLevel: {
          type: "string",
          enum: ["basic", "domain", "attested"],
          description:
            "Minimum trust level required for verification to pass. 'basic' = signature only, 'domain' = DNS verified, 'attested' = HAI.ai registered.",
        },
      },
      required: ["document"],
    },
    handler: async (params: VerifyAutoParams): Promise<ToolResult> => {
      const doc = params.document;
      const sig = doc.jacsSignature || doc.signature;

      if (!sig) {
        return { error: "Document does not contain a signature" };
      }

      // Determine domain
      let domain: string | null | undefined = params.domain;
      if (!domain) {
        domain = extractSignerDomain(doc);
      }

      if (!domain) {
        return {
          error:
            "Could not determine signer domain. Please provide the 'domain' parameter or ensure the document contains 'jacsAgentDomain'.",
        };
      }

      // Fetch public key
      const keyResult = await fetchPublicKey(domain);
      if ("error" in keyResult) {
        return { error: `Failed to fetch public key: ${keyResult.error}` };
      }

      const keyInfo = keyResult.data;
      let dnsVerified = false;
      let dnsError: string | undefined;

      // Optional DNS verification
      if (params.verifyDns) {
        const dnsResult = await resolveDnsRecord(domain);
        if (dnsResult) {
          const dnsHash = dnsResult.parsed.publicKeyHash;
          // Compare public key hash
          const localHash = hashString(keyInfo.key);
          if (dnsHash === localHash || dnsHash === keyInfo.publicKeyHash) {
            dnsVerified = true;
          } else {
            dnsError = "DNS public key hash does not match fetched key";
          }

          // Also verify agent ID if present
          if (dnsResult.parsed.jacsAgentId && sig.agentID) {
            if (dnsResult.parsed.jacsAgentId !== sig.agentID) {
              dnsError = "DNS agent ID does not match document signer";
            }
          }
        } else {
          dnsError = "DNS TXT record not found";
        }
      }

      // Get signature value
      const signatureValue = typeof sig === "object" ? sig.signature : sig;
      if (!signatureValue) {
        return { error: "Could not extract signature value" };
      }

      // Determine algorithm
      const algorithm = sig.signingAlgorithm || keyInfo.algorithm || "pq2025";

      // Build data to verify
      const docWithoutSig = { ...doc };
      delete docWithoutSig.jacsSignature;
      delete docWithoutSig.signature;
      delete docWithoutSig.jacsHash;
      const dataToVerify = JSON.stringify(docWithoutSig);

      try {
        const publicKeyBuffer = Buffer.from(keyInfo.key, "utf-8");
        const isValid = verifyString(dataToVerify, signatureValue, publicKeyBuffer, algorithm);

        // Check HAI.ai registration if required trust level is 'attested'
        let haiRegistered = false;
        let haiError: string | undefined;
        const agentId = sig.agentID || keyInfo.agentId;
        const publicKeyHash = keyInfo.publicKeyHash || hashString(keyInfo.key);

        if (params.requiredTrustLevel === "attested" || params.requiredTrustLevel === "domain") {
          // For attested, must check HAI.ai
          if (params.requiredTrustLevel === "attested" && agentId && publicKeyHash) {
            try {
              const haiResult = await verifyHaiRegistration(agentId, publicKeyHash);
              haiRegistered = haiResult.verified;
            } catch (err: any) {
              haiError = err.message;
            }
          }

          // For domain level, verifyDns must be true and pass
          if (params.requiredTrustLevel === "domain" && !params.verifyDns) {
            // Force DNS verification for domain trust level
            const dnsResult = await resolveDnsRecord(domain);
            if (dnsResult) {
              const dnsHash = dnsResult.parsed.publicKeyHash;
              const localHash = hashString(keyInfo.key);
              if (dnsHash === localHash || dnsHash === keyInfo.publicKeyHash) {
                dnsVerified = true;
              } else {
                dnsError = "DNS public key hash does not match fetched key";
              }
            } else {
              dnsError = "DNS TXT record not found";
            }
          }
        }

        // Determine actual trust level achieved
        const trustLevel = determineTrustLevel(!!domain, dnsVerified, haiRegistered);

        // Check if required trust level is met
        const trustOrder: TrustLevel[] = ["basic", "domain", "attested"];
        const requiredIndex = trustOrder.indexOf(params.requiredTrustLevel || "basic");
        const actualIndex = trustOrder.indexOf(trustLevel);
        const trustLevelMet = actualIndex >= requiredIndex;

        if (params.requiredTrustLevel && !trustLevelMet) {
          return {
            error: `Agent does not meet required trust level '${params.requiredTrustLevel}'. Actual: '${trustLevel}'`,
          };
        }

        return {
          result: {
            valid: isValid && trustLevelMet,
            domain,
            algorithm,
            agentId,
            agentVersion: sig.agentVersion,
            signedAt: sig.date,
            keyFromCache: keyResult.cached,
            dnsVerified: (params.verifyDns || params.requiredTrustLevel === "domain" || params.requiredTrustLevel === "attested") ? dnsVerified : undefined,
            dnsError: (params.verifyDns || params.requiredTrustLevel) ? dnsError : undefined,
            trustLevel,
            requiredTrustLevel: params.requiredTrustLevel,
            haiRegistered: params.requiredTrustLevel === "attested" ? haiRegistered : undefined,
            haiError: params.requiredTrustLevel === "attested" ? haiError : undefined,
            documentId: doc.jacsId,
          },
        };
      } catch (err: any) {
        return { error: `Signature verification failed: ${err.message}` };
      }
    },
  });

  // Tool: DNS lookup for agent verification
  api.registerTool({
    name: "jacs_dns_lookup",
    description:
      "Look up a JACS agent's DNS TXT record. This provides the public key hash published in DNS for additional verification. The DNS record is at _v1.agent.jacs.<domain>.",
    parameters: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "The domain to look up (e.g., 'agent.example.com')",
        },
      },
      required: ["domain"],
    },
    handler: async (params: DnsLookupParams): Promise<ToolResult> => {
      const domain = sanitizeDomain(params.domain);
      const owner = `_v1.agent.jacs.${domain}`;

      const result = await resolveDnsRecord(domain);

      if (!result) {
        return {
          result: {
            found: false,
            domain,
            owner,
            message: `No JACS DNS TXT record found at ${owner}`,
          },
        };
      }

      return {
        result: {
          found: true,
          domain,
          owner,
          rawTxt: result.txt,
          ...result.parsed,
        },
      };
    },
  });

  // Tool: Lookup agent info (combines DNS + well-known + HAI.ai)
  api.registerTool({
    name: "jacs_lookup_agent",
    description:
      "Look up complete information about a JACS agent by domain. Fetches the public key from /.well-known/jacs-pubkey.json, DNS TXT record, and HAI.ai attestation status.",
    parameters: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "The domain of the agent (e.g., 'agent.example.com')",
        },
      },
      required: ["domain"],
    },
    handler: async (params: LookupAgentParams): Promise<ToolResult> => {
      const domain = sanitizeDomain(params.domain);

      // Fetch public key and DNS in parallel
      const [keyResult, dnsResult] = await Promise.all([
        fetchPublicKey(domain, true), // skip cache for fresh lookup
        resolveDnsRecord(domain),
      ]);

      const result: any = {
        domain,
        wellKnown: null as any,
        dns: null as any,
        haiAttestation: null as any,
        verified: false,
        trustLevel: "basic" as TrustLevel,
      };

      // Process well-known result
      if ("error" in keyResult) {
        result.wellKnown = { error: keyResult.error };
      } else {
        result.wellKnown = {
          publicKey: keyResult.data.key.substring(0, 100) + "...", // truncate for display
          publicKeyHash: keyResult.data.publicKeyHash || hashString(keyResult.data.key),
          algorithm: keyResult.data.algorithm,
          agentId: keyResult.data.agentId,
        };
      }

      // Process DNS result
      let dnsVerified = false;
      if (dnsResult) {
        result.dns = {
          owner: `_v1.agent.jacs.${domain}`,
          agentId: dnsResult.parsed.jacsAgentId,
          publicKeyHash: dnsResult.parsed.publicKeyHash,
          algorithm: dnsResult.parsed.alg,
          encoding: dnsResult.parsed.enc,
        };

        // Verify DNS matches well-known
        if (result.wellKnown && !result.wellKnown.error) {
          const localHash = result.wellKnown.publicKeyHash;
          const dnsHash = dnsResult.parsed.publicKeyHash;
          dnsVerified = localHash === dnsHash;
          result.verified = dnsVerified;
          if (!result.verified) {
            result.verificationError = "Public key hash from well-known endpoint does not match DNS";
          }
        }
      } else {
        result.dns = { error: "No DNS TXT record found" };
      }

      // Check HAI.ai attestation if we have agent ID
      let haiRegistered = false;
      const agentId = result.wellKnown?.agentId || dnsResult?.parsed.jacsAgentId;
      const publicKeyHash = result.wellKnown?.publicKeyHash;

      if (agentId && publicKeyHash) {
        try {
          const haiStatus = await verifyHaiRegistration(agentId, publicKeyHash);
          result.haiAttestation = haiStatus;
          haiRegistered = haiStatus.verified;
        } catch (err: any) {
          result.haiAttestation = { error: err.message };
        }
      } else {
        result.haiAttestation = { error: "No agent ID available to check HAI.ai status" };
      }

      // Determine trust level
      result.trustLevel = determineTrustLevel(true, dnsVerified, haiRegistered);

      return { result };
    },
  });

  // Tool: Verify HAI.ai registration
  api.registerTool({
    name: "jacs_verify_hai_registration",
    description:
      "Verify that an agent is registered with HAI.ai. Returns verification status including when the agent was verified and the registration type.",
    parameters: {
      type: "object",
      properties: {
        agentId: {
          type: "string",
          description: "The JACS agent ID (UUID) to verify",
        },
        publicKeyHash: {
          type: "string",
          description: "The SHA-256 hash of the agent's public key (hex encoded). If not provided, will attempt to fetch from domain.",
        },
        domain: {
          type: "string",
          description: "Domain to fetch public key hash from if not provided directly",
        },
      },
      required: ["agentId"],
    },
    handler: async (params: VerifyHaiRegistrationParams): Promise<ToolResult> => {
      let publicKeyHash = params.publicKeyHash;

      // If no hash provided, try to fetch from domain
      if (!publicKeyHash && params.domain) {
        const keyResult = await fetchPublicKey(params.domain);
        if ("error" in keyResult) {
          return { error: `Could not fetch public key: ${keyResult.error}` };
        }
        publicKeyHash = keyResult.data.publicKeyHash || hashString(keyResult.data.key);
      }

      if (!publicKeyHash) {
        return { error: "Either publicKeyHash or domain must be provided" };
      }

      try {
        const result = await verifyHaiRegistration(params.agentId, publicKeyHash);
        return { result };
      } catch (err: any) {
        return { error: err.message };
      }
    },
  });

  // Tool: Get attestation status
  api.registerTool({
    name: "jacs_get_attestation",
    description:
      "Get the full attestation status for an agent, including trust level (basic, domain, attested), verification claim, and HAI.ai registration status.",
    parameters: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Domain of the agent to check attestation for",
        },
        agentId: {
          type: "string",
          description: "Agent ID to check (alternative to domain, for self-check)",
        },
      },
    },
    handler: async (params: GetAttestationParams): Promise<ToolResult> => {
      // If no params, check self
      if (!params.domain && !params.agentId) {
        if (!api.runtime.jacs?.isInitialized()) {
          return { error: "JACS not initialized and no domain/agentId provided" };
        }

        const config = api.config;
        const publicKey = api.runtime.jacs.getPublicKey();
        const publicKeyHash = publicKey ? hashString(publicKey) : undefined;

        let haiRegistration: HaiRegistration | null = null;
        if (config.agentId && publicKeyHash) {
          try {
            haiRegistration = await checkHaiStatus(config.agentId);
          } catch {
            // Not registered
          }
        }

        let dnsVerified = false;
        if (config.agentDomain) {
          const dnsResult = await resolveDnsRecord(config.agentDomain);
          if (dnsResult && publicKeyHash) {
            dnsVerified = dnsResult.parsed.publicKeyHash === publicKeyHash;
          }
        }

        const status: AttestationStatus = {
          agentId: config.agentId || "",
          trustLevel: determineTrustLevel(!!config.agentDomain, dnsVerified, haiRegistration?.verified ?? false),
          verificationClaim: config.verificationClaim || "unverified",
          domain: config.agentDomain,
          haiRegistration,
          dnsVerified,
          timestamp: new Date().toISOString(),
        };

        return { result: status };
      }

      // Check external agent by domain
      if (params.domain) {
        const domain = sanitizeDomain(params.domain);

        // Fetch key and DNS
        const [keyResult, dnsResult] = await Promise.all([
          fetchPublicKey(domain),
          resolveDnsRecord(domain),
        ]);

        if ("error" in keyResult) {
          return { error: `Could not fetch public key: ${keyResult.error}` };
        }

        const agentId = keyResult.data.agentId || dnsResult?.parsed.jacsAgentId;
        const publicKeyHash = keyResult.data.publicKeyHash || hashString(keyResult.data.key);

        if (!agentId) {
          return { error: "Could not determine agent ID from well-known or DNS" };
        }

        // Check DNS verification
        let dnsVerified = false;
        if (dnsResult) {
          dnsVerified = dnsResult.parsed.publicKeyHash === publicKeyHash;
        }

        // Check HAI.ai registration
        let haiRegistration: HaiRegistration | null = null;
        try {
          haiRegistration = await verifyHaiRegistration(agentId, publicKeyHash);
        } catch {
          // Not registered
        }

        const status: AttestationStatus = {
          agentId,
          trustLevel: determineTrustLevel(true, dnsVerified, haiRegistration?.verified ?? false),
          verificationClaim: haiRegistration?.verified ? "verified-hai.ai" : (dnsVerified ? "verified" : "unverified"),
          domain,
          haiRegistration,
          dnsVerified,
          timestamp: new Date().toISOString(),
        };

        return { result: status };
      }

      // Check by agent ID only
      if (params.agentId) {
        try {
          const haiRegistration = await checkHaiStatus(params.agentId);
          const status: AttestationStatus = {
            agentId: params.agentId,
            trustLevel: haiRegistration?.verified ? "attested" : "basic",
            verificationClaim: haiRegistration?.verified ? "verified-hai.ai" : "unverified",
            haiRegistration,
            timestamp: new Date().toISOString(),
          };
          return { result: status };
        } catch (err: any) {
          return { error: err.message };
        }
      }

      return { error: "Either domain or agentId must be provided" };
    },
  });

  // Tool: Set verification claim
  api.registerTool({
    name: "jacs_set_verification_claim",
    description:
      "Set the verification claim for this agent. Options: 'unverified' (basic), 'verified' (requires domain + DNS hash verification), 'verified-hai.ai' (requires HAI.ai registration). Claims can only be upgraded, never downgraded.",
    parameters: {
      type: "object",
      properties: {
        claim: {
          type: "string",
          enum: ["unverified", "verified", "verified-hai.ai"],
          description: "The verification claim level to set",
        },
      },
      required: ["claim"],
    },
    handler: async (params: SetVerificationClaimParams): Promise<ToolResult> => {
      if (!api.runtime.jacs?.isInitialized()) {
        return { error: "JACS not initialized. Run 'openclaw jacs init' first." };
      }

      const config = api.config;
      const currentClaim = config.verificationClaim || "unverified";

      // Check if downgrade
      if (!canUpgradeClaim(currentClaim, params.claim)) {
        return {
          error: `Cannot downgrade verification claim from '${currentClaim}' to '${params.claim}'`,
        };
      }

      // Validate requirements
      const publicKey = api.runtime.jacs.getPublicKey();
      const publicKeyHash = publicKey ? hashString(publicKey) : undefined;

      let dnsVerified = false;
      let dnsRecordFound = false;
      let dnsHash: string | undefined;
      if (config.agentDomain) {
        const dnsResult = await resolveDnsRecord(config.agentDomain);
        if (dnsResult) {
          dnsRecordFound = true;
          dnsHash = dnsResult.parsed.publicKeyHash;
          if (publicKeyHash && dnsHash) {
            dnsVerified = dnsHash === publicKeyHash;
          }
        }
      }

      let haiRegistered = false;
      let haiVerifiedAt: string | undefined;
      const shouldCheckHai = params.claim === "verified-hai.ai";
      if (config.agentId && shouldCheckHai) {
        try {
          const status = await checkHaiStatus(config.agentId);
          haiRegistered = status?.verified ?? false;
          haiVerifiedAt = status?.verified_at;
        } catch {
          // Not registered
        }
      }

      const proof = {
        domain: config.agentDomain,
        domainConfigured: !!config.agentDomain,
        dnsRecordFound,
        dnsVerified,
        dnsHash,
        publicKeyHash,
        haiChecked: shouldCheckHai,
        haiRegistered,
        haiVerifiedAt,
      };

      const validationError = validateClaimRequirements(
        params.claim,
        proof.domainConfigured,
        proof.dnsVerified,
        haiRegistered
      );

      if (validationError) {
        return {
          error:
            `${validationError} ` +
            `(domainConfigured=${proof.domainConfigured}, dnsVerified=${proof.dnsVerified}, haiRegistered=${proof.haiRegistered})`,
        };
      }

      // Update config
      api.updateConfig({ verificationClaim: params.claim });

      return {
        result: {
          previousClaim: currentClaim,
          newClaim: params.claim,
          proof,
          message: `Verification claim updated to '${params.claim}'`,
        },
      };
    },
  });

  // Tool: Security audit (read-only)
  api.registerTool({
    name: "jacs_audit",
    description:
      "Run a read-only JACS security audit and health checks. Returns risks, health_checks, summary, and overall_status. Does not modify state. Use this to check configuration, directories, keys, trust store, storage, and optionally re-verify recent documents.",
    parameters: {
      type: "object",
      properties: {
        configPath: {
          type: "string",
          description: "Optional path to jacs.config.json",
        },
        recentN: {
          type: "number",
          description: "Optional number of recent documents to re-verify",
        },
      },
    },
    handler: async (params: { configPath?: string; recentN?: number }): Promise<ToolResult> => {
      try {
        const result = await jacsAudit({
          configPath: params?.configPath,
          recentN: params?.recentN,
        });
        return { result };
      } catch (err: any) {
        return { error: `Audit failed: ${err.message}` };
      }
    },
  });

  // Register document type tools (agentstate, commitment, todo, conversation)
  registerDocumentTools(api);
}
