/**
 * Mock for haiai
 *
 * Provides stub implementations for unit tests.
 * Matches the real SDK's public API surface.
 */

export function generateVerifyLink(document: string, baseUrl = "https://hai.ai"): string {
  const encoded = Buffer.from(document, "utf-8").toString("base64url");
  return `${baseUrl.replace(/\/$/, "")}/jacs/verify?s=${encoded}`;
}

function hasJacsExtension(agentCard: Record<string, any>): boolean {
  const extensions = agentCard?.capabilities?.extensions;
  return Array.isArray(extensions) && extensions.some((entry) => entry?.uri === "urn:jacs:provenance-v1");
}

export async function exportAgentCard(
  jacsClient: { agentId?: string; name?: string },
  agentData: Record<string, unknown>,
  _options?: { trustPolicy?: "open" | "verified" | "strict" },
): Promise<Record<string, unknown>> {
  const agentId = String(agentData.jacsId || jacsClient.agentId || "mock-agent-id");
  const name = String(agentData.jacsName || jacsClient.name || "mock-agent");
  return {
    name,
    description: String(agentData.jacsDescription || "Mock A2A agent"),
    version: String(agentData.jacsVersion || "1"),
    protocolVersions: ["0.4.0"],
    supportedInterfaces: [
      {
        url: `https://${String(agentData.jacsAgentDomain || "agent.example.com")}/agent/${agentId}`,
        protocolBinding: "jsonrpc",
      },
    ],
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    capabilities: {
      extensions: [{ uri: "urn:jacs:provenance-v1" }],
    },
    skills: [
      {
        id: "verify-signature",
        name: "verify_signature",
        description: "Verify JACS signatures",
        tags: ["jacs", "verification"],
      },
    ],
    metadata: {
      jacsId: agentId,
      jacsVersion: String(agentData.jacsVersion || "1"),
    },
  };
}

export async function signArtifact(
  jacsClient: { agentId?: string },
  artifact: Record<string, unknown>,
  artifactType: string,
  parentSignatures: Record<string, unknown>[] | null = null,
  _options?: { trustPolicy?: "open" | "verified" | "strict" },
): Promise<Record<string, unknown>> {
  const wrapped: Record<string, unknown> = {
    jacsId: "mock-a2a-id",
    jacsVersion: "mock-a2a-version",
    jacsType: `a2a-${artifactType}`,
    jacsVersionDate: new Date().toISOString(),
    jacsSignature: {
      agentID: jacsClient.agentId || "mock-agent-id",
      agentVersion: "1",
      date: new Date().toISOString(),
      signature: "mock-a2a-signature",
      publicKeyHash: "mock-pubkey-hash",
    },
    a2aArtifact: artifact,
  };
  if (parentSignatures) {
    wrapped.jacsParentSignatures = parentSignatures;
  }
  return wrapped;
}

export async function verifyArtifact(
  _jacsClient: unknown,
  wrappedArtifact: string | Record<string, unknown>,
  _options?: { trustPolicy?: "open" | "verified" | "strict" },
): Promise<Record<string, unknown>> {
  const parsed = typeof wrappedArtifact === "string"
    ? JSON.parse(wrappedArtifact)
    : wrappedArtifact;
  return {
    valid: true,
    signerId: (parsed as any)?.jacsSignature?.agentID || "mock-agent-id",
    signerVersion: (parsed as any)?.jacsSignature?.agentVersion || "1",
    artifactType: (parsed as any)?.jacsType || "a2a-artifact",
    timestamp: (parsed as any)?.jacsVersionDate || new Date().toISOString(),
    originalArtifact: (parsed as any)?.a2aArtifact || {},
  };
}

export async function assessRemoteAgent(
  _jacsClient: { isTrusted?: (agentId: string) => boolean } | null,
  agentCard: string | Record<string, unknown>,
  options?: { trustPolicy?: "open" | "verified" | "strict" },
): Promise<Record<string, unknown>> {
  const parsed = typeof agentCard === "string" ? JSON.parse(agentCard) as Record<string, any> : agentCard as Record<string, any>;
  const trustPolicy = options?.trustPolicy || "verified";
  const agentId = parsed?.metadata?.jacsId || parsed?.agentId || "remote-agent";
  const trusted = typeof _jacsClient?.isTrusted === "function" ? !!_jacsClient.isTrusted(agentId) : false;
  const registered = hasJacsExtension(parsed);

  if (trustPolicy === "open") {
    return { allowed: true, trustLevel: "open", jacsRegistered: registered, inTrustStore: trusted, policy: trustPolicy };
  }
  if (trustPolicy === "strict") {
    return {
      allowed: trusted,
      trustLevel: trusted ? "explicitly_trusted" : "untrusted",
      jacsRegistered: registered,
      inTrustStore: trusted,
      policy: trustPolicy,
      reason: trusted ? "agent trusted locally" : "agent not trusted locally",
    };
  }
  return {
    allowed: registered,
    trustLevel: registered ? "verified" : "unverified",
    jacsRegistered: registered,
    inTrustStore: trusted,
    policy: trustPolicy,
    reason: registered ? "agent card includes JACS extension" : "agent card missing JACS extension",
  };
}

export async function trustA2AAgent(
  jacsClient: { trustAgent?: (agentJson: string) => string } | null,
  agentCard: string | Record<string, unknown>,
  _options?: { trustPolicy?: "open" | "verified" | "strict" },
): Promise<string> {
  const cardStr = typeof agentCard === "string" ? agentCard : JSON.stringify(agentCard);
  if (typeof jacsClient?.trustAgent === "function") {
    return jacsClient.trustAgent(cardStr);
  }
  return cardStr;
}

export async function generateWellKnownDocuments(
  _jacsClient: { agentId?: string } | null,
  agentCard: Record<string, unknown>,
  jwsSignature: string,
  publicKeyB64: string,
  agentData: Record<string, unknown>,
  _options?: { trustPolicy?: "open" | "verified" | "strict" },
): Promise<Record<string, Record<string, unknown>>> {
  const card = JSON.parse(JSON.stringify(agentCard));
  if (jwsSignature) {
    (card as any).signatures = [{ jws: jwsSignature }];
  }
  return {
    "/.well-known/agent-card.json": card,
    "/.well-known/jwks.json": {
      keys: [{ kid: String(agentData.jacsId || _jacsClient?.agentId || "mock-agent-id"), kty: "OKP", alg: "EdDSA" }],
    },
    "/.well-known/jacs-agent.json": {
      agentId: String(agentData.jacsId || _jacsClient?.agentId || "mock-agent-id"),
      agentVersion: String(agentData.jacsVersion || "1"),
      keyAlgorithm: String(agentData.keyAlgorithm || "pq2025"),
    },
    "/.well-known/jacs-pubkey.json": {
      publicKey: publicKeyB64,
      publicKeyHash: "mock-public-key-hash",
      algorithm: String(agentData.keyAlgorithm || "pq2025"),
      agentId: String(agentData.jacsId || _jacsClient?.agentId || "mock-agent-id"),
    },
    "/.well-known/jacs-extension.json": {
      uri: "urn:jacs:provenance-v1",
      name: "JACS Document Provenance",
    },
  };
}

export class HaiClient {
  private _jacsId: string;
  private _agentEmail: string | undefined;
  private _baseUrl: string;
  private _haiAgentId: string;
  lastRegisterOptions: any = null;

  private constructor(options?: { url?: string }) {
    this._jacsId = "mock-jacs-id";
    this._baseUrl = options?.url ?? "https://hai.ai";
    this._haiAgentId = "mock-hai-agent-id";
  }

  static async create(options?: { configPath?: string; url?: string }): Promise<HaiClient> {
    return new HaiClient(options);
  }

  static async fromCredentials(
    jacsId: string,
    _privateKeyPem: string,
    options?: { url?: string; privateKeyPassphrase?: string }
  ): Promise<HaiClient> {
    const client = new HaiClient(options);
    (client as any)._jacsId = jacsId;
    return client;
  }

  get jacsId(): string {
    return this._jacsId;
  }

  get agentName(): string {
    return this._jacsId;
  }

  get haiAgentId(): string {
    return this._haiAgentId;
  }

  get isConnected(): boolean {
    return false;
  }

  getAgentEmail(): string | undefined {
    return this._agentEmail;
  }

  setAgentEmail(email: string): void {
    this._agentEmail = email;
  }

  async register(_options?: {
    ownerEmail?: string;
    description?: string;
    domain?: string;
    agentJson?: string;
    publicKeyPem?: string;
    registrationKey?: string;
  }): Promise<{
    success: boolean;
    agentId: string;
    jacsId: string;
    haiSignature: string;
    registrationId: string;
    registeredAt: string;
    rawResponse: Record<string, unknown>;
  }> {
    this.lastRegisterOptions = _options ?? null;
    return {
      success: true,
      agentId: this._jacsId,
      jacsId: this._jacsId,
      haiSignature: "mock-hai-signature",
      registrationId: "mock-registration-id",
      registeredAt: new Date().toISOString(),
      rawResponse: {},
    };
  }

  async hello(includeTest = false): Promise<{
    success: boolean;
    timestamp: string;
    clientIp: string;
    haiPublicKeyFingerprint: string;
    message: string;
    haiSignedAck: string;
    helloId: string;
    testScenario?: Record<string, unknown>;
    haiSignatureValid: boolean;
    rawResponse: Record<string, unknown>;
  }> {
    return {
      success: true,
      timestamp: new Date().toISOString(),
      clientIp: "127.0.0.1",
      haiPublicKeyFingerprint: "mock-fingerprint",
      message: "hello",
      haiSignedAck: "mock-ack",
      helloId: "mock-hello-id",
      testScenario: includeTest ? { mode: "test" } : undefined,
      haiSignatureValid: true,
      rawResponse: {},
    };
  }

  async rotateKeys(_options?: { registerWithHai?: boolean; haiUrl?: string }): Promise<{
    jacsId: string;
    oldVersion: string;
    newVersion: string;
    newPublicKeyHash: string;
    registeredWithHai: boolean;
    signedAgentJson: string;
  }> {
    return {
      jacsId: this._jacsId,
      oldVersion: "1",
      newVersion: "2",
      newPublicKeyHash: "mock-new-hash",
      registeredWithHai: false,
      signedAgentJson: "{}",
    };
  }

  async verify(): Promise<{
    jacsId: string;
    registered: boolean;
    registrations: Array<{
      keyId: string;
      algorithm: string;
      signatureJson: string;
      signedAt: string;
    }>;
    dnsVerified: boolean;
    registeredAt: string;
    rawResponse: Record<string, unknown>;
  }> {
    return {
      jacsId: this._jacsId,
      registered: true,
      registrations: [],
      dnsVerified: false,
      registeredAt: new Date().toISOString(),
      rawResponse: {},
    };
  }

  async status(): Promise<{
    jacsId: string;
    registered: boolean;
    registrations: any[];
    dnsVerified: boolean;
    registeredAt: string;
    rawResponse: Record<string, unknown>;
  }> {
    return this.verify();
  }

  async getAgentAttestation(agentId: string): Promise<{
    jacsId: string;
    registered: boolean;
    registrations: any[];
    dnsVerified: boolean;
    registeredAt: string;
    rawResponse: Record<string, unknown>;
  }> {
    return {
      jacsId: agentId,
      registered: true,
      registrations: [],
      dnsVerified: false,
      registeredAt: new Date().toISOString(),
      rawResponse: {},
    };
  }

  async testConnection(): Promise<boolean> {
    return true;
  }

  async updateUsername(agentId: string, username: string): Promise<{
    username: string;
    email: string;
    previousUsername: string;
  }> {
    this._agentEmail = `${username}@hai.ai`;
    return {
      username,
      email: `${username}@hai.ai`,
      previousUsername: "previous-name",
    };
  }

  async deleteUsername(_agentId: string): Promise<{
    releasedUsername: string;
    cooldownUntil: string;
    message: string;
  }> {
    return {
      releasedUsername: "released-name",
      cooldownUntil: new Date(Date.now() + 3600_000).toISOString(),
      message: "released",
    };
  }

  async verifyDocument(_document: Record<string, unknown> | string): Promise<{
    valid: boolean;
    verifiedAt: string;
    documentType: string;
    issuerVerified: boolean;
    signatureVerified: boolean;
    signerId: string;
    signedAt: string;
    error?: string;
  }> {
    return {
      valid: true,
      verifiedAt: new Date().toISOString(),
      documentType: "message",
      issuerVerified: true,
      signatureVerified: true,
      signerId: this._jacsId,
      signedAt: new Date().toISOString(),
    };
  }

  async getVerification(agentId: string): Promise<{
    agentId: string;
    verification: { jacsValid: boolean; dnsValid: boolean; haiRegistered: boolean; badge: string };
    haiSignatures: string[];
    verifiedAt: string;
    errors: string[];
    rawResponse: Record<string, unknown>;
  }> {
    return {
      agentId,
      verification: { jacsValid: true, dnsValid: true, haiRegistered: true, badge: "attested" },
      haiSignatures: ["mock-sig"],
      verifiedAt: new Date().toISOString(),
      errors: [],
      rawResponse: {},
    };
  }

  async verifyAgentDocumentOnHai(
    _agentJson: Record<string, unknown> | string,
    _options?: { publicKey?: string; domain?: string },
  ): Promise<{
    agentId: string;
    verification: { jacsValid: boolean; dnsValid: boolean; haiRegistered: boolean; badge: string };
    haiSignatures: string[];
    verifiedAt: string;
    errors: string[];
    rawResponse: Record<string, unknown>;
  }> {
    return {
      agentId: this._jacsId,
      verification: { jacsValid: true, dnsValid: true, haiRegistered: true, badge: "attested" },
      haiSignatures: ["mock-sig"],
      verifiedAt: new Date().toISOString(),
      errors: [],
      rawResponse: {},
    };
  }

  async verifyAgent(_agentDocument: Record<string, unknown> | string): Promise<{
    signatureValid: boolean;
    dnsVerified: boolean;
    haiRegistered: boolean;
    badgeLevel: string;
    jacsId: string;
    version: string;
    errors: string[];
    rawResponse?: Record<string, unknown>;
  }> {
    return {
      signatureValid: true,
      dnsVerified: true,
      haiRegistered: true,
      badgeLevel: "attested",
      jacsId: this._jacsId,
      version: "1.0.0",
      errors: [],
      rawResponse: {},
    };
  }

  signMessage(message: string): string {
    return "mock-signed-" + message.slice(0, 20);
  }

  buildAuthHeader(): string {
    return `JACS ${this._jacsId}:1234567890:mock-signature`;
  }

  verifyHaiMessage(_message: string, _signature: string, _haiPublicKey?: string): boolean {
    return true;
  }

  exportKeys(): { publicKeyPem: string; privateKeyPem?: string } {
    return {
      publicKeyPem: "-----BEGIN PUBLIC KEY-----\nmock-public-key\n-----END PUBLIC KEY-----\n",
      privateKeyPem: "-----BEGIN PRIVATE KEY-----\nmock-private-key\n-----END PRIVATE KEY-----\n",
    };
  }

  // Email methods

  async sendEmail(_options: {
    to: string;
    subject: string;
    body: string;
    inReplyTo?: string;
    attachments?: Array<{ filename: string; contentType: string; data: Buffer }>;
  }): Promise<{ messageId: string; status: string }> {
    return { messageId: "msg-1", status: "queued" };
  }

  async listMessages(_options?: {
    limit?: number;
    offset?: number;
    direction?: "inbound" | "outbound";
  }): Promise<Array<Record<string, unknown>>> {
    return [
      {
        id: "msg-1",
        direction: "inbound",
        fromAddress: "sender@hai.ai",
        toAddress: `${this._jacsId}@hai.ai`,
        subject: "Hello",
        bodyText: "Test",
        messageId: "internet-id-1",
        inReplyTo: null,
        isRead: false,
        deliveryStatus: "delivered",
        createdAt: new Date().toISOString(),
        readAt: null,
        jacsVerified: true,
      },
    ];
  }

  async getMessage(messageId: string): Promise<Record<string, unknown>> {
    return {
      id: messageId,
      direction: "inbound",
      fromAddress: "sender@hai.ai",
      toAddress: `${this._jacsId}@hai.ai`,
      subject: "Hello",
      bodyText: "Test",
      messageId: "internet-id-1",
      inReplyTo: null,
      isRead: false,
      deliveryStatus: "delivered",
      createdAt: new Date().toISOString(),
      readAt: null,
      jacsVerified: true,
    };
  }

  /**
   * Test-tunable override of `getRawEmail`. Set in a test via
   *   (client as any).getRawEmailOverride = async (_id) => ({...});
   * to return a specific scenario (available: false, oversize, etc.).
   * Default returns the canonical "mock raw MIME" bytes so calling code
   * has something to verify against.
   */
  getRawEmailOverride: ((messageId: string) => Promise<Record<string, unknown>>) | null = null;

  async getRawEmail(messageId: string): Promise<{
    messageId: string;
    rfcMessageId: string | null;
    available: boolean;
    rawEmail: Buffer | null;
    sizeBytes: number | null;
    omittedReason: string | null;
  }> {
    if (this.getRawEmailOverride) {
      const r = await this.getRawEmailOverride(messageId);
      return r as any;
    }
    const mockRaw = Buffer.from(
      "From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: mock\r\n\r\nbody\r\n",
      "utf-8",
    );
    return {
      messageId,
      rfcMessageId: "<mock-internet-id@example.com>",
      available: true,
      rawEmail: mockRaw,
      sizeBytes: mockRaw.length,
      omittedReason: null,
    };
  }

  async markRead(_messageId: string): Promise<void> {}

  async markUnread(_messageId: string): Promise<void> {}

  async deleteMessage(_messageId: string): Promise<void> {}

  async searchMessages(options: {
    query: string;
    limit?: number;
    offset?: number;
    direction?: "inbound" | "outbound";
    fromAddress?: string;
    toAddress?: string;
  }): Promise<Array<Record<string, unknown>>> {
    return this.listMessages({ limit: options.limit, offset: options.offset, direction: options.direction });
  }

  async getUnreadCount(): Promise<number> {
    return 1;
  }

  async reply(_messageId: string, _body: string, _subjectOverride?: string): Promise<{ messageId: string; status: string }> {
    return { messageId: "msg-reply-1", status: "queued" };
  }

  async forward(_options: {
    messageId: string;
    to: string;
    comment?: string;
  }): Promise<{ messageId: string; status: string }> {
    return { messageId: "msg-fwd-1", status: "queued" };
  }

  async archive(_messageId: string): Promise<void> {}

  async unarchive(_messageId: string): Promise<void> {}

  async getContacts(): Promise<Array<Record<string, unknown>>> {
    return [
      {
        email: "contact@hai.ai",
        displayName: "Test Contact",
        lastContact: new Date().toISOString(),
        jacsVerified: true,
        reputationTier: "free",
      },
    ];
  }

  // ---------------------------------------------------------------------------
  // JACS Document Store (20 methods)
  //
  // Mirrors HaiClient methods at node/src/client.ts:1974-2100.
  // Tests can override any method by setting `(client as any)._overrides.<method> = ...`
  // (note: the existing `getRawEmailOverride` field at line ~548 stays as-is —
  // doc-store methods use the new `_overrides` map; legacy callers are unchanged).
  _overrides: Record<string, ((...args: any[]) => any) | undefined> = {};

  async storeDocument(signedJson: string): Promise<string> {
    if (this._overrides.storeDocument) return this._overrides.storeDocument(signedJson);
    return "mock-key-storeDocument";
  }

  async signAndStore(dataJson: string): Promise<Record<string, unknown>> {
    if (this._overrides.signAndStore) return this._overrides.signAndStore(dataJson);
    return {
      jacsId: "mock-doc-id",
      jacsType: "document",
      jacsVersion: "1",
      data: dataJson,
    };
  }

  async getDocument(key: string): Promise<string> {
    if (this._overrides.getDocument) return this._overrides.getDocument(key);
    return JSON.stringify({ jacsId: "mock-doc-id", jacsType: "document", jacsVersion: "1", key });
  }

  async getLatestDocument(docId: string): Promise<string> {
    if (this._overrides.getLatestDocument) return this._overrides.getLatestDocument(docId);
    return JSON.stringify({ jacsId: docId, jacsType: "document", jacsVersion: "latest" });
  }

  async getDocumentVersions(docId: string): Promise<string[]> {
    if (this._overrides.getDocumentVersions) return this._overrides.getDocumentVersions(docId);
    return [`${docId}:1`, `${docId}:2`];
  }

  async listDocuments(jacsType?: string | null): Promise<string[]> {
    if (this._overrides.listDocuments) return this._overrides.listDocuments(jacsType);
    return ["mock-key-1", "mock-key-2"];
  }

  async removeDocument(key: string): Promise<void> {
    if (this._overrides.removeDocument) {
      await this._overrides.removeDocument(key);
      return;
    }
    return;
  }

  async updateDocument(docId: string, signedJson: string): Promise<Record<string, unknown>> {
    if (this._overrides.updateDocument) return this._overrides.updateDocument(docId, signedJson);
    return {
      jacsId: docId,
      jacsType: "document",
      jacsVersion: "2",
      data: signedJson,
    };
  }

  async searchDocuments(
    query: string,
    limit = 25,
    offset = 0,
  ): Promise<Record<string, unknown>> {
    if (this._overrides.searchDocuments) return this._overrides.searchDocuments(query, limit, offset);
    return {
      results: [],
      total: 0,
      query,
      limit,
      offset,
    };
  }

  async queryByType(docType: string, limit = 25, offset = 0): Promise<string[]> {
    if (this._overrides.queryByType) return this._overrides.queryByType(docType, limit, offset);
    return ["mock-key-1", "mock-key-2"];
  }

  async queryByField(field: string, value: string, limit = 25, offset = 0): Promise<string[]> {
    if (this._overrides.queryByField) return this._overrides.queryByField(field, value, limit, offset);
    return ["mock-key-1", "mock-key-2"];
  }

  async queryByAgent(agentId: string, limit = 25, offset = 0): Promise<string[]> {
    if (this._overrides.queryByAgent) return this._overrides.queryByAgent(agentId, limit, offset);
    return ["mock-key-1", "mock-key-2"];
  }

  async storageCapabilities(): Promise<Record<string, unknown>> {
    if (this._overrides.storageCapabilities) return this._overrides.storageCapabilities();
    return { backend: "remote", supportsSearch: true, supportsQuery: true };
  }

  async saveMemory(content?: string | null): Promise<string> {
    if (this._overrides.saveMemory) return this._overrides.saveMemory(content);
    return "mock-key-saveMemory";
  }

  async saveSoul(content?: string | null): Promise<string> {
    if (this._overrides.saveSoul) return this._overrides.saveSoul(content);
    return "mock-key-saveSoul";
  }

  async getMemory(): Promise<string | null> {
    if (this._overrides.getMemory) return this._overrides.getMemory();
    return JSON.stringify({ jacsId: "mock-mem-1", jacsType: "memory", content: "mock memory" });
  }

  async getSoul(): Promise<string | null> {
    if (this._overrides.getSoul) return this._overrides.getSoul();
    return JSON.stringify({ jacsId: "mock-soul-1", jacsType: "soul", content: "mock soul" });
  }

  async storeTextFile(path: string): Promise<string> {
    if (this._overrides.storeTextFile) return this._overrides.storeTextFile(path);
    return "mock-key-storeTextFile";
  }

  async storeImageFile(path: string): Promise<string> {
    if (this._overrides.storeImageFile) return this._overrides.storeImageFile(path);
    return "mock-key-storeImageFile";
  }

  async getRecordBytes(key: string): Promise<Uint8Array> {
    if (this._overrides.getRecordBytes) return this._overrides.getRecordBytes(key);
    return Buffer.from("mock-bytes");
  }

  async getEmailStatus(): Promise<Record<string, unknown>> {
    return {
      email: `${this._jacsId}@hai.ai`,
      status: "active",
      tier: "free",
      billingTier: "free",
      messagesSent24h: 0,
      dailyLimit: 100,
      dailyUsed: 0,
      resetsAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
      messagesSentTotal: 0,
      externalEnabled: false,
      externalSendsToday: 0,
      lastTierChange: null,
    };
  }

  async signEmail(_rawEmail: Buffer | string): Promise<Buffer> {
    return Buffer.from("mock-signed-email");
  }

  async verifyEmail(_rawEmail: Buffer | string): Promise<Record<string, unknown>> {
    return {
      valid: true,
      jacsId: this._jacsId,
      algorithm: "Ed25519",
      reputationTier: "free",
      dnsVerified: false,
      fieldResults: [],
      chain: [],
      error: null,
    };
  }

  // Benchmark methods

  async freeChaoticRun(_options?: { transport?: "sse" | "ws" }): Promise<Record<string, unknown>> {
    return {
      success: true,
      runId: "run-free-1",
      transcript: [],
      upsellMessage: "upgrade",
      rawResponse: {},
    };
  }

  async proRun(options?: {
    transport?: "sse" | "ws";
    pollIntervalMs?: number;
    pollTimeoutMs?: number;
    onCheckoutUrl?: (url: string) => void;
  }): Promise<Record<string, unknown>> {
    if (options?.onCheckoutUrl) {
      options.onCheckoutUrl("https://checkout.hai.ai/mock-session");
    }
    return {
      success: true,
      runId: "run-dns-1",
      score: 88,
      transcript: [],
      paymentId: "pay-mock-1",
      rawResponse: {},
    };
  }

  async submitResponse(
    jobId: string,
    _message: string,
    _options?: { metadata?: Record<string, unknown>; processingTimeMs?: number },
  ): Promise<Record<string, unknown>> {
    return {
      success: true,
      jobId,
      message: "accepted",
      rawResponse: {},
    };
  }

  async benchmark(name = "mediation_basic", tier = "free"): Promise<Record<string, unknown>> {
    return {
      name,
      tier,
      run_id: "run-legacy-1",
      score: 75,
    };
  }

  signBenchmarkResult(_benchmarkResult: Record<string, unknown>): { signed_document: string; agent_jacs_id: string } {
    return { signed_document: "{}", agent_jacs_id: this._jacsId };
  }

  // Key lookup methods

  async fetchRemoteKey(
    jacsId: string,
    _version?: string
  ): Promise<{
    jacsId: string;
    version: string;
    publicKey: string;
    publicKeyRawB64: string;
    algorithm: string;
    publicKeyHash: string;
    status: string;
    dnsVerified: boolean;
    createdAt: string;
  }> {
    return {
      jacsId,
      version: "latest",
      publicKey: "-----BEGIN PUBLIC KEY-----\nmock\n-----END PUBLIC KEY-----\n",
      publicKeyRawB64: "",
      algorithm: "Ed25519",
      publicKeyHash: "mock-hash",
      status: "active",
      dnsVerified: false,
      createdAt: new Date().toISOString(),
    };
  }

  async fetchKeyByHash(_publicKeyHash: string): Promise<Record<string, unknown>> {
    return this.fetchRemoteKey(this._jacsId);
  }

  async fetchKeyByEmail(_email: string): Promise<Record<string, unknown>> {
    return this.fetchRemoteKey(this._jacsId);
  }

  async fetchKeyByDomain(_domain: string): Promise<Record<string, unknown>> {
    return this.fetchRemoteKey(this._jacsId);
  }

  async fetchAllKeys(jacsId: string): Promise<{ jacsId: string; keys: any[]; total: number }> {
    return { jacsId, keys: [], total: 0 };
  }

  async fetchServerKeys(): Promise<void> {}

  clearAgentKeyCache(): void {}

  disconnect(): void {}
}

// Error classes matching the real SDK hierarchy

export class HaiError extends Error {
  statusCode?: number;
  responseData?: Record<string, unknown>;
  constructor(message: string, statusCode?: number, responseData?: Record<string, unknown>) {
    super(message);
    this.name = "HaiError";
    this.statusCode = statusCode;
    this.responseData = responseData;
  }
}

export class HaiApiError extends HaiError {
  errorCode: string;
  body: string;
  constructor(message: string, statusCode?: number, responseData?: Record<string, unknown>, errorCode = "", body = "") {
    super(message, statusCode, responseData);
    this.name = "HaiApiError";
    this.errorCode = errorCode;
    this.body = body;
  }
}

export class AuthenticationError extends HaiError {
  constructor(message: string, statusCode?: number) {
    super(message, statusCode);
    this.name = "AuthenticationError";
  }
}

export class HaiConnectionError extends HaiError {
  constructor(message: string) {
    super(message);
    this.name = "HaiConnectionError";
  }
}

export class EmailNotActiveError extends HaiApiError {
  constructor(message: string, statusCode = 403, body = "") {
    super(message, statusCode, undefined, "EMAIL_NOT_ACTIVE", body);
    this.name = "EmailNotActiveError";
  }
}

export class RecipientNotFoundError extends HaiApiError {
  constructor(message: string, statusCode = 400, body = "") {
    super(message, statusCode, undefined, "RECIPIENT_NOT_FOUND", body);
    this.name = "RecipientNotFoundError";
  }
}

export class RateLimitedError extends HaiApiError {
  constructor(message: string, statusCode = 429, body = "") {
    super(message, statusCode, undefined, "RATE_LIMITED", body);
    this.name = "RateLimitedError";
  }
}

export const MAX_VERIFY_URL_LEN = 2048;
export const MAX_VERIFY_DOCUMENT_BYTES = 1515;
