/**
 * JACS Gateway Methods
 *
 * Serves .well-known endpoints for JACS agent discovery.
 */

import { hashString } from "@hai.ai/jacs";
import * as fs from "fs";
import * as path from "path";
import type { OpenClawPluginAPI, AttestationStatus } from "../index";
import { generateA2AWellKnownDocuments } from "../a2a";
import { resolveDnsRecord } from "../tools";
import { determineTrustLevel } from "../tools/hai";
import { readJacsConfig, resolveConfigRelativePath, resolvePublicKeyPath } from "../jacs-config";

export interface GatewayRequest {
  method: string;
  path: string;
  body?: any;
  headers?: Record<string, string>;
  query?: Record<string, string>;
}

export interface GatewayResponse {
  status: (code: number) => GatewayResponse;
  json: (data: any) => void;
  send: (data: string) => void;
  setHeader: (name: string, value: string) => void;
}

/**
 * Register gateway methods for well-known endpoints
 */
export function registerGatewayMethods(api: OpenClawPluginAPI): void {
  const homeDir = api.runtime.homeDir;
  const keysDir = path.join(homeDir, ".openclaw", "jacs_keys");
  const configPath = path.join(homeDir, ".openclaw", "jacs", "jacs.config.json");

  async function serveGeneratedWellKnownDocument(
    docPath: string,
    res: GatewayResponse,
  ): Promise<void> {
    if (!api.runtime.jacs?.isInitialized()) {
      res.status(503).json({
        error: "JACS not initialized",
        message: "Run 'openclaw jacs init' to configure JACS",
      });
      return;
    }

    try {
      const { documents } = await generateA2AWellKnownDocuments(api);
      const document = documents[docPath];
      if (!document) {
        res.status(404).json({ error: `No document generated for ${docPath}` });
        return;
      }

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.json(document);
    } catch (err: any) {
      api.logger.error(`Failed to serve ${docPath}: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  }

  // Serve /.well-known/jacs-pubkey.json
  api.registerGatewayMethod({
    method: "GET",
    path: "/.well-known/jacs-pubkey.json",
    handler: async (req: GatewayRequest, res: GatewayResponse) => {
      if (!api.runtime.jacs?.isInitialized()) {
        res.status(503).json({
          error: "JACS not initialized",
          message: "Run 'openclaw jacs init' to configure JACS",
        });
        return;
      }

      try {
        const config = api.config;
        const jacsConfig = readJacsConfig(configPath);
        const publicKeyPath = resolvePublicKeyPath(keysDir, jacsConfig);

        if (!fs.existsSync(publicKeyPath)) {
          res.status(404).json({ error: "Public key not found" });
          return;
        }

        const publicKey = fs.readFileSync(publicKeyPath, "utf-8");
        const publicKeyHash = hashString(publicKey);

        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.json({
          publicKey,
          publicKeyHash,
          algorithm: config.keyAlgorithm || "pq2025",
          agentId: config.agentId,
          agentName: config.agentName,
          agentDomain: config.agentDomain,
          verificationClaim: config.verificationClaim || "unverified",
          timestamp: new Date().toISOString(),
        });
      } catch (err: any) {
        api.logger.error(`Failed to serve public key: ${err.message}`);
        res.status(500).json({ error: err.message });
      }
    },
  });

  // Serve /.well-known/agent-card.json
  api.registerGatewayMethod({
    method: "GET",
    path: "/.well-known/agent-card.json",
    handler: async (_req: GatewayRequest, res: GatewayResponse) => {
      await serveGeneratedWellKnownDocument("/.well-known/agent-card.json", res);
    },
  });

  // Serve /.well-known/jwks.json
  api.registerGatewayMethod({
    method: "GET",
    path: "/.well-known/jwks.json",
    handler: async (_req: GatewayRequest, res: GatewayResponse) => {
      await serveGeneratedWellKnownDocument("/.well-known/jwks.json", res);
    },
  });

  // Serve /.well-known/jacs-agent.json
  api.registerGatewayMethod({
    method: "GET",
    path: "/.well-known/jacs-agent.json",
    handler: async (_req: GatewayRequest, res: GatewayResponse) => {
      await serveGeneratedWellKnownDocument("/.well-known/jacs-agent.json", res);
    },
  });

  // Serve /.well-known/jacs-extension.json
  api.registerGatewayMethod({
    method: "GET",
    path: "/.well-known/jacs-extension.json",
    handler: async (_req: GatewayRequest, res: GatewayResponse) => {
      await serveGeneratedWellKnownDocument("/.well-known/jacs-extension.json", res);
    },
  });

  // POST /jacs/verify - Public verification endpoint
  api.registerGatewayMethod({
    method: "POST",
    path: "/jacs/verify",
    handler: async (req: GatewayRequest, res: GatewayResponse) => {
      if (!api.runtime.jacs?.isInitialized()) {
        res.status(503).json({ error: "JACS not initialized" });
        return;
      }

      try {
        if (!req.body) {
          res.status(400).json({ error: "Request body required" });
          return;
        }

        const agent = api.runtime.jacs?.getAgent();
        if (!agent) {
          res.status(503).json({ error: "JACS not initialized" });
          return;
        }

        const result = agent.verifyResponse(JSON.stringify(req.body));
        res.json(result);
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    },
  });

// NOTE: No external signing endpoint is exposed.
  // Signing MUST only happen internally by the agent itself.
  // External signing would compromise the agent's identity.

  // GET /jacs/agent - Current self-signed JACS agent document
  api.registerGatewayMethod({
    method: "GET",
    path: "/jacs/agent",
    handler: async (_req: GatewayRequest, res: GatewayResponse) => {
      if (!api.runtime.jacs?.isInitialized()) {
        res.status(503).json({
          error: "JACS not initialized",
          message: "Run 'openclaw jacs init' to configure JACS",
        });
        return;
      }

      try {
        const config = readJacsConfig(configPath);
        if (!config) {
          res.status(404).json({ error: "JACS config not found" });
          return;
        }

        const dataDir = resolveConfigRelativePath(configPath, config.jacs_data_directory);
        const agentIdAndVersion = config.jacs_agent_id_and_version;
        if (!agentIdAndVersion) {
          res.status(404).json({ error: "Agent document metadata missing from config" });
          return;
        }

        const agentPath = path.join(dataDir, "agent", `${agentIdAndVersion}.json`);
        if (!fs.existsSync(agentPath)) {
          res.status(404).json({ error: `Agent document not found at ${agentPath}` });
          return;
        }

        const agentJson = JSON.parse(fs.readFileSync(agentPath, "utf-8"));
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "public, max-age=300");
        res.json(agentJson);
      } catch (err: any) {
        api.logger.error(`Failed to serve agent document: ${err.message}`);
        res.status(500).json({ error: err.message });
      }
    },
  });

  // GET /jacs/status - Health check endpoint
  api.registerGatewayMethod({
    method: "GET",
    path: "/jacs/status",
    handler: async (req: GatewayRequest, res: GatewayResponse) => {
      const config = api.config;
      const initialized = api.runtime.jacs?.isInitialized() || false;

      res.json({
        initialized,
        agentId: config.agentId || null,
        algorithm: config.keyAlgorithm || null,
        verificationClaim: config.verificationClaim || "unverified",
        timestamp: new Date().toISOString(),
      });
    },
  });

  // GET /jacs/attestation - Full attestation status endpoint
  api.registerGatewayMethod({
    method: "GET",
    path: "/jacs/attestation",
    handler: async (req: GatewayRequest, res: GatewayResponse) => {
      if (!api.runtime.jacs?.isInitialized()) {
        res.status(503).json({
          error: "JACS not initialized",
          message: "Run 'openclaw jacs init' to configure JACS",
        });
        return;
      }

      try {
        const config = api.config;
        const jacsConfig = readJacsConfig(configPath);
        const publicKeyPath = resolvePublicKeyPath(keysDir, jacsConfig);

        if (!fs.existsSync(publicKeyPath)) {
          res.status(404).json({ error: "Public key not found" });
          return;
        }

        const publicKey = fs.readFileSync(publicKeyPath, "utf-8");
        const publicKeyHash = hashString(publicKey);

        // Check DNS verification
        let dnsVerified = false;
        if (config.agentDomain) {
          try {
            const dnsResult = await resolveDnsRecord(config.agentDomain);
            if (dnsResult) {
              dnsVerified = dnsResult.parsed.publicKeyHash === publicKeyHash;
            }
          } catch {
            // DNS check failed
          }
        }

        // Check HAI.ai registration via HaiClient
        let haiRegistered = false;
        let haiRegistration = null;
        if (config.agentId) {
          try {
            const haiClient = await api.runtime.jacs?.getHaiClient();
            if (haiClient) {
              const haiResult = await haiClient.verify();
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
            }
          } catch {
            // HAI.ai check failed
          }
        }

        const trustLevel = determineTrustLevel(
          !!config.agentDomain,
          dnsVerified,
          haiRegistered
        );

        const status: AttestationStatus = {
          agentId: config.agentId || "",
          trustLevel,
          verificationClaim: config.verificationClaim || "unverified",
          domain: config.agentDomain,
          haiRegistration,
          dnsVerified,
          timestamp: new Date().toISOString(),
        };

        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "public, max-age=60");
        res.json(status);
      } catch (err: any) {
        api.logger.error(`Failed to get attestation status: ${err.message}`);
        res.status(500).json({ error: err.message });
      }
    },
  });
}
