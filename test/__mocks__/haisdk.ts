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
