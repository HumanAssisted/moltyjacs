/**
 * JACS CLI Commands for OpenClaw
 *
 * Provides command-line interface for JACS operations.
 */

import { hashString } from "@hai.ai/jacs";
import * as fs from "fs";
import * as path from "path";
import type { OpenClawPluginAPI, TrustLevel, VerificationClaim } from "./index";
import { resolveDnsRecord, fetchPublicKey, parseDnsTxt } from "./tools";
import {
  determineTrustLevel,
  canUpgradeClaim,
  validateClaimRequirements,
} from "./tools/hai";

export interface CLIResult {
  text: string;
  data?: any;
  error?: string;
}

export interface CLICommand {
  description: string;
  args?: string[];
  handler: (args: any) => Promise<CLIResult>;
}

export interface CLICommands {
  [key: string]: CLICommand;
}

/**
 * Creates CLI commands for the JACS plugin
 */
export function cliCommands(api: OpenClawPluginAPI): CLICommands {
  const homeDir = api.runtime.homeDir;
  const jacsDir = path.join(homeDir, ".openclaw", "jacs");
  const keysDir = path.join(homeDir, ".openclaw", "jacs_keys");

  return {
    init: {
      description: "Initialize JACS with key generation",
      args: ["[--algorithm <algo>]", "[--name <name>]", "[--password <password>]"],
      handler: async (args: any) => {
        return api.invoke("jacs-init", args);
      },
    },

    status: {
      description: "Show JACS status and agent info",
      handler: async () => {
        const configPath = path.join(jacsDir, "jacs.config.json");

        if (!fs.existsSync(configPath)) {
          return {
            text: "JACS not initialized.\n\nRun 'openclaw jacs init' to set up.",
          };
        }

        const config = api.config;
        let jacsConfig: any = {};
        let configParseError: string | null = null;
        try {
          jacsConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        } catch (err: any) {
          configParseError = err.message;
        }

        const pubKeyPath = path.join(keysDir, "agent.public.pem");
        const publicKeyExists = fs.existsSync(pubKeyPath);
        const publicKeyHash = publicKeyExists
          ? hashString(fs.readFileSync(pubKeyPath, "utf-8"))
          : "N/A";

        const statusLines = [
          `JACS Status: Active`,
          ``,
          `Agent ID: ${config.agentId || jacsConfig.jacs_agent_id_and_version?.split(":")[0] || "Unknown"}`,
          `Algorithm: ${config.keyAlgorithm || jacsConfig.jacs_agent_key_algorithm || "Unknown"}`,
          `Name: ${config.agentName || "Not set"}`,
          `Description: ${config.agentDescription || "Not set"}`,
          `Domain: ${config.agentDomain || "Not set"}`,
          ``,
          `Keys:`,
          `  Public Key: ${publicKeyExists ? "Present" : "Missing"}`,
          `  Public Key Hash: ${publicKeyHash.substring(0, 32)}...`,
          `  Private Key: ${fs.existsSync(path.join(keysDir, "agent.private.pem.enc")) ? "Encrypted" : "Missing"}`,
          ``,
          `Config Path: ${configPath}`,
        ];

        if (configParseError) {
          statusLines.push(``, `Warning: Could not parse config file: ${configParseError}`);
        }

        return {
          text: statusLines.join("\n"),
          error: configParseError || undefined,
        };
      },
    },

    sign: {
      description: "Sign a document with JACS",
      args: ["<file>"],
      handler: async (args: any) => {
        const agent = api.runtime.jacs?.getAgent();
        if (!agent) {
          return { text: "JACS not initialized. Run 'openclaw jacs init' first." };
        }

        const filePath = args.file || args._?.[0];
        if (!filePath) {
          return { text: "Usage: openclaw jacs sign <file>", error: "Missing file argument" };
        }

        try {
          const content = fs.readFileSync(filePath, "utf-8");
          let document: any;

          try {
            document = JSON.parse(content);
          } catch {
            // If not JSON, wrap as text document
            document = { content, type: "text" };
          }

          const signed = agent.signRequest(document);
          const parsed = JSON.parse(signed);

          return {
            text: JSON.stringify(parsed, null, 2),
            data: parsed,
          };
        } catch (err: any) {
          return {
            text: `Failed to sign document: ${err.message}`,
            error: err.message,
          };
        }
      },
    },

    verify: {
      description: "Verify a JACS-signed document",
      args: ["<file>"],
      handler: async (args: any) => {
        const agent = api.runtime.jacs?.getAgent();
        if (!agent) {
          return { text: "JACS not initialized. Run 'openclaw jacs init' first." };
        }

        const filePath = args.file || args._?.[0];
        if (!filePath) {
          return { text: "Usage: openclaw jacs verify <file>", error: "Missing file argument" };
        }

        try {
          const content = fs.readFileSync(filePath, "utf-8");
          const result = agent.verifyResponse(content) as any;

          if (result.error) {
            return {
              text: `Verification failed: ${result.error}`,
              data: result,
              error: result.error,
            };
          }

          return {
            text: `Signature verified!

Signer: ${result.jacsId || "Unknown"}
Valid: Yes`,
            data: result,
          };
        } catch (err: any) {
          return {
            text: `Verification failed: ${err.message}`,
            error: err.message,
          };
        }
      },
    },

    hash: {
      description: "Hash a string using JACS",
      args: ["<string>"],
      handler: async (args: any) => {
        const input = args.string || args._?.join(" ");
        if (!input) {
          return { text: "Usage: openclaw jacs hash <string>", error: "Missing input" };
        }

        const hash = hashString(input);
        return {
          text: hash,
          data: { input, hash },
        };
      },
    },

    "dns-record": {
      description: "Generate DNS TXT record for agent discovery",
      args: ["<domain>"],
      handler: async (args: any) => {
        if (!api.runtime.jacs?.isInitialized()) {
          return { text: "JACS not initialized. Run 'openclaw jacs init' first." };
        }

        const domain = args.domain || args._?.[0];
        if (!domain) {
          return { text: "Usage: openclaw jacs dns-record <domain>", error: "Missing domain" };
        }

        try {
          const config = api.config;
          const pubKeyPath = path.join(keysDir, "agent.public.pem");

          if (!fs.existsSync(pubKeyPath)) {
            return { text: "Public key not found.", error: "Missing public key" };
          }

          const publicKey = fs.readFileSync(pubKeyPath, "utf-8");
          const publicKeyHash = hashString(publicKey);
          const agentId = config.agentId || "unknown";

          const txtRecord = `v=hai.ai; jacs_agent_id=${agentId}; alg=SHA-256; enc=hex; jac_public_key_hash=${publicKeyHash}`;
          const recordOwner = `_v1.agent.jacs.${domain}.`;

          return {
            text: `DNS TXT Record for ${domain}

Record Owner: ${recordOwner}
Record Type: TXT
TTL: 3600
Content:
  ${txtRecord}

Add this record to your DNS provider to enable agent discovery via DNSSEC.`,
            data: {
              owner: recordOwner,
              type: "TXT",
              ttl: 3600,
              content: txtRecord,
            },
          };
        } catch (err: any) {
          return {
            text: `Failed to generate DNS record: ${err.message}`,
            error: err.message,
          };
        }
      },
    },

    lookup: {
      description: "Look up another agent's public key and DNS info",
      args: ["<domain>"],
      handler: async (args: any) => {
        const domain = args.domain || args._?.[0];
        if (!domain) {
          return { text: "Usage: openclaw jacs lookup <domain>", error: "Missing domain" };
        }

        const results: string[] = [`Agent Lookup: ${domain}`, ""];

        // Fetch public key from well-known endpoint
        results.push("Public Key (/.well-known/jacs-pubkey.json):");
        const keyResult = await fetchPublicKey(domain, true); // skip cache for fresh lookup
        if ("error" in keyResult) {
          results.push(`  Error: ${keyResult.error}`);
        } else {
          const key = keyResult.data;
          results.push(`  Agent ID: ${key.agentId || "Not specified"}`);
          results.push(`  Algorithm: ${key.algorithm}`);
          results.push(`  Public Key Hash: ${key.publicKeyHash || "Not specified"}`);
          results.push(`  Public Key: ${key.key.substring(0, 60)}...`);
        }

        results.push("");

        // Resolve DNS TXT record
        results.push(`DNS TXT Record (_v1.agent.jacs.${domain}):`);
        const dnsResult = await resolveDnsRecord(domain);
        if (!dnsResult) {
          results.push("  No DNS TXT record found (or DNS resolution failed)");
        } else {
          const parsed = dnsResult.parsed;
          results.push(`  Version: ${parsed.v || "N/A"}`);
          results.push(`  Agent ID: ${parsed.jacsAgentId || "N/A"}`);
          results.push(`  Algorithm: ${parsed.alg || "N/A"}`);
          results.push(`  Encoding: ${parsed.enc || "N/A"}`);
          results.push(`  Public Key Hash: ${parsed.publicKeyHash || "N/A"}`);
          results.push(`  Raw TXT: ${dnsResult.txt}`);

          // Verify DNS hash matches well-known key hash
          if (!("error" in keyResult) && keyResult.data.publicKeyHash && parsed.publicKeyHash) {
            const matches = keyResult.data.publicKeyHash === parsed.publicKeyHash;
            results.push("");
            results.push(`DNS Verification: ${matches ? "PASSED" : "FAILED"} (well-known hash matches DNS hash)`);
          }
        }

        return {
          text: results.join("\n"),
          data: {
            domain,
            publicKey: "error" in keyResult ? null : keyResult.data,
            dns: dnsResult,
          },
        };
      },
    },

    register: {
      description: "Register this agent with HAI.ai for attested trust level",
      args: ["[--api-key <key>]", "[--preview]"],
      handler: async (args: any) => {
        if (!api.runtime.jacs?.isInitialized()) {
          return { text: "JACS not initialized. Run 'openclaw jacs init' first." };
        }

        const config = api.config;
        const preview = args.preview || args.p;

        // Get public key
        const pubKeyPath = path.join(keysDir, "agent.public.pem");
        if (!fs.existsSync(pubKeyPath)) {
          return { text: "Public key not found.", error: "Missing public key" };
        }

        const publicKey = fs.readFileSync(pubKeyPath, "utf-8");
        const publicKeyHash = hashString(publicKey);
        const agentId = config.agentId;

        if (!agentId) {
          return { text: "Agent ID not configured.", error: "Missing agent ID" };
        }

        if (preview) {
          return {
            text: `HAI.ai Registration Preview

Agent ID: ${agentId}
Name: ${config.agentName || "Not set"}
Public Key Hash: ${publicKeyHash.substring(0, 32)}...

To complete registration, run without --preview flag.
Requires HAI_API_KEY environment variable or --api-key argument.`,
            data: { agentId, agentName: config.agentName, publicKeyHash },
          };
        }

        try {
          const haiClient = await api.runtime.jacs?.getHaiClient();
          if (!haiClient) {
            return {
              text: "HaiClient not available. Ensure JACS is properly initialized with Ed25519 keys.",
              error: "HaiClient not available",
            };
          }

          const result = await haiClient.register({
            description: config.agentDescription,
            domain: config.agentDomain,
          });

          // Update config with verification claim
          api.updateConfig({ verificationClaim: "verified-hai.ai" });

          return {
            text: `HAI.ai Registration Successful!

Agent ID: ${result.agentId}
JACS ID: ${result.jacsId}
Registration ID: ${result.registrationId}
Registered At: ${result.registeredAt}

Your agent is now registered with HAI.ai and has 'attested' trust level.`,
            data: result,
          };
        } catch (err: any) {
          return {
            text: `Registration failed: ${err.message}`,
            error: err.message,
          };
        }
      },
    },

    attestation: {
      description: "Check attestation status for this agent or another agent",
      args: ["[domain]"],
      handler: async (args: any) => {
        const domain = args.domain || args._?.[0];

        if (!domain) {
          // Check own attestation
          if (!api.runtime.jacs?.isInitialized()) {
            return { text: "JACS not initialized. Run 'openclaw jacs init' first." };
          }

          const config = api.config;
          const pubKeyPath = path.join(keysDir, "agent.public.pem");
          const publicKey = fs.existsSync(pubKeyPath)
            ? fs.readFileSync(pubKeyPath, "utf-8")
            : null;
          const publicKeyHash = publicKey ? hashString(publicKey) : null;

          // Check DNS verification
          let dnsVerified = false;
          if (config.agentDomain) {
            const dnsResult = await resolveDnsRecord(config.agentDomain);
            if (dnsResult && publicKeyHash) {
              dnsVerified = dnsResult.parsed.publicKeyHash === publicKeyHash;
            }
          }

          // Check HAI.ai registration via HaiClient
          let haiRegistered = false;
          let haiStatus: any = null;
          if (config.agentId) {
            try {
              const haiClient = await api.runtime.jacs?.getHaiClient();
              if (haiClient) {
                haiStatus = await haiClient.verify();
                haiRegistered = haiStatus?.registered ?? false;
              }
            } catch {
              // Not registered
            }
          }

          const trustLevel = determineTrustLevel(
            !!config.agentDomain,
            dnsVerified,
            haiRegistered
          );

          const lines = [
            `Attestation Status for This Agent`,
            ``,
            `Agent ID: ${config.agentId || "Unknown"}`,
            `Trust Level: ${trustLevel.toUpperCase()}`,
            `Verification Claim: ${config.verificationClaim || "unverified"}`,
            ``,
            `Domain: ${config.agentDomain || "Not configured"}`,
            `DNS Verified: ${config.agentDomain ? (dnsVerified ? "Yes" : "No") : "N/A"}`,
            `HAI.ai Registered: ${haiRegistered ? "Yes" : "No"}`,
          ];

          if (haiStatus?.registeredAt) {
            lines.push(`HAI.ai Registered At: ${haiStatus.registeredAt}`);
          }

          return {
            text: lines.join("\n"),
            data: {
              agentId: config.agentId,
              trustLevel,
              verificationClaim: config.verificationClaim || "unverified",
              domain: config.agentDomain,
              dnsVerified,
              haiRegistered,
              haiStatus,
            },
          };
        }

        // Check external agent by domain
        const results: string[] = [`Attestation Status for ${domain}`, ""];

        // Fetch public key
        const keyResult = await fetchPublicKey(domain, true);
        if ("error" in keyResult) {
          return {
            text: `Could not fetch public key from ${domain}: ${keyResult.error}`,
            error: keyResult.error,
          };
        }

        const publicKeyHash = keyResult.data.publicKeyHash || hashString(keyResult.data.key);
        const agentId = keyResult.data.agentId;

        results.push(`Agent ID: ${agentId || "Unknown"}`);

        // Check DNS
        const dnsResult = await resolveDnsRecord(domain);
        let dnsVerified = false;
        if (dnsResult) {
          dnsVerified = dnsResult.parsed.publicKeyHash === publicKeyHash;
        }
        results.push(`DNS Verified: ${dnsVerified ? "Yes" : "No"}`);

        // Check HAI.ai via HaiClient
        let haiRegistered = false;
        let haiStatus: any = null;
        if (agentId) {
          try {
            const haiClient = await api.runtime.jacs?.getHaiClient();
            if (haiClient) {
              haiStatus = await haiClient.getAgentAttestation(agentId);
              haiRegistered = haiStatus.registered;
            }
          } catch {
            // Not registered
          }
        }
        results.push(`HAI.ai Registered: ${haiRegistered ? "Yes" : "No"}`);

        const trustLevel = determineTrustLevel(true, dnsVerified, haiRegistered);
        results.push("");
        results.push(`Trust Level: ${trustLevel.toUpperCase()}`);

        if (haiStatus?.registeredAt) {
          results.push(`HAI.ai Registered At: ${haiStatus.registeredAt}`);
        }

        return {
          text: results.join("\n"),
          data: {
            domain,
            agentId,
            trustLevel,
            dnsVerified,
            haiRegistered,
            haiStatus,
          },
        };
      },
    },

    claim: {
      description: "Set or view verification claim level",
      args: ["[level]"],
      handler: async (args: any) => {
        if (!api.runtime.jacs?.isInitialized()) {
          return { text: "JACS not initialized. Run 'openclaw jacs init' first." };
        }

        const config = api.config;
        const level = args.level || args._?.[0];
        const pubKeyPath = path.join(keysDir, "agent.public.pem");
        const publicKey = fs.existsSync(pubKeyPath)
          ? fs.readFileSync(pubKeyPath, "utf-8")
          : null;
        const publicKeyHash = publicKey ? hashString(publicKey) : null;

        const proof = {
          domain: config.agentDomain,
          domainConfigured: !!config.agentDomain,
          dnsRecordFound: false,
          dnsVerified: false,
          dnsHash: undefined as string | undefined,
          publicKeyHash: publicKeyHash || undefined,
          haiChecked: false,
          haiRegistered: false,
          haiVerifiedAt: undefined as string | undefined,
        };

        if (config.agentDomain) {
          const dnsResult = await resolveDnsRecord(config.agentDomain);
          if (dnsResult) {
            proof.dnsRecordFound = true;
            proof.dnsHash = dnsResult.parsed.publicKeyHash;
            if (publicKeyHash && dnsResult.parsed.publicKeyHash) {
              proof.dnsVerified = dnsResult.parsed.publicKeyHash === publicKeyHash;
            }
          }
        }

        const targetClaim = (level as VerificationClaim | undefined) || (config.verificationClaim || "unverified");
        if (config.agentId && targetClaim === "verified-hai.ai") {
          proof.haiChecked = true;
          try {
            const haiClient = await api.runtime.jacs?.getHaiClient();
            if (haiClient) {
              const status = await haiClient.verify();
              proof.haiRegistered = status?.registered ?? false;
              proof.haiVerifiedAt = status?.registeredAt;
            }
          } catch {
            // Not registered or unreachable
          }
        }

        const proofLines = [
          `  Domain Configured: ${proof.domainConfigured ? "Yes" : "No"}`,
          `  DNS Record Found: ${proof.dnsRecordFound ? "Yes" : "No"}`,
          `  DNS Hash Verified: ${proof.dnsVerified ? "Yes" : "No"}`,
          `  HAI.ai Registered: ${proof.haiChecked ? (proof.haiRegistered ? "Yes" : "No") : "Not checked"}`,
        ];

        if (!level) {
          // Show current claim
          return {
            text: `Current Verification Claim: ${config.verificationClaim || "unverified"}

Verification Proof:
${proofLines.join("\n")}

Available levels:
  - unverified: Basic self-signed agent (no requirements)
  - verified: Domain-verified agent (requires domain + DNS TXT record hash match)
  - verified-hai.ai: HAI.ai attested agent (requires HAI.ai registration)

Usage: openclaw jacs claim <level>`,
            data: { currentClaim: config.verificationClaim || "unverified", proof },
          };
        }

        // Validate level
        const validLevels: VerificationClaim[] = ["unverified", "verified", "verified-hai.ai"];
        if (!validLevels.includes(level as VerificationClaim)) {
          return {
            text: `Invalid claim level: ${level}. Valid options: ${validLevels.join(", ")}`,
            error: "Invalid claim level",
          };
        }

        const newClaim = level as VerificationClaim;
        const currentClaim = config.verificationClaim || "unverified";

        // Check if downgrade
        if (!canUpgradeClaim(currentClaim, newClaim)) {
          return {
            text: `Cannot downgrade verification claim from '${currentClaim}' to '${newClaim}'`,
            error: "Claim downgrade not allowed",
          };
        }

        const validationError = validateClaimRequirements(
          newClaim,
          proof.domainConfigured,
          proof.dnsVerified,
          proof.haiRegistered
        );

        if (validationError) {
          return {
            text: `Cannot set claim to '${newClaim}': ${validationError}

Verification Proof:
${proofLines.join("\n")}`,
            error: validationError,
          };
        }

        // Update config
        api.updateConfig({ verificationClaim: newClaim });

        return {
          text: `Verification claim updated: ${currentClaim} -> ${newClaim}

Verification Proof:
${proofLines.join("\n")}`,
          data: { previousClaim: currentClaim, newClaim, proof },
        };
      },
    },
  };
}
