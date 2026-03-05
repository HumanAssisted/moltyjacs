import * as fs from "fs";
import * as path from "path";
import { JacsClient } from "@hai.ai/jacs/client";
import {
  exportAgentCard as haisdkExportAgentCard,
  signArtifact as haisdkSignArtifact,
  verifyArtifact as haisdkVerifyArtifact,
  assessRemoteAgent as haisdkAssessRemoteAgent,
  trustA2AAgent as haisdkTrustA2AAgent,
  generateWellKnownDocuments as haisdkGenerateWellKnownDocuments,
} from "haisdk";
import type { OpenClawPluginAPI } from "./index";
import { readJacsConfig, resolvePublicKeyPath } from "./jacs-config";

export type A2ATrustPolicy = "open" | "verified" | "strict";

const DEFAULT_TRUST_POLICY: A2ATrustPolicy = "verified";
const jacsClientCache = new Map<string, JacsClient>();

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
  return {
    jacsId: api.config.agentId || api.runtime.jacs?.getAgentId() || agentId || "unknown-agent",
    jacsName: api.config.agentName || "OpenClaw JACS Agent",
    jacsDescription:
      api.config.agentDescription || "OpenClaw agent with JACS cryptographic provenance",
    jacsVersion: version || "1",
    jacsAgentDomain: api.config.agentDomain,
    jacsAgentType: "ai",
    keyAlgorithm: api.config.keyAlgorithm || config?.jacs_agent_key_algorithm || "pq2025",
  };
}

async function getJacsClient(configPath: string): Promise<JacsClient> {
  const cached = jacsClientCache.get(configPath);
  if (cached) {
    return cached;
  }

  const client = new JacsClient({ configPath });
  if (typeof client.loadSync === "function") {
    client.loadSync(configPath);
  } else {
    await client.load(configPath);
  }
  jacsClientCache.set(configPath, client);
  return client;
}

export async function exportA2AAgentCard(
  api: OpenClawPluginAPI,
  trustPolicy: A2ATrustPolicy = DEFAULT_TRUST_POLICY,
): Promise<{ agentCard: Record<string, unknown>; agentData: Record<string, unknown> }> {
  const configPath = getConfigPath(api);
  const client = await getJacsClient(configPath);
  const agentData = resolveAgentData(api, configPath);
  const agentCard = await haisdkExportAgentCard(client, agentData, { trustPolicy }) as Record<string, unknown>;
  return { agentCard, agentData };
}

export async function signA2AArtifact(
  api: OpenClawPluginAPI,
  artifact: Record<string, unknown>,
  artifactType: string,
  parentSignatures: Record<string, unknown>[] | null = null,
  trustPolicy: A2ATrustPolicy = DEFAULT_TRUST_POLICY,
): Promise<Record<string, unknown>> {
  const configPath = getConfigPath(api);
  const client = await getJacsClient(configPath);
  return haisdkSignArtifact(client, artifact, artifactType, parentSignatures, {
    trustPolicy,
  }) as Promise<Record<string, unknown>>;
}

export async function verifyA2AArtifact(
  api: OpenClawPluginAPI,
  wrappedArtifact: string | Record<string, unknown>,
  trustPolicy: A2ATrustPolicy = DEFAULT_TRUST_POLICY,
): Promise<Record<string, unknown>> {
  const configPath = getConfigPath(api);
  const client = await getJacsClient(configPath);
  return haisdkVerifyArtifact(client, wrappedArtifact, { trustPolicy }) as Promise<Record<string, unknown>>;
}

export async function assessRemoteA2AAgent(
  api: OpenClawPluginAPI,
  agentCard: string | Record<string, unknown>,
  trustPolicy: A2ATrustPolicy = DEFAULT_TRUST_POLICY,
): Promise<Record<string, unknown>> {
  const configPath = getConfigPath(api);
  const client = await getJacsClient(configPath);
  return haisdkAssessRemoteAgent(client, agentCard, { trustPolicy }) as Promise<Record<string, unknown>>;
}

export async function trustRemoteA2AAgent(
  api: OpenClawPluginAPI,
  agentCard: string | Record<string, unknown>,
  trustPolicy: A2ATrustPolicy = DEFAULT_TRUST_POLICY,
): Promise<Record<string, unknown>> {
  const configPath = getConfigPath(api);
  const client = await getJacsClient(configPath);
  const result = await haisdkTrustA2AAgent(client, agentCard, { trustPolicy });
  return { trusted: true, result };
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
  const client = await getJacsClient(configPath);
  const { agentCard, agentData } = await exportA2AAgentCard(api, trustPolicy);
  const publicKeyPem = resolveConfiguredPublicKey(api, configPath);
  const publicKeyB64 = Buffer.from(publicKeyPem, "utf-8").toString("base64");

  const documents = await haisdkGenerateWellKnownDocuments(
    client,
    agentCard,
    options?.jwsSignature ?? "",
    publicKeyB64,
    agentData,
    { trustPolicy },
  ) as Record<string, Record<string, unknown>>;

  if (!options?.jwsSignature) {
    const cardDoc = documents["/.well-known/agent-card.json"];
    if (cardDoc && Array.isArray(cardDoc.signatures) && cardDoc.signatures.length === 0) {
      delete cardDoc.signatures;
    }
  }

  return { documents, agentCard, agentData };
}

