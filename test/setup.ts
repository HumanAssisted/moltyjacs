/**
 * Shared test infrastructure for moltyjacs tests
 */

import { vi } from "vitest";
import type { OpenClawPluginAPI, JACSPluginConfig, JACSRuntime } from "../src/index";
import { HaiClient } from "haisdk";

// ---------- Mock JacsAgent ----------

export class MockJacsAgent {
  calls: Array<{ method: string; args: any[] }> = [];
  createDocumentResponse: string = "{}";
  updateDocumentResponse: string = "{}";
  verifyDocumentResponse: boolean = true;
  signRequestResponse: string = "{}";
  verifyResponseResult: any = {};
  createAgreementResponse: string = "{}";
  signAgreementResponse: string = "{}";
  checkAgreementResponse: string = "{}";

  private track(method: string, ...args: any[]): void {
    this.calls.push({ method, args });
  }

  load(configPath: string): string {
    this.track("load", configPath);
    return "loaded";
  }

  createDocument(
    documentString: string,
    customSchema?: string | null,
    outputfilename?: string | null,
    noSave?: boolean | null,
    attachments?: string | null,
    embed?: boolean | null
  ): string {
    this.track("createDocument", documentString, customSchema, outputfilename, noSave, attachments, embed);
    // Merge input with mock response to simulate signing
    const input = JSON.parse(documentString);
    const response = {
      ...input,
      jacsId: input.jacsId || "mock-doc-id-" + Math.random().toString(36).slice(2, 8),
      jacsVersion: "mock-version-" + Math.random().toString(36).slice(2, 8),
      jacsVersionDate: new Date().toISOString(),
      jacsOriginalVersion: "mock-original-version",
      jacsOriginalDate: new Date().toISOString(),
      jacsSignature: {
        agentID: "mock-agent-id",
        agentVersion: "mock-agent-version",
        date: new Date().toISOString(),
        signature: "mock-signature-base64",
        publicKeyHash: "mock-pubkey-hash",
        signingAlgorithm: "pq2025",
      },
      jacsSha256: "mock-sha256-hash",
    };
    return JSON.stringify(response);
  }

  updateDocument(
    documentKey: string,
    newDocumentString: string,
    attachments?: string[] | null,
    embed?: boolean | null
  ): string {
    this.track("updateDocument", documentKey, newDocumentString, attachments, embed);
    const input = JSON.parse(newDocumentString);
    const response = {
      ...input,
      jacsVersion: "mock-updated-version-" + Math.random().toString(36).slice(2, 8),
      jacsVersionDate: new Date().toISOString(),
      jacsSignature: {
        agentID: "mock-agent-id",
        agentVersion: "mock-agent-version",
        date: new Date().toISOString(),
        signature: "mock-updated-signature",
        publicKeyHash: "mock-pubkey-hash",
        signingAlgorithm: "pq2025",
      },
      jacsSha256: "mock-updated-sha256",
    };
    return JSON.stringify(response);
  }

  verifyDocument(documentString: string): boolean {
    this.track("verifyDocument", documentString);
    return this.verifyDocumentResponse;
  }

  signRequest(params: any): string {
    this.track("signRequest", params);
    return this.signRequestResponse;
  }

  verifyResponse(documentString: string): any {
    this.track("verifyResponse", documentString);
    return this.verifyResponseResult;
  }

  verifyResponseWithAgentId(documentString: string): any {
    this.track("verifyResponseWithAgentId", documentString);
    return this.verifyResponseResult;
  }

  createAgreement(
    documentString: string,
    agentids: string[],
    question?: string | null,
    context?: string | null,
    agreementFieldname?: string | null
  ): string {
    this.track("createAgreement", documentString, agentids, question, context, agreementFieldname);
    return this.createAgreementResponse;
  }

  signAgreement(documentString: string, agreementFieldname?: string | null): string {
    this.track("signAgreement", documentString, agreementFieldname);
    return this.signAgreementResponse;
  }

  checkAgreement(documentString: string, agreementFieldname?: string | null): string {
    this.track("checkAgreement", documentString, agreementFieldname);
    return this.checkAgreementResponse;
  }

  verifyAgent(agentfile?: string | null): boolean {
    this.track("verifyAgent", agentfile);
    return true;
  }

  verifySignature(documentString: string, signatureField?: string | null): boolean {
    this.track("verifySignature", documentString, signatureField);
    return true;
  }

  signString(data: string): string {
    this.track("signString", data);
    return "mock-signature";
  }

  updateAgent(newAgentString: string): string {
    this.track("updateAgent", newAgentString);
    return newAgentString;
  }

  getLastCall(method: string): { method: string; args: any[] } | undefined {
    return [...this.calls].reverse().find((c) => c.method === method);
  }

  getCallCount(method: string): number {
    return this.calls.filter((c) => c.method === method).length;
  }

  reset(): void {
    this.calls = [];
  }
}

// ---------- Mock OpenClawPluginAPI ----------

export function createMockApi(options?: {
  initialized?: boolean;
  agentId?: string;
  agentName?: string;
  agentDomain?: string;
  verificationClaim?: string;
  publicKey?: string;
  mockAgent?: MockJacsAgent;
}): OpenClawPluginAPI & { mockAgent: MockJacsAgent; registeredTools: Map<string, any> } {
  const mockAgent = options?.mockAgent || new MockJacsAgent();
  const registeredTools = new Map<string, any>();
  const registeredCommands = new Map<string, any>();
  const registeredGatewayMethods = new Map<string, any>();

  const config: JACSPluginConfig = {
    keyAlgorithm: "pq2025",
    autoSign: false,
    autoVerify: true,
    agentName: options?.agentName || "test-agent",
    agentDescription: "Test agent for unit tests",
    agentDomain: options?.agentDomain,
    agentId: options?.agentId || "test-agent-id",
    verificationClaim: (options?.verificationClaim as any) || "unverified",
    haiApiUrl: "https://api.hai.ai",
  };

  let mockHaiClient: HaiClient | null = null;
  try {
    mockHaiClient = HaiClient.fromCredentials(
      options?.agentId || "test-agent-id",
      "-----BEGIN PRIVATE KEY-----\nmock\n-----END PRIVATE KEY-----\n",
    );
  } catch {
    // Mock HaiClient may not support fromCredentials in test mock
  }

  const runtime: { homeDir: string; fs: typeof import("fs"); jacs?: JACSRuntime } = {
    homeDir: "/tmp/test-home",
    fs: require("fs"),
    jacs: options?.initialized !== false
      ? {
          isInitialized: () => true,
          getAgent: () => mockAgent as any,
          signDocument: (doc: any) => mockAgent.signRequest(doc),
          verifyDocument: (doc: string) => mockAgent.verifyResponse(doc),
          getAgentId: () => options?.agentId || "test-agent-id",
          getPublicKey: () => options?.publicKey || "mock-public-key-pem",
          getHaiClient: async () => mockHaiClient,
        }
      : undefined,
  };

  const api = {
    config,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    runtime,
    registerCli: vi.fn(),
    registerCommand: vi.fn(),
    registerTool: vi.fn((toolDef: any, toolOptions?: any) => {
      registeredTools.set(toolDef.name, { ...toolDef, _registerOptions: toolOptions });
    }),
    registerGatewayMethod: vi.fn((methodDef: any) => {
      registeredGatewayMethods.set(methodDef.name || methodDef.path, methodDef);
    }),
    updateConfig: vi.fn((update: Partial<JACSPluginConfig>) => {
      Object.assign(config, update);
    }),
    invoke: vi.fn(),
    mockAgent,
    registeredTools,
  };

  return api as any;
}

// ---------- Helper for invoking registered tools ----------

export async function invokeTool(
  api: ReturnType<typeof createMockApi>,
  toolName: string,
  params: any
): Promise<any> {
  const tool = api.registeredTools.get(toolName);
  if (!tool) {
    throw new Error(`Tool not registered: ${toolName}. Available: ${[...api.registeredTools.keys()].join(", ")}`);
  }
  if (typeof tool.handler === "function") {
    return tool.handler(params);
  }
  if (typeof tool.execute === "function") {
    return tool.execute("test-invocation", params);
  }
  throw new Error(`Tool ${toolName} has no handler or execute function`);
}
