/**
 * JACS Agent Tools
 *
 * Tools that AI agents can use to sign and verify documents.
 */

import {
  hashString,
  JacsAgent,
  audit as jacsAudit,
  verifyStandalone,
} from "@hai.ai/jacs/simple";
import { generateVerifyLink, verifyString, EmailNotActiveError, RecipientNotFoundError, RateLimitedError } from "haisdk";
import * as dns from "dns";
import { promisify } from "util";
import type { OpenClawPluginAPI, TrustLevel, VerificationClaim, HaiRegistration, AttestationStatus } from "../index";
import {
  determineTrustLevel,
  canUpgradeClaim,
  validateClaimRequirements,
} from "./hai";
import { registerDocumentTools } from "./documents";
import { registerOpenClawTool } from "./openclaw";

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

export interface VerifyStandaloneParams {
  document: any;
  keyDirectory?: string;
  dataDirectory?: string;
}

export interface VerifyDnsParams {
  document: any;
  domain: string;
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

export interface HaiHelloParams {
  includeTest?: boolean;
}

export interface HaiRegisterParams {
  ownerEmail?: string;
  description?: string;
  domain?: string;
}

export interface HaiUsernameParams {
  username: string;
  agentId?: string;
}

export interface HaiDeleteUsernameParams {
  agentId?: string;
}

export interface HaiVerifyDocumentParams {
  document: any;
}

export interface HaiGetVerificationParams {
  agentId: string;
}

export interface HaiVerifyAgentDocumentParams {
  agentDocument: any;
  domain?: string;
  publicKey?: string;
}

export interface HaiFetchRemoteKeyParams {
  jacsId: string;
  version?: string;
}

export interface HaiVerifyAgentParams {
  agentDocument: any;
}

export interface HaiSendEmailParams {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  attachments?: Array<{ filename: string; contentType: string; dataBase64: string }>;
}

export interface HaiListMessagesParams {
  limit?: number;
  offset?: number;
  direction?: "inbound" | "outbound";
}

export interface HaiMessageIdParams {
  messageId: string;
}

export interface HaiSearchMessagesParams {
  query: string;
  limit?: number;
  offset?: number;
  direction?: "inbound" | "outbound";
  fromAddress?: string;
  toAddress?: string;
}

export interface HaiReplyParams {
  messageId: string;
  body: string;
  subjectOverride?: string;
}

export interface HaiFreeRunParams {
  transport?: "sse" | "ws";
}

export interface HaiDnsCertifiedRunParams {
  transport?: "sse" | "ws";
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}

export interface HaiSubmitResponseParams {
  jobId: string;
  message: string;
  metadata?: Record<string, any>;
  processingTimeMs?: number;
}

export interface HaiBenchmarkParams {
  name?: string;
  tier?: "free" | "dns_certified" | "fully_certified";
}

/**
 * Get the JACS agent instance from the API runtime
 */
function getAgent(api: OpenClawPluginAPI): JacsAgent | null {
  return api.runtime.jacs?.getAgent() || null;
}

async function getHaiClientOrError(
  api: OpenClawPluginAPI
): Promise<{ client: NonNullable<Awaited<ReturnType<NonNullable<OpenClawPluginAPI["runtime"]["jacs"]>["getHaiClient"]>>> } | { error: string }> {
  try {
    const client = await api.runtime.jacs?.getHaiClient();
    if (!client) {
      return { error: "HaiClient not available. JACS must be initialized first." };
    }
    return { client };
  } catch (err: any) {
    return { error: `HaiClient unavailable: ${err?.message || String(err)}` };
  }
}

function resolveAgentId(api: OpenClawPluginAPI, explicitAgentId?: string): string | null {
  return explicitAgentId || api.config.agentId || api.runtime.jacs?.getAgentId() || null;
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
    // Canonical JACS DNS field is "jac_public_key_hash"; aliases kept for compatibility.
    publicKeyHash: result["jac_public_key_hash"] || result["pkh"] || result["publicKeyHash"],
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
  const withHaiClient = async (
    operation: (
      client: NonNullable<Awaited<ReturnType<NonNullable<OpenClawPluginAPI["runtime"]["jacs"]>["getHaiClient"]>>>
    ) => Promise<any>
  ): Promise<ToolResult> => {
    const haiClientResult = await getHaiClientOrError(api);
    if ("error" in haiClientResult) {
      return { error: haiClientResult.error };
    }

    try {
      const result = await operation(haiClientResult.client);
      return { result };
    } catch (err: any) {
      if (err instanceof EmailNotActiveError) {
        return { error: "Email not active — claim a username first" };
      }
      if (err instanceof RecipientNotFoundError) {
        return { error: "Recipient not found — check the email address" };
      }
      if (err instanceof RateLimitedError) {
        return { error: "Rate limited — too many emails sent, try again later" };
      }
      return { error: err?.message || String(err) };
    }
  };

  // Tool: Sign a document
  registerOpenClawTool(api, {
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
  registerOpenClawTool(api, {
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
  registerOpenClawTool(api, {
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

  // Tool: Standalone verification (no agent required)
  registerOpenClawTool(api, {
    name: "jacs_verify_standalone",
    description:
      "Verify a JACS-signed document WITHOUT requiring JACS to be initialized. Use this when you receive a signed document from another agent and want to check its authenticity without setting up your own JACS agent. Returns signer ID, validity, and timestamp.",
    parameters: {
      type: "object",
      properties: {
        document: {
          type: "object",
          description: "The signed JACS document to verify (object or JSON string)",
        },
        keyDirectory: {
          type: "string",
          description: "Optional directory containing public keys for verification",
        },
        dataDirectory: {
          type: "string",
          description: "Optional data directory for key resolution",
        },
      },
      required: ["document"],
    },
    handler: async (params: VerifyStandaloneParams): Promise<ToolResult> => {
      try {
        const docStr =
          typeof params.document === "string"
            ? params.document
            : JSON.stringify(params.document);
        const result = verifyStandalone(docStr, {
          keyResolution: "local",
          dataDirectory: params.dataDirectory,
          keyDirectory: params.keyDirectory,
        });
        return { result };
      } catch (err: any) {
        return { error: `Standalone verification failed: ${err.message}` };
      }
    },
  });

  // Tool: DNS-based agent verification
  registerOpenClawTool(api, {
    name: "jacs_verify_dns",
    description:
      "Verify an agent's identity by checking its public key hash against a DNS TXT record at _v1.agent.jacs.{domain}. Supports canonical JACS field jac_public_key_hash (plus legacy aliases). Use this for domain-level trust verification — proves the agent is endorsed by the domain owner.",
    parameters: {
      type: "object",
      properties: {
        document: {
          type: "object",
          description: "The agent document to verify",
        },
        domain: {
          type: "string",
          description: "The domain to check DNS TXT record for (e.g. 'example.com')",
        },
      },
      required: ["document", "domain"],
    },
    handler: async (params: VerifyDnsParams): Promise<ToolResult> => {
      try {
        const domain = sanitizeDomain(params.domain);
        const recordName = `_v1.agent.jacs.${domain}`;

        // Resolve DNS TXT record
        let records: string[][];
        try {
          records = await resolveTxt(recordName);
        } catch {
          return {
            result: {
              verified: false,
              domain,
              message: `No DNS TXT record found at ${recordName}`,
            },
          };
        }

        // Parse canonical JACS TXT format (and accept legacy aliases)
        const flat = records.map((r) => r.join("")).join("");
        const parsed = parseDnsTxt(flat);
        const dnsHash = parsed.publicKeyHash;
        if (!dnsHash) {
          return {
            result: {
              verified: false,
              domain,
              message:
                "DNS TXT record found but missing public key hash (expected jac_public_key_hash)",
            },
          };
        }

        // Extract public key hash from the document
        const doc = typeof params.document === "object" ? params.document : JSON.parse(params.document);
        const sig = doc.jacsSignature;
        const docHash = sig?.publicKeyHash;

        if (!docHash) {
          return {
            result: {
              verified: false,
              domain,
              message: "Document does not contain jacsSignature.publicKeyHash",
            },
          };
        }

        const verified = dnsHash === docHash;
        return {
          result: {
            verified,
            domain,
            documentHash: docHash,
            dnsHash,
            agentId: sig?.agentID,
            message: verified
              ? `Agent public key hash matches DNS record at ${recordName}`
              : `Hash mismatch: document=${docHash}, dns=${dnsHash}`,
          },
        };
      } catch (err: any) {
        return { error: `DNS verification failed: ${err.message}` };
      }
    },
  });

  // Tool: Create agreement
  registerOpenClawTool(api, {
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
  registerOpenClawTool(api, {
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
  registerOpenClawTool(api, {
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
  registerOpenClawTool(api, {
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
  registerOpenClawTool(api, {
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

      // Determine trust level via HaiClient
      let haiRegistered = false;
      if (config.agentId) {
        try {
          const haiClient = await api.runtime.jacs?.getHaiClient();
          if (haiClient) {
            const haiResult = await haiClient.verify();
            haiRegistered = haiResult.registered;
          }
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
  registerOpenClawTool(api, {
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
  registerOpenClawTool(api, {
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

        // Build the data that was signed (document without signature fields)
        const docWithoutSig = { ...doc };
        delete docWithoutSig.jacsSignature;
        delete docWithoutSig.signature;
        delete docWithoutSig.jacsHash;
        const dataToVerify = JSON.stringify(docWithoutSig);

        // Use haisdk Ed25519 verifyString (publicKeyPem, message, signatureB64)
        const isValid = verifyString(params.publicKey, dataToVerify, signatureValue);

        return {
          result: {
            valid: isValid,
            algorithm: params.algorithm || sig.signingAlgorithm || "ed25519",
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
  registerOpenClawTool(api, {
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

      // Build data to verify
      const docWithoutSig = { ...doc };
      delete docWithoutSig.jacsSignature;
      delete docWithoutSig.signature;
      delete docWithoutSig.jacsHash;
      const dataToVerify = JSON.stringify(docWithoutSig);

      try {
        // Use haisdk Ed25519 verifyString (publicKeyPem, message, signatureB64)
        const isValid = verifyString(keyInfo.key, dataToVerify, signatureValue);
        const algorithm = sig.signingAlgorithm || keyInfo.algorithm || "ed25519";

        // Check HAI.ai registration if required trust level is 'attested'
        let haiRegistered = false;
        let haiError: string | undefined;
        const agentId = sig.agentID || keyInfo.agentId;
        const publicKeyHash = keyInfo.publicKeyHash || hashString(keyInfo.key);

        if (params.requiredTrustLevel === "attested" || params.requiredTrustLevel === "domain") {
          // For attested, must check HAI.ai via HaiClient
          if (params.requiredTrustLevel === "attested" && agentId) {
            try {
              const haiClient = await api.runtime.jacs?.getHaiClient();
              if (haiClient) {
                const haiResult = await haiClient.getAgentAttestation(agentId);
                haiRegistered = haiResult.registered;
              } else {
                haiError = "HaiClient not available - JACS must be initialized for attested verification";
              }
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
  registerOpenClawTool(api, {
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
  registerOpenClawTool(api, {
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

      if (agentId) {
        try {
          const haiClient = await api.runtime.jacs?.getHaiClient();
          if (haiClient) {
            const haiStatus = await haiClient.getAgentAttestation(agentId);
            result.haiAttestation = haiStatus;
            haiRegistered = haiStatus.registered;
          } else {
            result.haiAttestation = { error: "HaiClient not available" };
          }
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
  registerOpenClawTool(api, {
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
      try {
        const haiClient = await api.runtime.jacs?.getHaiClient();
        if (!haiClient) {
          return { error: "HaiClient not available. JACS must be initialized first." };
        }
        const result = await haiClient.getAgentAttestation(params.agentId);
        return { result };
      } catch (err: any) {
        return { error: err.message };
      }
    },
  });

  // Tool: Get attestation status
  registerOpenClawTool(api, {
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
      const haiClient = await api.runtime.jacs?.getHaiClient();

      // If no params, check self
      if (!params.domain && !params.agentId) {
        if (!api.runtime.jacs?.isInitialized()) {
          return { error: "JACS not initialized and no domain/agentId provided" };
        }

        const config = api.config;
        const publicKey = api.runtime.jacs.getPublicKey();
        const publicKeyHash = publicKey ? hashString(publicKey) : undefined;

        let haiRegistered = false;
        let haiRegistration: HaiRegistration | null = null;
        if (config.agentId && haiClient) {
          try {
            const haiResult = await haiClient.verify();
            haiRegistered = haiResult.registered;
            if (haiRegistered) {
              haiRegistration = {
                verified: true,
                verified_at: haiResult.registeredAt,
                registration_type: "agent",
                agent_id: haiResult.jacsId,
                public_key_hash: publicKeyHash || "",
              };
            }
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
          trustLevel: determineTrustLevel(!!config.agentDomain, dnsVerified, haiRegistered),
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

        // Check HAI.ai registration via HaiClient
        let haiRegistered = false;
        let haiRegistration: HaiRegistration | null = null;
        if (haiClient) {
          try {
            const haiResult = await haiClient.getAgentAttestation(agentId);
            haiRegistered = haiResult.registered;
            if (haiRegistered) {
              haiRegistration = {
                verified: true,
                verified_at: haiResult.registeredAt,
                registration_type: "agent",
                agent_id: haiResult.jacsId,
                public_key_hash: publicKeyHash,
              };
            }
          } catch {
            // Not registered
          }
        }

        const status: AttestationStatus = {
          agentId,
          trustLevel: determineTrustLevel(true, dnsVerified, haiRegistered),
          verificationClaim: haiRegistered ? "verified-hai.ai" : (dnsVerified ? "verified" : "unverified"),
          domain,
          haiRegistration,
          dnsVerified,
          timestamp: new Date().toISOString(),
        };

        return { result: status };
      }

      // Check by agent ID only
      if (params.agentId) {
        if (!haiClient) {
          return { error: "HaiClient not available. JACS must be initialized first." };
        }
        try {
          const haiResult = await haiClient.getAgentAttestation(params.agentId);
          const status: AttestationStatus = {
            agentId: params.agentId,
            trustLevel: haiResult.registered ? "attested" : "basic",
            verificationClaim: haiResult.registered ? "verified-hai.ai" : "unverified",
            haiRegistration: haiResult.registered ? {
              verified: true,
              verified_at: haiResult.registeredAt,
              registration_type: "agent",
              agent_id: haiResult.jacsId,
              public_key_hash: "",
            } : null,
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
  registerOpenClawTool(api, {
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
          const haiClient = await api.runtime.jacs?.getHaiClient();
          if (haiClient) {
            const haiResult = await haiClient.verify();
            haiRegistered = haiResult.registered;
            haiVerifiedAt = haiResult.registeredAt;
          }
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

  // Tool: HAI hello endpoint
  registerOpenClawTool(api, {
    name: "jacs_hai_hello",
    description:
      "Call HAI hello endpoint with JACS auth to validate connectivity and auth handshake.",
    parameters: {
      type: "object",
      properties: {
        includeTest: {
          type: "boolean",
          description: "Request test scenario preview data in the hello response",
        },
      },
    },
    handler: async (params: HaiHelloParams): Promise<ToolResult> => {
      return withHaiClient((haiClient) => haiClient.hello(params.includeTest ?? false));
    },
  });

  // Tool: HAI connectivity check
  registerOpenClawTool(api, {
    name: "jacs_hai_test_connection",
    description:
      "Test basic connectivity to HAI health endpoints without modifying state.",
    parameters: {
      type: "object",
      properties: {},
    },
    handler: async (): Promise<ToolResult> => {
      return withHaiClient(async (haiClient) => ({ connected: await haiClient.testConnection() }));
    },
  });

  // Tool: Register this agent with HAI
  registerOpenClawTool(api, {
    name: "jacs_hai_register",
    description:
      "Register this agent with HAI using the loaded HaiClient identity and optional metadata.",
    parameters: {
      type: "object",
      properties: {
        ownerEmail: {
          type: "string",
          description: "Optional owner email used by HAI registration flows",
        },
        description: {
          type: "string",
          description: "Agent description to publish",
        },
        domain: {
          type: "string",
          description: "Agent domain to associate during registration",
        },
      },
    },
    handler: async (params: HaiRegisterParams): Promise<ToolResult> => {
      return withHaiClient((haiClient) =>
        haiClient.register({
          ownerEmail: params.ownerEmail,
          description: params.description,
          domain: params.domain,
        })
      );
    },
  });

  // Tool: Check username availability
  registerOpenClawTool(api, {
    name: "jacs_hai_check_username",
    description:
      "Check whether a username is available at HAI before claiming it.",
    parameters: {
      type: "object",
      properties: {
        username: {
          type: "string",
          description: "Requested username",
        },
      },
      required: ["username"],
    },
    handler: async (params: HaiUsernameParams): Promise<ToolResult> => {
      return withHaiClient((haiClient) => haiClient.checkUsername(params.username));
    },
  });

  // Tool: Claim username
  registerOpenClawTool(api, {
    name: "jacs_hai_claim_username",
    description:
      "Claim a HAI username for an agent ID (defaults to this agent if omitted).",
    parameters: {
      type: "object",
      properties: {
        username: {
          type: "string",
          description: "Username to claim",
        },
        agentId: {
          type: "string",
          description: "Agent ID to claim for (defaults to current agent)",
        },
      },
      required: ["username"],
    },
    handler: async (params: HaiUsernameParams): Promise<ToolResult> => {
      const agentId = resolveAgentId(api, params.agentId);
      if (!agentId) {
        return { error: "Agent ID is required. Initialize JACS or pass agentId explicitly." };
      }
      return withHaiClient((haiClient) => haiClient.claimUsername(agentId, params.username));
    },
  });

  // Tool: Update username
  registerOpenClawTool(api, {
    name: "jacs_hai_update_username",
    description:
      "Rename an existing HAI username for an agent ID (defaults to this agent).",
    parameters: {
      type: "object",
      properties: {
        username: {
          type: "string",
          description: "New username",
        },
        agentId: {
          type: "string",
          description: "Agent ID to update (defaults to current agent)",
        },
      },
      required: ["username"],
    },
    handler: async (params: HaiUsernameParams): Promise<ToolResult> => {
      const agentId = resolveAgentId(api, params.agentId);
      if (!agentId) {
        return { error: "Agent ID is required. Initialize JACS or pass agentId explicitly." };
      }
      return withHaiClient((haiClient) => haiClient.updateUsername(agentId, params.username));
    },
  });

  // Tool: Delete username
  registerOpenClawTool(api, {
    name: "jacs_hai_delete_username",
    description:
      "Release the claimed HAI username for an agent ID (defaults to this agent).",
    parameters: {
      type: "object",
      properties: {
        agentId: {
          type: "string",
          description: "Agent ID whose username should be released",
        },
      },
    },
    handler: async (params: HaiDeleteUsernameParams): Promise<ToolResult> => {
      const agentId = resolveAgentId(api, params.agentId);
      if (!agentId) {
        return { error: "Agent ID is required. Initialize JACS or pass agentId explicitly." };
      }
      return withHaiClient((haiClient) => haiClient.deleteUsername(agentId));
    },
  });

  // Tool: HAI document verification
  registerOpenClawTool(api, {
    name: "jacs_hai_verify_document",
    description:
      "Verify a signed JACS document through HAI's public document verification endpoint.",
    parameters: {
      type: "object",
      properties: {
        document: {
          type: "object",
          description: "Signed JACS document object or JSON string",
        },
      },
      required: ["document"],
    },
    handler: async (params: HaiVerifyDocumentParams): Promise<ToolResult> => {
      return withHaiClient((haiClient) => haiClient.verifyDocument(params.document));
    },
  });

  // Tool: HAI advanced verification by agent ID
  registerOpenClawTool(api, {
    name: "jacs_hai_get_verification",
    description:
      "Get HAI advanced verification status for an agent ID (JACS validity, DNS, registration badge).",
    parameters: {
      type: "object",
      properties: {
        agentId: {
          type: "string",
          description: "Agent ID to verify",
        },
      },
      required: ["agentId"],
    },
    handler: async (params: HaiGetVerificationParams): Promise<ToolResult> => {
      return withHaiClient((haiClient) => haiClient.getVerification(params.agentId));
    },
  });

  // Tool: HAI advanced verification by agent document
  registerOpenClawTool(api, {
    name: "jacs_hai_verify_agent_document",
    description:
      "Verify an agent document using HAI advanced verification endpoint.",
    parameters: {
      type: "object",
      properties: {
        agentDocument: {
          type: "object",
          description: "Agent document object or JSON string",
        },
        domain: {
          type: "string",
          description: "Optional domain hint for advanced verification",
        },
        publicKey: {
          type: "string",
          description: "Optional PEM public key override",
        },
      },
      required: ["agentDocument"],
    },
    handler: async (params: HaiVerifyAgentDocumentParams): Promise<ToolResult> => {
      return withHaiClient((haiClient) =>
        haiClient.verifyAgentDocumentOnHai(params.agentDocument, {
          domain: params.domain,
          publicKey: params.publicKey,
        })
      );
    },
  });

  // Tool: Fetch remote key from HAI key registry
  registerOpenClawTool(api, {
    name: "jacs_hai_fetch_remote_key",
    description:
      "Fetch another agent's public key from HAI key registry.",
    parameters: {
      type: "object",
      properties: {
        jacsId: {
          type: "string",
          description: "Agent JACS ID",
        },
        version: {
          type: "string",
          description: "Key version (default: latest)",
        },
      },
      required: ["jacsId"],
    },
    handler: async (params: HaiFetchRemoteKeyParams): Promise<ToolResult> => {
      return withHaiClient((haiClient) => haiClient.fetchRemoteKey(params.jacsId, params.version || "latest"));
    },
  });

  // Tool: Verify agent document locally + HAI attestation
  registerOpenClawTool(api, {
    name: "jacs_hai_verify_agent",
    description:
      "Run multi-level agent verification (signature + DNS + HAI registration) using HaiClient.verifyAgent.",
    parameters: {
      type: "object",
      properties: {
        agentDocument: {
          type: "object",
          description: "Agent document object or JSON string",
        },
      },
      required: ["agentDocument"],
    },
    handler: async (params: HaiVerifyAgentParams): Promise<ToolResult> => {
      return withHaiClient((haiClient) => haiClient.verifyAgent(params.agentDocument));
    },
  });

  // Tool: Send HAI email
  registerOpenClawTool(api, {
    name: "jacs_hai_send_email",
    description:
      "Send an email from this agent's HAI mailbox. Supports file attachments via base64-encoded data.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject" },
        body: { type: "string", description: "Email body text" },
        inReplyTo: { type: "string", description: "Optional message ID being replied to" },
        attachments: {
          type: "array",
          description: "File attachments to include with the email",
          items: {
            type: "object",
            properties: {
              filename: { type: "string", description: "Attachment file name" },
              contentType: { type: "string", description: "MIME content type (e.g. application/pdf)" },
              dataBase64: { type: "string", description: "Base64-encoded file data" },
            },
            required: ["filename", "contentType", "dataBase64"],
          },
        },
      },
      required: ["to", "subject", "body"],
    },
    handler: async (params: HaiSendEmailParams): Promise<ToolResult> => {
      const attachments = params.attachments?.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        data: Buffer.from(a.dataBase64, "base64"),
      }));
      return withHaiClient((haiClient) => haiClient.sendEmail({
        to: params.to,
        subject: params.subject,
        body: params.body,
        inReplyTo: params.inReplyTo,
        attachments,
      }));
    },
  });

  // Tool: List HAI messages
  registerOpenClawTool(api, {
    name: "jacs_hai_list_messages",
    description:
      "List HAI email messages for this agent, optionally filtered by direction and pagination.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Maximum number of messages" },
        offset: { type: "number", description: "Pagination offset" },
        direction: { type: "string", enum: ["inbound", "outbound"] },
      },
    },
    handler: async (params: HaiListMessagesParams): Promise<ToolResult> => {
      return withHaiClient((haiClient) => haiClient.listMessages({
        limit: params.limit,
        offset: params.offset,
        direction: params.direction,
      }));
    },
  });

  // Tool: Get HAI message
  registerOpenClawTool(api, {
    name: "jacs_hai_get_message",
    description:
      "Fetch one HAI email message by ID.",
    parameters: {
      type: "object",
      properties: {
        messageId: { type: "string", description: "Message ID to fetch" },
      },
      required: ["messageId"],
    },
    handler: async (params: HaiMessageIdParams): Promise<ToolResult> => {
      return withHaiClient((haiClient) => haiClient.getMessage(params.messageId));
    },
  });

  // Tool: Mark HAI message as read
  registerOpenClawTool(api, {
    name: "jacs_hai_mark_message_read",
    description:
      "Mark a HAI email message as read.",
    parameters: {
      type: "object",
      properties: {
        messageId: { type: "string", description: "Message ID to mark as read" },
      },
      required: ["messageId"],
    },
    handler: async (params: HaiMessageIdParams): Promise<ToolResult> => {
      return withHaiClient(async (haiClient) => {
        await haiClient.markRead(params.messageId);
        return { ok: true, messageId: params.messageId, status: "read" };
      });
    },
  });

  // Tool: Mark HAI message as unread
  registerOpenClawTool(api, {
    name: "jacs_hai_mark_message_unread",
    description:
      "Mark a HAI email message as unread.",
    parameters: {
      type: "object",
      properties: {
        messageId: { type: "string", description: "Message ID to mark as unread" },
      },
      required: ["messageId"],
    },
    handler: async (params: HaiMessageIdParams): Promise<ToolResult> => {
      return withHaiClient(async (haiClient) => {
        await haiClient.markUnread(params.messageId);
        return { ok: true, messageId: params.messageId, status: "unread" };
      });
    },
  });

  // Tool: Delete HAI message
  registerOpenClawTool(api, {
    name: "jacs_hai_delete_message",
    description:
      "Delete a HAI email message by ID.",
    parameters: {
      type: "object",
      properties: {
        messageId: { type: "string", description: "Message ID to delete" },
      },
      required: ["messageId"],
    },
    handler: async (params: HaiMessageIdParams): Promise<ToolResult> => {
      return withHaiClient(async (haiClient) => {
        await haiClient.deleteMessage(params.messageId);
        return { ok: true, messageId: params.messageId, status: "deleted" };
      });
    },
  });

  // Tool: Search HAI messages
  registerOpenClawTool(api, {
    name: "jacs_hai_search_messages",
    description:
      "Search this agent's HAI mailbox with optional sender/recipient filters.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query string" },
        limit: { type: "number", description: "Maximum results" },
        offset: { type: "number", description: "Pagination offset" },
        direction: { type: "string", enum: ["inbound", "outbound"] },
        fromAddress: { type: "string", description: "Filter by sender address" },
        toAddress: { type: "string", description: "Filter by recipient address" },
      },
      required: ["query"],
    },
    handler: async (params: HaiSearchMessagesParams): Promise<ToolResult> => {
      return withHaiClient((haiClient) =>
        haiClient.searchMessages({
          query: params.query,
          limit: params.limit,
          offset: params.offset,
          direction: params.direction,
          fromAddress: params.fromAddress,
          toAddress: params.toAddress,
        })
      );
    },
  });

  // Tool: unread count
  registerOpenClawTool(api, {
    name: "jacs_hai_get_unread_count",
    description:
      "Get the current unread email count for this agent mailbox.",
    parameters: {
      type: "object",
      properties: {},
    },
    handler: async (): Promise<ToolResult> => {
      return withHaiClient(async (haiClient) => ({ count: await haiClient.getUnreadCount() }));
    },
  });

  // Tool: reply
  registerOpenClawTool(api, {
    name: "jacs_hai_reply",
    description:
      "Reply to an existing HAI email message ID with optional subject override.",
    parameters: {
      type: "object",
      properties: {
        messageId: { type: "string", description: "Message ID to reply to" },
        body: { type: "string", description: "Reply body text" },
        subjectOverride: { type: "string", description: "Optional replacement subject line" },
      },
      required: ["messageId", "body"],
    },
    handler: async (params: HaiReplyParams): Promise<ToolResult> => {
      return withHaiClient((haiClient) =>
        haiClient.reply(params.messageId, params.body, params.subjectOverride)
      );
    },
  });

  // Tool: email status
  registerOpenClawTool(api, {
    name: "jacs_hai_get_email_status",
    description:
      "Get this agent mailbox status, limits, and usage from HAI.",
    parameters: {
      type: "object",
      properties: {},
    },
    handler: async (): Promise<ToolResult> => {
      return withHaiClient((haiClient) => haiClient.getEmailStatus());
    },
  });

  // Tool: free benchmark
  registerOpenClawTool(api, {
    name: "jacs_hai_free_chaotic_run",
    description:
      "Run the HAI free-chaotic benchmark tier and return transcript output.",
    parameters: {
      type: "object",
      properties: {
        transport: {
          type: "string",
          enum: ["sse", "ws"],
          description: "Transport used for benchmark orchestration (default: sse)",
        },
      },
    },
    handler: async (params: HaiFreeRunParams): Promise<ToolResult> => {
      return withHaiClient((haiClient) => haiClient.freeChaoticRun({
        transport: params.transport,
      }));
    },
  });

  // Tool: DNS-certified benchmark
  registerOpenClawTool(api, {
    name: "jacs_hai_dns_certified_run",
    description:
      "Start and run the HAI DNS-certified benchmark tier. Returns checkout URL when payment is pending.",
    parameters: {
      type: "object",
      properties: {
        transport: {
          type: "string",
          enum: ["sse", "ws"],
          description: "Transport used for benchmark orchestration (default: sse)",
        },
        pollIntervalMs: {
          type: "number",
          description: "Polling interval while waiting for payment completion",
        },
        pollTimeoutMs: {
          type: "number",
          description: "Max wait time for payment confirmation before returning pending state",
        },
      },
    },
    handler: async (params: HaiDnsCertifiedRunParams): Promise<ToolResult> => {
      let checkoutUrl: string | undefined;
      const result = await withHaiClient((haiClient) =>
        haiClient.dnsCertifiedRun({
          transport: params.transport,
          pollIntervalMs: params.pollIntervalMs,
          pollTimeoutMs: params.pollTimeoutMs,
          onCheckoutUrl: (url: string) => {
            checkoutUrl = url;
          },
        })
      );

      if (result.error && checkoutUrl) {
        return {
          result: {
            pendingPayment: true,
            checkoutUrl,
            message: result.error,
          },
        };
      }

      if (result.result && checkoutUrl && typeof result.result === "object") {
        return {
          result: {
            ...result.result,
            checkoutUrl,
          },
        };
      }

      return result;
    },
  });

  // Tool: submit benchmark job response
  registerOpenClawTool(api, {
    name: "jacs_hai_submit_response",
    description:
      "Submit a mediator response for a benchmark job/run ID.",
    parameters: {
      type: "object",
      properties: {
        jobId: { type: "string", description: "Benchmark job/run ID" },
        message: { type: "string", description: "Mediator response message" },
        metadata: { type: "object", description: "Optional metadata for the response" },
        processingTimeMs: { type: "number", description: "Optional processing duration in milliseconds" },
      },
      required: ["jobId", "message"],
    },
    handler: async (params: HaiSubmitResponseParams): Promise<ToolResult> => {
      return withHaiClient((haiClient) =>
        haiClient.submitResponse(params.jobId, params.message, {
          metadata: params.metadata,
          processingTimeMs: params.processingTimeMs,
        })
      );
    },
  });

  // Tool: legacy benchmark runner
  registerOpenClawTool(api, {
    name: "jacs_hai_benchmark_run",
    description:
      "Run the legacy benchmark endpoint by name and tier.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Benchmark name (default: mediation_basic)",
        },
        tier: {
          type: "string",
          enum: ["free", "dns_certified", "fully_certified"],
          description: "Benchmark tier (default: free)",
        },
      },
    },
    handler: async (params: HaiBenchmarkParams): Promise<ToolResult> => {
      return withHaiClient((haiClient) =>
        haiClient.benchmark(params.name || "mediation_basic", params.tier || "free")
      );
    },
  });

  // Tool: Security audit (read-only)
  registerOpenClawTool(api, {
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
