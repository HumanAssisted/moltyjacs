/**
 * Mock for haisdk
 *
 * Provides stub implementations for unit tests.
 * generateVerifyLink moved here from the jacs mock.
 */

export function generateVerifyLink(document: string, baseUrl = "https://hai.ai"): string {
  const encoded = Buffer.from(document, "utf-8").toString("base64url");
  return `${baseUrl.replace(/\/$/, "")}/jacs/verify?s=${encoded}`;
}

export function verifyString(
  _publicKeyPem: string,
  _message: string,
  _signatureB64: string
): boolean {
  return true;
}

export function signString(_privateKeyPem: string, _message: string): string {
  return "mock-signature-base64";
}

export function generateKeypair(): { publicKeyPem: string; privateKeyPem: string } {
  return {
    publicKeyPem: "-----BEGIN PUBLIC KEY-----\nmock-public-key\n-----END PUBLIC KEY-----\n",
    privateKeyPem: "-----BEGIN PRIVATE KEY-----\nmock-private-key\n-----END PRIVATE KEY-----\n",
  };
}

export class HaiClient {
  private _jacsId: string;
  private _baseUrl: string;

  private constructor(options?: { url?: string }) {
    this._jacsId = "mock-jacs-id";
    this._baseUrl = options?.url ?? "https://hai.ai";
  }

  static async create(options?: { configPath?: string; url?: string }): Promise<HaiClient> {
    return new HaiClient(options);
  }

  static fromCredentials(
    jacsId: string,
    _privateKeyPem: string,
    options?: { url?: string }
  ): HaiClient {
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

  async register(_options?: {
    ownerEmail?: string;
    description?: string;
    domain?: string;
  }): Promise<{
    success: boolean;
    agentId: string;
    jacsId: string;
    haiSignature: string;
    registrationId: string;
    registeredAt: string;
    rawResponse: Record<string, unknown>;
  }> {
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

  async checkUsername(username: string): Promise<{
    available: boolean;
    username: string;
    reason?: string;
  }> {
    return { available: username !== "taken", username, reason: username === "taken" ? "taken" : undefined };
  }

  async claimUsername(agentId: string, username: string): Promise<{
    username: string;
    email: string;
    agentId: string;
  }> {
    return {
      username,
      email: `${username}@hai.ai`,
      agentId,
    };
  }

  async updateUsername(agentId: string, username: string): Promise<{
    username: string;
    email: string;
    previousUsername: string;
  }> {
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

  async sendEmail(_options: {
    to: string;
    subject: string;
    body: string;
    inReplyTo?: string;
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
    };
  }

  async freeChaoticRun(_options?: { transport?: "sse" | "ws" }): Promise<Record<string, unknown>> {
    return {
      success: true,
      runId: "run-free-1",
      transcript: [],
      upsellMessage: "upgrade",
      rawResponse: {},
    };
  }

  async dnsCertifiedRun(options?: {
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

  signMessage(message: string): string {
    return "mock-signed-" + message.slice(0, 20);
  }

  buildAuthHeader(): string {
    return `JACS ${this._jacsId}:1234567890:mock-signature`;
  }

  exportKeys(): { publicKeyPem: string; privateKeyPem: string } {
    return generateKeypair();
  }

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
}

export const MAX_VERIFY_URL_LEN = 2048;
export const MAX_VERIFY_DOCUMENT_BYTES = 1515;
