/**
 * Mock for @hai.ai/jacs native module
 *
 * Provides stub implementations so tests can run without the NAPI binary.
 * Actual tool tests use MockJacsAgent from test/setup.ts which is injected
 * via the OpenClawPluginAPI mock - these stubs are only needed so the
 * TypeScript imports resolve.
 */

import * as crypto from "crypto";

const TRUSTED_AGENTS = new Set<string>();

export const A2A_PROTOCOL_VERSION = "0.4.0";
export const JACS_EXTENSION_URI = "urn:jacs:provenance-v1";

export function hashString(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function legacyVerifyString(
  _data: string,
  _signatureBase64: string,
  _publicKey: Buffer,
  _publicKeyEncType: string
): boolean {
  return true;
}

export function createConfig(
  _jacsUseSecurity?: string | null,
  _jacsDataDirectory?: string | null,
  _jacsKeyDirectory?: string | null,
  _jacsAgentPrivateKeyFilename?: string | null,
  _jacsAgentPublicKeyFilename?: string | null,
  _jacsAgentKeyAlgorithm?: string | null,
  _jacsPrivateKeyPassword?: string | null,
  _jacsAgentIdAndVersion?: string | null,
  _jacsDefaultStorage?: string | null
): string {
  return JSON.stringify({
    jacs_use_security: "true",
    jacs_data_directory: "./jacs_data",
    jacs_key_directory: "./jacs_keys",
    jacs_agent_private_key_filename: "jacs.private.pem.enc",
    jacs_agent_public_key_filename: "jacs.public.pem",
  });
}

export function createAgent(
  name: string,
  _password: string,
  algorithm?: string | null,
  dataDirectory?: string | null,
  keyDirectory?: string | null,
  configPath?: string | null,
  _agentType?: string | null,
  _description?: string | null,
  _domain?: string | null,
  _defaultStorage?: string | null
): string {
  const agentId = "mock-agent-id";
  const version = "mock-agent-version";
  return JSON.stringify({
    agent_id: agentId,
    version,
    name,
    algorithm: algorithm || "pq2025",
    data_directory: dataDirectory || "./jacs_data",
    key_directory: keyDirectory || "./jacs_keys",
    config_path: configPath || "./jacs.config.json",
    private_key_path: (keyDirectory || "./jacs_keys") + "/jacs.private.pem.enc",
    public_key_path: (keyDirectory || "./jacs_keys") + "/jacs.public.pem",
  });
}

export function trustAgent(agentJson: string): string {
  try {
    const parsed = JSON.parse(agentJson) as Record<string, any>;
    const agentId =
      parsed?.metadata?.jacsId ||
      parsed?.agentId ||
      parsed?.jacsId;
    if (typeof agentId === "string" && agentId.trim() !== "") {
      TRUSTED_AGENTS.add(agentId);
    }
  } catch {
    // Keep trustAgent permissive in tests.
  }
  return agentJson;
}

export function untrustAgent(agentId: string): void {
  TRUSTED_AGENTS.delete(agentId);
}

export function isTrusted(agentId: string): boolean {
  return TRUSTED_AGENTS.has(agentId);
}

export function getTrustedAgent(agentId: string): string {
  if (!TRUSTED_AGENTS.has(agentId)) {
    throw new Error(`Agent not trusted: ${agentId}`);
  }
  return JSON.stringify({ agentId });
}

export function trustAgentWithKey(agentJson: string, _publicKeyPem: string): string {
  return agentJson;
}

export function trust_agent_with_key(agentJson: string, publicKeyPem: string): string {
  return trustAgentWithKey(agentJson, publicKeyPem);
}

export function getPublicKey(): string {
  return "-----BEGIN PUBLIC KEY-----\nmock-public-key\n-----END PUBLIC KEY-----\n";
}

export function sharePublicKey(): string {
  return getPublicKey();
}

export function share_public_key(): string {
  return sharePublicKey();
}

export function exportAgent(): string {
  return JSON.stringify({
    jacsId: "mock-agent-id:mock-agent-version",
    jacsType: "agent",
  });
}

export function shareAgent(): string {
  return exportAgent();
}

export function share_agent(): string {
  return shareAgent();
}

export function audit(_options?: Record<string, unknown>): Record<string, unknown> {
  return {
    risks: [],
    health_checks: [],
    summary: { risk_count: 0 },
    overall_status: "ok",
  };
}

export class JacsAgent {
  load(_configPath: string): string {
    return "loaded";
  }

  createDocument(
    documentString: string,
    _customSchema?: string | null,
    _outputfilename?: string | null,
    _noSave?: boolean | null,
    _attachments?: string | null,
    _embed?: boolean | null
  ): string {
    const input = JSON.parse(documentString);
    return JSON.stringify({
      ...input,
      jacsId: "mock-id",
      jacsVersion: "mock-version",
      jacsVersionDate: new Date().toISOString(),
      jacsOriginalVersion: "mock-orig",
      jacsOriginalDate: new Date().toISOString(),
      jacsSignature: {
        agentID: "mock-agent",
        date: new Date().toISOString(),
        signature: "mock-sig",
        publicKeyHash: "mock-hash",
        signingAlgorithm: "pq2025",
      },
    });
  }

  updateDocument(
    _documentKey: string,
    newDocumentString: string,
    _attachments?: string[] | null,
    _embed?: boolean | null
  ): string {
    const input = JSON.parse(newDocumentString);
    return JSON.stringify({
      ...input,
      jacsVersion: "mock-updated-version",
      jacsSignature: {
        agentID: "mock-agent",
        date: new Date().toISOString(),
        signature: "mock-updated-sig",
      },
    });
  }

  verifyDocument(_documentString: string): boolean {
    return true;
  }

  signRequest(params: any): string {
    return JSON.stringify(params);
  }

  verifyResponse(documentString: string): any {
    return JSON.parse(documentString);
  }

  verifyResponseWithAgentId(documentString: string): any {
    return JSON.parse(documentString);
  }

  createAgreement(
    documentString: string,
    _agentids: string[],
    _question?: string | null,
    _context?: string | null,
    _agreementFieldname?: string | null
  ): string {
    return documentString;
  }

  signAgreement(documentString: string, _agreementFieldname?: string | null): string {
    return documentString;
  }

  checkAgreement(_documentString: string, _agreementFieldname?: string | null): string {
    return JSON.stringify({ complete: false, signers: [], pending: [] });
  }

  verifyAgent(_agentfile?: string | null): boolean {
    return true;
  }

  verifySignature(_documentString: string, _signatureField?: string | null): boolean {
    return true;
  }

  signString(_data: string): string {
    return "mock-signature";
  }

  updateAgent(newAgentString: string): string {
    return newAgentString;
  }
}

export class JacsClient {
  private _configPath?: string;
  private _agentId: string;
  private _name: string;

  constructor(options?: { configPath?: string }) {
    this._configPath = options?.configPath;
    this._agentId = "mock-agent-id";
    this._name = "mock-agent";
  }

  loadSync(_configPath?: string): Record<string, unknown> {
    return {
      agentId: this._agentId,
      configPath: this._configPath || "./jacs.config.json",
      name: this._name,
    };
  }

  async load(configPath?: string): Promise<Record<string, unknown>> {
    return this.loadSync(configPath);
  }

  get agentId(): string {
    return this._agentId;
  }

  get name(): string {
    return this._name;
  }

  trustAgent(agentJson: string): string {
    return trustAgent(agentJson);
  }

  untrustAgent(agentId: string): void {
    untrustAgent(agentId);
  }

  isTrusted(agentId: string): boolean {
    return isTrusted(agentId);
  }

  getTrustedAgent(agentId: string): string {
    return getTrustedAgent(agentId);
  }

  getA2A(): JACSA2AIntegration {
    return new JACSA2AIntegration(this);
  }

  exportAgentCard(agentData?: Record<string, unknown>): Record<string, unknown> {
    return this.getA2A().exportAgentCard(agentData || { jacsId: this._agentId, jacsName: this._name });
  }

  generateWellKnownDocuments(
    agentCard: Record<string, unknown>,
    jwsSignature: string,
    publicKeyB64: string,
    agentData: Record<string, unknown>,
  ): Record<string, Record<string, unknown>> {
    return this.getA2A().generateWellKnownDocuments(agentCard, jwsSignature, publicKeyB64, agentData);
  }
}

export class JACSA2AIntegration {
  private client: JacsClient;
  private trustPolicy: "open" | "verified" | "strict";

  constructor(clientOrConfigPath?: JacsClient | string | null, trustPolicy: "open" | "verified" | "strict" = "verified") {
    this.client = clientOrConfigPath instanceof JacsClient
      ? clientOrConfigPath
      : new JacsClient(typeof clientOrConfigPath === "string" ? { configPath: clientOrConfigPath } : undefined);
    this.trustPolicy = trustPolicy;
  }

  exportAgentCard(agentData: Record<string, unknown>): Record<string, unknown> {
    const agentId = String(agentData.jacsId || this.client.agentId);
    const agentName = String(agentData.jacsName || this.client.name);
    const domain = String(agentData.jacsAgentDomain || "agent.example.com");
    return {
      name: agentName,
      description: String(agentData.jacsDescription || "Mock A2A agent"),
      version: String(agentData.jacsVersion || "1"),
      protocolVersions: [A2A_PROTOCOL_VERSION],
      supportedInterfaces: [
        { url: `https://${domain}/agent/${agentId}`, protocolBinding: "jsonrpc" },
      ],
      defaultInputModes: ["application/json"],
      defaultOutputModes: ["application/json"],
      capabilities: {
        extensions: [
          {
            uri: JACS_EXTENSION_URI,
            description: "Mock JACS extension",
            required: false,
          },
        ],
      },
      skills: [
        {
          id: "verify-signature",
          name: "verify_signature",
          description: "Verify JACS document signatures",
          tags: ["jacs", "verification"],
        },
      ],
      metadata: {
        jacsId: agentId,
        jacsVersion: String(agentData.jacsVersion || "1"),
      },
    };
  }

  createExtensionDescriptor(): Record<string, unknown> {
    return {
      uri: JACS_EXTENSION_URI,
      name: "JACS Document Provenance",
      capabilities: {
        documentSigning: { algorithms: ["pq2025", "ring-Ed25519", "RSA-PSS"] },
      },
    };
  }

  wrapArtifactWithProvenance(
    artifact: Record<string, unknown>,
    artifactType: string,
    parentSignatures: Record<string, unknown>[] | null = null,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {
      jacsId: "mock-a2a-artifact-id",
      jacsVersion: "mock-a2a-artifact-version",
      jacsType: `a2a-${artifactType}`,
      jacsVersionDate: new Date().toISOString(),
      jacsSignature: {
        agentID: this.client.agentId,
        agentVersion: "1",
        date: new Date().toISOString(),
        signature: "mock-a2a-signature",
        publicKeyHash: "mock-pubkey-hash",
      },
      a2aArtifact: artifact,
    };
    if (parentSignatures) {
      result.jacsParentSignatures = parentSignatures;
    }
    return result;
  }

  async signArtifact(
    artifact: Record<string, unknown>,
    artifactType: string,
    parentSignatures: Record<string, unknown>[] | null = null,
  ): Promise<Record<string, unknown>> {
    return this.wrapArtifactWithProvenance(artifact, artifactType, parentSignatures);
  }

  async verifyWrappedArtifact(wrappedArtifact: Record<string, unknown> | string): Promise<Record<string, unknown>> {
    const parsed = typeof wrappedArtifact === "string"
      ? JSON.parse(wrappedArtifact)
      : wrappedArtifact;
    return {
      valid: true,
      signerId: parsed?.jacsSignature?.agentID || this.client.agentId,
      signerVersion: parsed?.jacsSignature?.agentVersion || "1",
      artifactType: parsed?.jacsType || "a2a-artifact",
      timestamp: parsed?.jacsVersionDate || new Date().toISOString(),
      originalArtifact: parsed?.a2aArtifact || {},
    };
  }

  async verifyArtifact(wrappedArtifact: Record<string, unknown> | string): Promise<Record<string, unknown>> {
    return this.verifyWrappedArtifact(wrappedArtifact);
  }

  createChainOfCustody(artifacts: Record<string, unknown>[]): Record<string, unknown> {
    return {
      chainOfCustody: artifacts.map((artifact) => ({
        artifactType: artifact.jacsType || "a2a-artifact",
        agentId: artifact?.jacsSignature?.agentID || this.client.agentId,
      })),
      created: new Date().toISOString(),
      totalArtifacts: artifacts.length,
    };
  }

  assessRemoteAgent(agentCardJson: Record<string, unknown> | string): Record<string, unknown> {
    const card = typeof agentCardJson === "string"
      ? JSON.parse(agentCardJson) as Record<string, any>
      : agentCardJson as Record<string, any>;
    const agentId = card?.metadata?.jacsId || card?.agentId || "remote-agent";
    const hasExtension = Array.isArray(card?.capabilities?.extensions)
      && card.capabilities.extensions.some((entry: Record<string, unknown>) => entry?.uri === JACS_EXTENSION_URI);
    const trusted = isTrusted(agentId);

    if (this.trustPolicy === "open") {
      return { allowed: true, trustLevel: "open", jacsRegistered: hasExtension, inTrustStore: trusted, policy: this.trustPolicy };
    }
    if (this.trustPolicy === "verified") {
      return {
        allowed: hasExtension,
        trustLevel: hasExtension ? "verified" : "unverified",
        jacsRegistered: hasExtension,
        inTrustStore: trusted,
        policy: this.trustPolicy,
        reason: hasExtension ? "agent card includes JACS extension" : "agent card missing JACS extension",
      };
    }
    return {
      allowed: trusted,
      trustLevel: trusted ? "explicitly_trusted" : "untrusted",
      jacsRegistered: hasExtension,
      inTrustStore: trusted,
      policy: this.trustPolicy,
      reason: trusted ? "agent trusted locally" : "agent not trusted locally",
    };
  }

  trustA2AAgent(agentCardJson: Record<string, unknown> | string): string {
    const cardStr = typeof agentCardJson === "string" ? agentCardJson : JSON.stringify(agentCardJson);
    return this.client.trustAgent(cardStr);
  }

  generateWellKnownDocuments(
    agentCard: Record<string, unknown>,
    jwsSignature: string,
    publicKeyB64: string,
    agentData: Record<string, unknown>,
  ): Record<string, Record<string, unknown>> {
    const card = JSON.parse(JSON.stringify(agentCard));
    if (jwsSignature) {
      (card as any).signatures = [{ jws: jwsSignature }];
    }
    return {
      "/.well-known/agent-card.json": card,
      "/.well-known/jwks.json": {
        keys: [{ kid: String(agentData.jacsId || this.client.agentId), kty: "OKP", alg: "EdDSA" }],
      },
      "/.well-known/jacs-agent.json": {
        agentId: String(agentData.jacsId || this.client.agentId),
        agentVersion: String(agentData.jacsVersion || "1"),
        keyAlgorithm: String(agentData.keyAlgorithm || "pq2025"),
      },
      "/.well-known/jacs-pubkey.json": {
        publicKey: publicKeyB64,
        publicKeyHash: hashString(publicKeyB64),
        algorithm: String(agentData.keyAlgorithm || "pq2025"),
        agentId: String(agentData.jacsId || this.client.agentId),
      },
      "/.well-known/jacs-extension.json": this.createExtensionDescriptor(),
    };
  }
}
