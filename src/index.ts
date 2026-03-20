/**
 * JACS OpenClaw Plugin
 *
 * Provides post-quantum cryptographic signatures for agent communications.
 *
 * Core Features:
 * - Key generation and secure storage
 * - Document signing and verification
 * - Public key endpoint for discovery
 */

import { JacsAgent, hashString, createConfig } from "@hai.ai/jacs";
import { HaiClient } from "@haiai/haiai";
import { setupCommand } from "./setup";
import { cliCommands } from "./cli";
import { registerGatewayMethods } from "./gateway/wellknown";
import { registerTools } from "./tools";
import {
  PRIVATE_KEY_PASSWORD_ENV,
  PASSWORD_FILE_ENV,
  passwordBootstrapHelp,
  resolvePrivateKeyPassword,
} from "./password";
import { readJacsConfig, resolvePublicKeyPath } from "./jacs-config";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

// Trust level for agent verification (Basic < Domain < Attested)
export type TrustLevel = "basic" | "domain" | "attested";

// Verification claim options
export type VerificationClaim = "unverified" | "verified" | "verified-hai.ai";

// HAI.ai registration result
export interface HaiRegistration {
  verified: boolean;
  verified_at?: string;
  registration_type: string;
  agent_id: string;
  public_key_hash: string;
}

// Attestation status for an agent
export interface AttestationStatus {
  agentId: string;
  trustLevel: TrustLevel;
  verificationClaim: VerificationClaim;
  domain?: string;
  haiRegistration?: HaiRegistration | null;
  dnsVerified?: boolean;
  timestamp: string;
}

export interface JACSPluginConfig {
  keyAlgorithm: string;
  /** @deprecated OpenClaw transport-level concern; use explicit signing tools or JACS transport adapters. */
  autoSign: boolean;
  /** @deprecated OpenClaw transport-level concern; use explicit verification tools or JACS transport adapters. */
  autoVerify: boolean;
  agentName?: string;
  agentDescription?: string;
  agentDomain?: string;
  agentId?: string;
  verificationClaim?: VerificationClaim;
  haiApiUrl?: string;
}

export interface OpenClawPluginAPI {
  config: JACSPluginConfig;
  logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
    debug: (msg: string) => void;
  };
  runtime: {
    homeDir: string;
    fs: typeof fs;
    jacs?: JACSRuntime;
  };
  registerCli: (registrar: any, opts?: any) => void;
  registerCommand: (opts: any) => void;
  registerTool: (opts: any, options?: { optional?: boolean }) => void;
  registerGatewayMethod?: (opts: any) => void;
  registerHttpRoute?: (opts: any) => void;
  updateConfig?: (update: Partial<JACSPluginConfig>) => void;
  invoke: (command: string, args: any) => Promise<any>;
}

export interface JACSRuntime {
  isInitialized: () => boolean;
  getAgent: () => JacsAgent | null;
  signDocument: (doc: any) => string;
  verifyDocument: (doc: string) => any;
  getAgentId: () => string | undefined;
  getPublicKey: () => string;
  getHaiClient: () => Promise<HaiClient | null>;
}

// Agent instance (replaces deprecated global singleton)
let agentInstance: JacsAgent | null = null;
let isInitialized = false;
let currentAgentId: string | undefined;
let publicKeyContent: string | undefined;
let haiClientPromise: Promise<HaiClient | null> | null = null;

/**
 * Main plugin registration function called by OpenClaw
 */
export function register(api: OpenClawPluginAPI): void {
  const config = api.config;
  const logger = api.logger;

  // Kept for backward compatibility in config schema; not implemented by this plugin runtime.
  if (config.autoSign) {
    logger.warn(
      "Config `autoSign` is deprecated/no-op in moltyjacs. Use jacs_sign or JACS transport adapters for automatic signing."
    );
  }
  if (config.autoVerify === false) {
    logger.warn(
      "Config `autoVerify` is deprecated/no-op in moltyjacs. Use jacs_verify_* tools or JACS transport adapters for verification."
    );
  }

  // Determine JACS directories
  const homeDir = api.runtime?.homeDir || os.homedir();
  const jacsDir = path.join(homeDir, ".openclaw", "jacs");
  const keysDir = path.join(homeDir, ".openclaw", "jacs_keys");
  const configPath = path.join(jacsDir, "jacs.config.json");

  // Resolve password once and reuse for both JACS init and lazy HaiClient creation.
  // Must happen before the PASSWORD_FILE_ENV cleanup below, which deletes the env var.
  const resolvedPassword = resolvePrivateKeyPassword({ requirePassword: false });

  // Try to initialize JACS if config exists
  if (fs.existsSync(configPath)) {
    try {

      // Use JacsAgent class instead of deprecated global load()
      agentInstance = new JacsAgent();
      if (resolvedPassword) {
        // Pass password directly to JACS core — no env var manipulation needed
        agentInstance.setPrivateKeyPassword(resolvedPassword.password);
        if (resolvedPassword.source === "file") {
          delete process.env[PASSWORD_FILE_ENV];
        }
      }
      // JACS core will use the password set above, or fall back to OS keychain
      agentInstance.loadSync(configPath);
      currentAgentId = config.agentId;

      // Load public key
      const jacsConfig = readJacsConfig(configPath);
      const pubKeyPath = resolvePublicKeyPath(keysDir, jacsConfig);
      if (fs.existsSync(pubKeyPath)) {
        publicKeyContent = fs.readFileSync(pubKeyPath, "utf-8");
      }

      isInitialized = true;
      logger.info("JACS initialized successfully");
    } catch (err: any) {
      const message = err?.message || String(err);
      logger.warn(`JACS not initialized - run 'openclaw haiai init': ${message}`);
      const lowerMessage = message.toLowerCase();
      const alreadyHasBootstrapHelp =
        message.includes("Password bootstrap options") ||
        message.includes(PRIVATE_KEY_PASSWORD_ENV);
      if (!alreadyHasBootstrapHelp && lowerMessage.includes("password")) {
        logger.warn(passwordBootstrapHelp());
      }
      agentInstance = null;
    }
  } else {
    logger.info("JACS not configured - run 'openclaw haiai init' to set up");
  }

  // Register CLI commands (Commander.js-style registrar)
  const commands = cliCommands(api);
  const initHandler = setupCommand(api);

  if (api.registerCli) {
    api.registerCli(({ program }: any) => {
      const haiai = program.command("haiai").description("HAI.AI cryptographic provenance commands");

      // Register init subcommand
      const initCmd = haiai.command("init").description(
        "Initialize JACS with key generation"
      );
      initCmd.option("--algorithm <algo>", "Key algorithm");
      initCmd.option("--name <name>", "Agent name");
      initCmd.option("--description <description>", "Agent description");
      initCmd.option("--domain <domain>", "Agent domain");
      initCmd.option("--password-file <path>", "Password file path");
      initCmd.action(async (opts: any) => {
        const result = await initHandler(opts);
        if (result.text) console.log(result.text);
      });

      // Register all other subcommands from cliCommands (skip init — registered above)
      for (const [name, cmd] of Object.entries(commands)) {
        if (name === "init") continue;
        const sub = haiai.command(name).description(cmd.description);
        if (cmd.args) {
          for (const arg of cmd.args) {
            if (arg.startsWith("[--") || arg.startsWith("--")) {
              const match = arg.match(/--(\S+)\s*(?:<(\S+)>)?/);
              if (match) sub.option(`--${match[1]}${match[2] ? ` <${match[2]}>` : ""}`, "");
            } else {
              sub.argument(arg, "");
            }
          }
        }
        sub.action(async (...actionArgs: any[]) => {
          // Commander passes positional args then opts then command
          const opts = actionArgs.length > 1 ? actionArgs[actionArgs.length - 2] : {};
          const positional = actionArgs.length > 2 ? actionArgs.slice(0, -2) : [];
          // Map positional args to named params based on arg definitions
          const args: any = { ...opts, _: positional };
          if (cmd.args) {
            const positionalDefs = cmd.args.filter(a => !a.startsWith("-"));
            positionalDefs.forEach((def, i) => {
              const paramName = def.replace(/[<>\[\]]/g, "");
              if (positional[i] !== undefined) args[paramName] = positional[i];
            });
          }
          const result = await cmd.handler(args);
          if (result.text) console.log(result.text);
        });
      }
    }, { commands: ["haiai"] });
  }

  // Register agent tools for AI use
  registerTools(api);

  // Register gateway methods for well-known endpoints
  registerGatewayMethods(api);

  // Lazy HaiClient initialization using JACS config.
  // HaiClient.create() accepts a password option which it passes to the
  // internal JacsAgent via setPrivateKeyPassword() — no env var manipulation.
  const haiClientConfigPath = configPath;
  const haiApiUrl = config.haiApiUrl;
  const cachedPassword = resolvedPassword?.password;

  function getHaiClient(): Promise<HaiClient | null> {
    if (!haiClientPromise) {
      haiClientPromise = (async () => {
        try {
          return await HaiClient.create({
            configPath: haiClientConfigPath,
            url: haiApiUrl,
            password: cachedPassword,
          });
        } catch (err: any) {
          logger.warn(`HaiClient not available: ${err.message}`);
          return null;
        }
      })();
    }
    return haiClientPromise;
  }

  // Expose JACS runtime for other plugins
  api.runtime.jacs = {
    isInitialized: () => isInitialized,
    getAgent: () => agentInstance,
    signDocument: (doc: any) => {
      if (!agentInstance) throw new Error("JACS not initialized");
      return agentInstance.signRequest(doc);
    },
    verifyDocument: (doc: string) => {
      if (!agentInstance) throw new Error("JACS not initialized");
      return agentInstance.verifyResponse(doc);
    },
    getAgentId: () => currentAgentId,
    getPublicKey: () => publicKeyContent || "",
    getHaiClient,
  };

  logger.debug("JACS plugin registered");
}

// Re-export for use by other modules
export { JacsAgent, hashString, createConfig } from "@hai.ai/jacs";
export * from "@haiai/haiai";

// Export internal state accessor for reinit after setup
export function setAgentInstance(agent: JacsAgent, agentId: string, publicKey: string): void {
  agentInstance = agent;
  currentAgentId = agentId;
  publicKeyContent = publicKey;
  isInitialized = true;
}

export default register;

export { setupCommand } from "./setup";
export { cliCommands } from "./cli";
export { registerTools } from "./tools";
export { registerGatewayMethods } from "./gateway/wellknown";
