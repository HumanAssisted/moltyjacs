/**
 * Regression tests: password must never leak to process.env
 *
 * These tests verify that register() and getHaiClient() do not set
 * JACS_PRIVATE_KEY_PASSWORD in process.env. The password should be
 * passed directly via setPrivateKeyPassword() on the JacsAgent instance.
 *
 * See: Issue 018 (cachedPassword undefined for PASSWORD_FILE_ENV)
 *      Issue 019 (missing TDD tests for env var non-leak)
 *      Issue 022 (double password resolution)
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PRIVATE_KEY_PASSWORD_ENV, PASSWORD_FILE_ENV } from "../src/password";
import { register } from "../src/index";

// Save originals before any test manipulation
const originalPasswordEnv = process.env[PRIVATE_KEY_PASSWORD_ENV];
const originalPasswordFileEnv = process.env[PASSWORD_FILE_ENV];

describe("register() does not leak password to env", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "moltyjacs-env-leak-"));
    // Ensure clean env state
    delete process.env[PRIVATE_KEY_PASSWORD_ENV];
    delete process.env[PASSWORD_FILE_ENV];
  });

  afterEach(() => {
    // Restore originals
    if (originalPasswordEnv === undefined) {
      delete process.env[PRIVATE_KEY_PASSWORD_ENV];
    } else {
      process.env[PRIVATE_KEY_PASSWORD_ENV] = originalPasswordEnv;
    }
    if (originalPasswordFileEnv === undefined) {
      delete process.env[PASSWORD_FILE_ENV];
    } else {
      process.env[PASSWORD_FILE_ENV] = originalPasswordFileEnv;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("setup does not leak password to env", () => {
    // Set password via env var
    process.env[PRIVATE_KEY_PASSWORD_ENV] = "setup-test-password";

    // Create minimal JACS filesystem structure for register()
    const jacsDir = path.join(tmpDir, ".openclaw", "jacs");
    const keysDir = path.join(tmpDir, ".openclaw", "jacs_keys");
    fs.mkdirSync(jacsDir, { recursive: true });
    fs.mkdirSync(keysDir, { recursive: true });
    fs.writeFileSync(
      path.join(jacsDir, "jacs.config.json"),
      JSON.stringify({
        jacs_use_security: "true",
        jacs_data_directory: jacsDir,
        jacs_key_directory: keysDir,
      }),
    );

    register({
      config: {
        keyAlgorithm: "pq2025",
        autoSign: false,
        autoVerify: true,
        agentName: "test-agent",
        agentDescription: "test",
        agentId: "test-agent-id",
        haiApiUrl: "https://api.hai.ai",
      },
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      runtime: { homeDir: tmpDir },
      registerCli: () => {},
      registerTool: () => {},
      registerGatewayMethod: () => {},
    } as any);

    // The critical assertion: register() must not have modified the env var.
    // It should still be exactly what we set, not removed or changed.
    expect(process.env[PRIVATE_KEY_PASSWORD_ENV]).toBe("setup-test-password");
  });

  it("getHaiClient does not set JACS_PRIVATE_KEY_PASSWORD env var", () => {
    // Ensure env var is NOT set -- password is absent
    delete process.env[PRIVATE_KEY_PASSWORD_ENV];

    // Create minimal JACS filesystem structure
    const jacsDir = path.join(tmpDir, ".openclaw", "jacs");
    const keysDir = path.join(tmpDir, ".openclaw", "jacs_keys");
    fs.mkdirSync(jacsDir, { recursive: true });
    fs.mkdirSync(keysDir, { recursive: true });
    fs.writeFileSync(
      path.join(jacsDir, "jacs.config.json"),
      JSON.stringify({
        jacs_use_security: "true",
        jacs_data_directory: jacsDir,
        jacs_key_directory: keysDir,
      }),
    );

    register({
      config: {
        keyAlgorithm: "pq2025",
        autoSign: false,
        autoVerify: true,
        agentName: "test-agent",
        agentDescription: "test",
        agentId: "test-agent-id",
        haiApiUrl: "https://api.hai.ai",
      },
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      runtime: { homeDir: tmpDir },
      registerCli: () => {},
      registerTool: () => {},
      registerGatewayMethod: () => {},
    } as any);

    // After register() completes, JACS_PRIVATE_KEY_PASSWORD must remain unset.
    // The register function must not inject passwords into the environment.
    expect(process.env[PRIVATE_KEY_PASSWORD_ENV]).toBeUndefined();
  });
});
