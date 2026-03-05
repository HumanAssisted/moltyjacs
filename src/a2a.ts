import * as fs from "fs";
import * as path from "path";
import type { OpenClawPluginAPI } from "./index";
import { readJacsConfig, resolvePublicKeyPath } from "./jacs-config";

export type A2ATrustPolicy = "open" | "verified" | "strict";

const DEFAULT_TRUST_POLICY: A2ATrustPolicy = "verified";
const JACS_EXTENSION_URIS = new Set([
  "urn:jacs:provenance-v1",
  "urn:hai.ai:jacs-provenance-v1",
]);

interface A2AContext {
  client: any | null;
  integration: any;
}

function getConfigPath(api: OpenClawPluginAPI): string {
  return path.join(api.runtime.homeDir, ".openclaw", "jacs", "jacs.config.json");
}

function getKeysDir(api: OpenClawPluginAPI): string {
  return path.join(api.runtime.homeDir, ".openclaw", "jacs_keys");
}

function parseAgentIdAndVersion(value?: string): { agentId?: string; version?: string } {
  if (!value || typeof value !== "string") {
    return {};
  }
  const [agentId, version] = value.split(":");
  return {
    agentId: agentId || undefined,
    version: version || undefined,
  };
}

function resolveConfiguredPublicKey(api: OpenClawPluginAPI, configPath: string): string {
  const runtimeKey = api.runtime.jacs?.getPublicKey();
  if (typeof runtimeKey === "string" && runtimeKey.trim() !== "") {
    return runtimeKey;
  }

  const config = readJacsConfig(configPath);
  const publicKeyPath = resolvePublicKeyPath(getKeysDir(api), config);
  if (!fs.existsSync(publicKeyPath)) {
    throw new Error(`Public key not found at ${publicKeyPath}`);
  }
  return fs.readFileSync(publicKeyPath, "utf-8");
}

function resolveAgentData(api: OpenClawPluginAPI, configPath: string): Record<string, unknown> {
  const config = readJacsConfig(configPath);
  const { agentId, version } = parseAgentIdAndVersion(config?.jacs_agent_id_and_version);
  const resolvedAgentId =
    api.config.agentId ||
    api.runtime.jacs?.getAgentId() ||
    agentId ||
    "unknown-agent";

  return {
    jacsId: resolvedAgentId,
    jacsName: api.config.agentName || "OpenClaw JACS Agent",
    jacsDescription:
      api.config.agentDescription || "OpenClaw agent with JACS cryptographic provenance",
    jacsVersion: version || "1",
    jacsAgentDomain: api.config.agentDomain,
    jacsAgentType: "ai",
    keyAlgorithm: api.config.keyAlgorithm || config?.jacs_agent_key_algorithm || "pq2025",
  };
}

async function loadJacsClient(configPath: string): Promise<any | null> {
  try {
    const specifier = "@hai.ai/jacs/client";
    const mod = await import(specifier);
    const ClientCtor = (mod as Record<string, unknown>).JacsClient as
      | (new (opts?: Record<string, unknown>) => any)
      | undefined;
    if (typeof ClientCtor !== "function") {
      return null;
    }

    const client = new ClientCtor({ configPath });
    if (typeof client.loadSync === "function") {
      client.loadSync(configPath);
    } else if (typeof client.load === "function") {
      await client.load(configPath);
    }
    return client;
  } catch {
    return null;
  }
}

async function loadA2AContext(
  configPath: string,
  trustPolicy: A2ATrustPolicy = DEFAULT_TRUST_POLICY,
): Promise<A2AContext> {
  let mod: Record<string, unknown> | null = null;
  for (const specifier of ["@hai.ai/jacs/a2a", "@hai.ai/jacs/src/a2a.js"]) {
    try {
      mod = await import(specifier) as Record<string, unknown>;
      break;
    } catch {
      // Try the next layout variant.
    }
  }

  if (!mod) {
    throw new Error("Unable to load @hai.ai/jacs A2A module");
  }

  const IntegrationCtor = (mod as Record<string, unknown>).JACSA2AIntegration as
    | (new (...args: any[]) => any)
    | undefined;

  if (typeof IntegrationCtor !== "function") {
    throw new Error("@hai.ai/jacs/a2a does not export JACSA2AIntegration");
  }

  const client = await loadJacsClient(configPath);

  if (client) {
    try {
      return { client, integration: new IntegrationCtor(client, trustPolicy) };
    } catch {
      try {
        return { client, integration: new IntegrationCtor(client) };
      } catch {
        // Fall through to config-path constructor compatibility.
      }
    }
  }

  try {
    return { client, integration: new IntegrationCtor(configPath, trustPolicy) };
  } catch {
    return { client, integration: new IntegrationCtor(configPath) };
  }
}

function getMethod(target: any, methodNames: string[]): (...args: any[]) => any {
  for (const methodName of methodNames) {
    const candidate = target?.[methodName];
    if (typeof candidate === "function") {
      return candidate.bind(target);
    }
  }
  throw new Error(`A2A integration missing method. Tried: ${methodNames.join(", ")}`);
}

function normalizeCard(agentCard: string | Record<string, unknown>): Record<string, unknown> {
  if (typeof agentCard === "string") {
    return JSON.parse(agentCard) as Record<string, unknown>;
  }
  return agentCard;
}

function extractCardAgentId(card: Record<string, unknown>): string | undefined {
  const metadata = card.metadata;
  if (metadata && typeof metadata === "object") {
    const record = metadata as Record<string, unknown>;
    for (const key of ["jacsId", "agentId", "jacsAgentId"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim() !== "") {
        return value;
      }
    }
  }

  for (const key of ["agentId", "jacsId", "id"]) {
    const value = card[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }
  return undefined;
}

function hasJacsExtension(card: Record<string, unknown>): boolean {
  const capabilities = card.capabilities;
  if (!capabilities || typeof capabilities !== "object") {
    return false;
  }
  const extensions = (capabilities as Record<string, unknown>).extensions;
  if (!Array.isArray(extensions)) {
    return false;
  }
  return extensions.some((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }
    const uri = (entry as Record<string, unknown>).uri;
    return typeof uri === "string" && JACS_EXTENSION_URIS.has(uri);
  });
}

function fallbackAssessRemoteAgent(
  client: any | null,
  agentCard: string | Record<string, unknown>,
  trustPolicy: A2ATrustPolicy,
): Record<string, unknown> {
  const card = normalizeCard(agentCard);
  const agentId = extractCardAgentId(card);
  const registered = hasJacsExtension(card);
  const inTrustStore =
    !!agentId &&
    !!client &&
    typeof client.isTrusted === "function" &&
    !!client.isTrusted(agentId);

  if (trustPolicy === "open") {
    return {
      allowed: true,
      trustLevel: registered ? "jacs-extended" : "open",
      jacsRegistered: registered,
      inTrustStore,
      reason: "policy=open allows all remote agents",
      policy: trustPolicy,
      agentId,
    };
  }

  if (trustPolicy === "verified") {
    return {
      allowed: registered,
      trustLevel: registered ? "verified" : "unverified",
      jacsRegistered: registered,
      inTrustStore,
      reason: registered
        ? "agent card includes a JACS extension descriptor"
        : "agent card missing a JACS extension descriptor",
      policy: trustPolicy,
      agentId,
    };
  }

  return {
    allowed: inTrustStore,
    trustLevel: inTrustStore ? "explicitly_trusted" : "untrusted",
    jacsRegistered: registered,
    inTrustStore,
    reason: inTrustStore
      ? "agent is present in the local JACS trust store"
      : (agentId
        ? "agent is not present in the local JACS trust store"
        : "agent card does not expose a stable agent id for trust-store lookup"),
    policy: trustPolicy,
    agentId,
  };
}

export async function exportA2AAgentCard(
  api: OpenClawPluginAPI,
  trustPolicy: A2ATrustPolicy = DEFAULT_TRUST_POLICY,
): Promise<{ agentCard: Record<string, unknown>; agentData: Record<string, unknown> }> {
  const configPath = getConfigPath(api);
  const agentData = resolveAgentData(api, configPath);
  const { integration } = await loadA2AContext(configPath, trustPolicy);
  const exportCard = getMethod(integration, ["exportAgentCard"]);
  const agentCard = await Promise.resolve(exportCard(agentData));
  return {
    agentCard: normalizeCard(agentCard as Record<string, unknown>),
    agentData,
  };
}

export async function signA2AArtifact(
  api: OpenClawPluginAPI,
  artifact: Record<string, unknown>,
  artifactType: string,
  parentSignatures: Record<string, unknown>[] | null = null,
  trustPolicy: A2ATrustPolicy = DEFAULT_TRUST_POLICY,
): Promise<Record<string, unknown>> {
  const configPath = getConfigPath(api);
  const { integration } = await loadA2AContext(configPath, trustPolicy);
  const signArtifact = getMethod(integration, ["signArtifact", "wrapArtifactWithProvenance"]);
  return Promise.resolve(
    signArtifact(artifact, artifactType, parentSignatures),
  ) as Promise<Record<string, unknown>>;
}

export async function verifyA2AArtifact(
  api: OpenClawPluginAPI,
  wrappedArtifact: string | Record<string, unknown>,
  trustPolicy: A2ATrustPolicy = DEFAULT_TRUST_POLICY,
): Promise<Record<string, unknown>> {
  const configPath = getConfigPath(api);
  const { integration } = await loadA2AContext(configPath, trustPolicy);
  const verifyArtifact = getMethod(integration, ["verifyArtifact", "verifyWrappedArtifact"]);
  return Promise.resolve(
    verifyArtifact(wrappedArtifact),
  ) as Promise<Record<string, unknown>>;
}

export async function assessRemoteA2AAgent(
  api: OpenClawPluginAPI,
  agentCard: string | Record<string, unknown>,
  trustPolicy: A2ATrustPolicy = DEFAULT_TRUST_POLICY,
): Promise<Record<string, unknown>> {
  const configPath = getConfigPath(api);
  const { client, integration } = await loadA2AContext(configPath, trustPolicy);
  try {
    const assessRemoteAgent = getMethod(integration, ["assessRemoteAgent"]);
    return await Promise.resolve(assessRemoteAgent(agentCard));
  } catch {
    return fallbackAssessRemoteAgent(client, agentCard, trustPolicy);
  }
}

export async function trustRemoteA2AAgent(
  api: OpenClawPluginAPI,
  agentCard: string | Record<string, unknown>,
  trustPolicy: A2ATrustPolicy = DEFAULT_TRUST_POLICY,
): Promise<Record<string, unknown>> {
  const configPath = getConfigPath(api);
  const { client, integration } = await loadA2AContext(configPath, trustPolicy);
  const cardStr = typeof agentCard === "string" ? agentCard : JSON.stringify(agentCard);

  try {
    const trustA2AAgent = getMethod(integration, ["trustA2AAgent"]);
    const result = await Promise.resolve(trustA2AAgent(agentCard));
    return { trusted: true, result };
  } catch {
    if (client && typeof client.trustAgent === "function") {
      const result = client.trustAgent(cardStr);
      return { trusted: true, result };
    }
    throw new Error("Current @hai.ai/jacs runtime cannot add remote A2A agents to the trust store");
  }
}

export async function generateA2AWellKnownDocuments(
  api: OpenClawPluginAPI,
  options?: {
    trustPolicy?: A2ATrustPolicy;
    jwsSignature?: string;
  },
): Promise<{
  documents: Record<string, Record<string, unknown>>;
  agentCard: Record<string, unknown>;
  agentData: Record<string, unknown>;
}> {
  const trustPolicy = options?.trustPolicy ?? DEFAULT_TRUST_POLICY;
  const configPath = getConfigPath(api);
  const { integration } = await loadA2AContext(configPath, trustPolicy);
  const { agentCard, agentData } = await exportA2AAgentCard(api, trustPolicy);
  const generateWellKnownDocuments = getMethod(integration, ["generateWellKnownDocuments"]);
  const publicKeyPem = resolveConfiguredPublicKey(api, configPath);
  const publicKeyB64 = Buffer.from(publicKeyPem, "utf-8").toString("base64");
  const documents = await Promise.resolve(
    generateWellKnownDocuments(agentCard, options?.jwsSignature ?? "", publicKeyB64, agentData),
  ) as Record<string, Record<string, unknown>>;

  if (!options?.jwsSignature) {
    const cardDoc = documents["/.well-known/agent-card.json"];
    if (cardDoc && Array.isArray(cardDoc.signatures)) {
      const hasNonEmptyJws = cardDoc.signatures.some((entry) => {
        if (!entry || typeof entry !== "object") {
          return false;
        }
        const jws = (entry as Record<string, unknown>).jws;
        return typeof jws === "string" && jws.trim() !== "";
      });
      if (!hasNonEmptyJws) {
        delete cardDoc.signatures;
      }
    }
  }

  return {
    documents,
    agentCard,
    agentData,
  };
}
