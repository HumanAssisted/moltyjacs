/**
 * JACS Setup Wizard
 *
 * Interactive setup for generating keys and creating agent identity.
 */

import { JacsAgent, createAgent } from "@hai.ai/jacs";
import { v4 as uuidv4 } from "uuid";
import * as path from "path";
import * as fs from "fs";
import type { OpenClawPluginAPI } from "./index";
import { setAgentInstance } from "./index";
import {
  PRIVATE_KEY_PASSWORD_ENV,
  resolvePrivateKeyPassword,
} from "./password";

export interface SetupOptions {
  keyAlgorithm: string;
  agentName: string;
  agentDescription: string;
  agentDomain?: string;
  keyPassword: string;
  passwordSourceName: string;
}

export interface SetupResult {
  text: string;
  agentId?: string;
  configPath?: string;
  error?: string;
}

/**
 * Creates the setup command handler
 */
export function setupCommand(api: OpenClawPluginAPI) {
  return async (ctx: any): Promise<SetupResult> => {
    const logger = api.logger;
    const homeDir = api.runtime.homeDir;
    let originalPasswordEnv: string | undefined;

    try {
      // Get setup options from args or use defaults
      const options = parseSetupOptions(ctx.args);

      const jacsDir = path.join(homeDir, ".openclaw", "jacs");
      const keysDir = path.join(homeDir, ".openclaw", "jacs_keys");
      const configPath = path.join(jacsDir, "jacs.config.json");

      // Check if already initialized
      if (fs.existsSync(configPath)) {
        const existingConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        return {
          text: `JACS already initialized.\n\nAgent ID: ${existingConfig.jacs_agent_id_and_version?.split(":")[0]}\nConfig: ${configPath}\n\nUse 'openclaw jacs rotate' to rotate keys or delete ${jacsDir} to reinitialize.`,
        };
      }

      // Create directories with secure permissions
      fs.mkdirSync(jacsDir, { recursive: true, mode: 0o700 });
      fs.mkdirSync(keysDir, { recursive: true, mode: 0o700 });
      fs.mkdirSync(path.join(jacsDir, "agent"), { recursive: true });
      fs.mkdirSync(path.join(jacsDir, "documents"), { recursive: true });
      logger.info(`Generating ${options.keyAlgorithm} key pair...`);

      // JACS load() now expects a pre-existing agent document; use createAgent
      // first so keys, config, and agent identity are created atomically.
      originalPasswordEnv = process.env[PRIVATE_KEY_PASSWORD_ENV];
      process.env[PRIVATE_KEY_PASSWORD_ENV] = options.keyPassword;

      const createdRaw = await createAgent(
        options.agentName,
        options.keyPassword,
        options.keyAlgorithm,
        jacsDir,
        keysDir,
        configPath,
        "ai",
        options.agentDescription,
        options.agentDomain,
        "fs"
      );

      let created: any = {};
      try {
        created = JSON.parse(createdRaw);
      } catch {
        // Keep created as {} and fall back to reading from config below.
      }

      ensureConfigCompatibility(configPath, {
        dataDir: jacsDir,
        keyDir: keysDir,
        privateKeyFilename: getFilenameOrDefault(created?.private_key_path, "agent.private.pem.enc"),
        publicKeyFilename: getFilenameOrDefault(created?.public_key_path, "agent.public.pem"),
        algorithm: options.keyAlgorithm,
        agentIdAndVersion:
          created?.agent_id && created?.version
            ? `${created.agent_id}:${created.version}`
            : undefined,
      });

      // Load the created agent into runtime
      const agent = new JacsAgent();
      await agent.load(configPath);

      const configData = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      const [configAgentId, configAgentVersion] = parseAgentIdAndVersion(
        configData.jacs_agent_id_and_version
      );
      const agentId = created?.agent_id || configAgentId || uuidv4();
      const agentVersion = created?.version || configAgentVersion;

      logger.info(`Agent created: ${agentId}`);

      const publicKeyPath = path.join(
        keysDir,
        configData.jacs_agent_public_key_filename || "agent.public.pem"
      );
      if (!fs.existsSync(publicKeyPath)) {
        throw new Error(`Public key not found at ${publicKeyPath}`);
      }
      const publicKey = fs.readFileSync(publicKeyPath, "utf-8");

      // Register the ready agent instance with plugin runtime
      setAgentInstance(agent, agentId, publicKey);

      // Update OpenClaw plugin config
      api.updateConfig({
        agentId,
        keyAlgorithm: options.keyAlgorithm,
        agentName: options.agentName,
        agentDescription: options.agentDescription,
        agentDomain: options.agentDomain,
      });

      const passwordLine = `Password source: ${options.passwordSourceName}`;

      return {
        text: `JACS initialized successfully!

Agent ID: ${agentId}
Agent Version: ${agentVersion || "unknown"}
Algorithm: ${options.keyAlgorithm}
Config: ${configPath}
Keys: ${keysDir}
${passwordLine}

Your agent is ready to sign documents. Use:
  openclaw jacs sign <file>     - Sign a document
  openclaw jacs verify <file>   - Verify a signed document
  openclaw jacs status          - Show agent status
  openclaw jacs dns-record <domain> - Generate DNS TXT record

Note: Configure exactly one password source before signing:
  export JACS_PRIVATE_KEY_PASSWORD='your-password'
  # or
  export JACS_PASSWORD_FILE=/run/secrets/jacs_password`,
        agentId,
        configPath,
      };
    } catch (err: any) {
      logger.error(`Setup failed: ${err.message}`);
      return {
        text: `JACS setup failed: ${err.message}`,
        error: err.message,
      };
    } finally {
      if (originalPasswordEnv === undefined) {
        delete process.env[PRIVATE_KEY_PASSWORD_ENV];
      } else {
        process.env[PRIVATE_KEY_PASSWORD_ENV] = originalPasswordEnv;
      }
    }
  };
}

/**
 * Parse setup options from command arguments
 */
function parseSetupOptions(args: any): SetupOptions {
  if (args?.password !== undefined || args?.p !== undefined) {
    throw new Error(
      "The --password option is no longer supported. Use --password-file, JACS_PRIVATE_KEY_PASSWORD, or JACS_PASSWORD_FILE."
    );
  }

  const resolvedPassword = resolvePrivateKeyPassword({
    explicitPasswordFile: args?.passwordFile ?? args?.["password-file"] ?? args?.password_file,
  });

  if (!resolvedPassword) {
    throw new Error("Missing private key password source.");
  }

  return {
    keyAlgorithm: args?.algorithm || args?.a || "pq2025",
    agentName: args?.name || args?.n || "OpenClaw JACS Agent",
    agentDescription:
      args?.description || args?.d || "OpenClaw agent with JACS cryptographic provenance",
    agentDomain: args?.domain,
    keyPassword: resolvedPassword.password,
    passwordSourceName: resolvedPassword.sourceName,
  };
}

function parseAgentIdAndVersion(value?: string): [string | undefined, string | undefined] {
  if (!value || typeof value !== "string") {
    return [undefined, undefined];
  }
  const [agentId, agentVersion] = value.split(":");
  return [agentId || undefined, agentVersion || undefined];
}

function getFilenameOrDefault(fullPath: unknown, fallback: string): string {
  if (typeof fullPath !== "string" || fullPath.trim() === "") {
    return fallback;
  }
  return path.basename(fullPath);
}

function ensureConfigCompatibility(
  configPath: string,
  defaults: {
    dataDir: string;
    keyDir: string;
    privateKeyFilename: string;
    publicKeyFilename: string;
    algorithm: string;
    agentIdAndVersion?: string;
  }
): void {
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  let changed = false;

  const setIfMissing = (key: string, value: string | undefined) => {
    if (!value) return;
    if (config[key] == null || config[key] === "") {
      config[key] = value;
      changed = true;
    }
  };

  setIfMissing("jacs_use_security", "true");
  setIfMissing("jacs_data_directory", defaults.dataDir);
  setIfMissing("jacs_key_directory", defaults.keyDir);
  setIfMissing("jacs_agent_private_key_filename", defaults.privateKeyFilename);
  setIfMissing("jacs_agent_public_key_filename", defaults.publicKeyFilename);
  setIfMissing("jacs_agent_key_algorithm", defaults.algorithm);
  setIfMissing("jacs_default_storage", "fs");
  setIfMissing("jacs_agent_id_and_version", defaults.agentIdAndVersion);

  if (changed) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
  }
}
