/**
 * Mock for @hai.ai/jacs native module
 *
 * Provides stub implementations so tests can run without the NAPI binary.
 * Actual tool tests use MockJacsAgent from test/setup.ts which is injected
 * via the OpenClawPluginAPI mock - these stubs are only needed so the
 * TypeScript imports resolve.
 */

import * as crypto from "crypto";

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
    private_key_path: (keyDirectory || "./jacs_keys") + "/agent.private.pem.enc",
    public_key_path: (keyDirectory || "./jacs_keys") + "/agent.public.pem",
  });
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
