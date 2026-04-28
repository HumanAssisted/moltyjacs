import { describe, expect, it, afterEach } from "vitest";
import { createMockApi } from "./setup";
import { setupCommand } from "../src/setup";
import { cliCommands } from "../src/cli";
import * as fs from "fs";
import * as path from "path";

describe("setup command password source policy", () => {
  it("rejects legacy --password argument", async () => {
    const api = await createMockApi({ initialized: false });
    const handler = setupCommand(api);
    const result = await handler({ args: { password: "legacy-secret" } });
    expect(result.error).toContain("--password option is no longer supported");
  });

  it("rejects multiple configured password sources", async () => {
    const previous = process.env.JACS_PRIVATE_KEY_PASSWORD;
    try {
      process.env.JACS_PRIVATE_KEY_PASSWORD = "env-secret";
      const api = await createMockApi({ initialized: false });
      const handler = setupCommand(api);
      const result = await handler({ args: { passwordFile: "/tmp/password.txt" } });
      expect(result.error).toContain("Multiple password sources configured");
    } finally {
      if (previous === undefined) {
        delete process.env.JACS_PRIVATE_KEY_PASSWORD;
      } else {
        process.env.JACS_PRIVATE_KEY_PASSWORD = previous;
      }
    }
  });
});

describe("setup command name and key validation", () => {
  it("rejects missing --name argument", async () => {
    const previous = process.env.JACS_PRIVATE_KEY_PASSWORD;
    try {
      process.env.JACS_PRIVATE_KEY_PASSWORD = "test-password";
      const api = await createMockApi({ initialized: false });
      const handler = setupCommand(api);
      const result = await handler({ args: {} });
      expect(result.error).toContain("Agent name is required");
    } finally {
      if (previous === undefined) {
        delete process.env.JACS_PRIVATE_KEY_PASSWORD;
      } else {
        process.env.JACS_PRIVATE_KEY_PASSWORD = previous;
      }
    }
  });

  it("rejects invalid name format (too short)", async () => {
    const previous = process.env.JACS_PRIVATE_KEY_PASSWORD;
    try {
      process.env.JACS_PRIVATE_KEY_PASSWORD = "test-password";
      const api = await createMockApi({ initialized: false });
      const handler = setupCommand(api);
      const result = await handler({ args: { name: "ab" } });
      expect(result.error).toContain("must be 3-30 characters");
    } finally {
      if (previous === undefined) {
        delete process.env.JACS_PRIVATE_KEY_PASSWORD;
      } else {
        process.env.JACS_PRIVATE_KEY_PASSWORD = previous;
      }
    }
  });

  it("rejects invalid name format (uppercase/spaces)", async () => {
    const previous = process.env.JACS_PRIVATE_KEY_PASSWORD;
    try {
      process.env.JACS_PRIVATE_KEY_PASSWORD = "test-password";
      const api = await createMockApi({ initialized: false });
      const handler = setupCommand(api);
      const result = await handler({ args: { name: "A B" } });
      expect(result.error).toContain("Invalid name format");
    } finally {
      if (previous === undefined) {
        delete process.env.JACS_PRIVATE_KEY_PASSWORD;
      } else {
        process.env.JACS_PRIVATE_KEY_PASSWORD = previous;
      }
    }
  });

  it("rejects invalid registration key format", async () => {
    const previous = process.env.JACS_PRIVATE_KEY_PASSWORD;
    try {
      process.env.JACS_PRIVATE_KEY_PASSWORD = "test-password";
      const api = await createMockApi({ initialized: false });
      const handler = setupCommand(api);
      const result = await handler({ args: { name: "testbot", key: "invalid" } });
      expect(result.error).toContain("Invalid registration key format");
    } finally {
      if (previous === undefined) {
        delete process.env.JACS_PRIVATE_KEY_PASSWORD;
      } else {
        process.env.JACS_PRIVATE_KEY_PASSWORD = previous;
      }
    }
  });

  it("accepts --register=false without key", async () => {
    const previous = process.env.JACS_PRIVATE_KEY_PASSWORD;
    try {
      process.env.JACS_PRIVATE_KEY_PASSWORD = "test-password";
      const api = await createMockApi({ initialized: false });
      const handler = setupCommand(api);
      // This will fail at createAgent (mocked JACS), but should NOT fail at validation
      const result = await handler({ args: { name: "testbot", register: false } });
      // Should get past validation and fail at the createAgent step (since this is a mock)
      // The error should NOT be about name or key format
      if (result.error) {
        expect(result.error).not.toContain("Agent name is required");
        expect(result.error).not.toContain("Invalid name");
        expect(result.error).not.toContain("Invalid registration key");
      }
    } finally {
      if (previous === undefined) {
        delete process.env.JACS_PRIVATE_KEY_PASSWORD;
      } else {
        process.env.JACS_PRIVATE_KEY_PASSWORD = previous;
      }
    }
  });
});

describe("setup init+register happy path", () => {
  const testHomeDir = path.join("/tmp", "moltyjacs-test-" + process.pid);

  afterEach(() => {
    try {
      fs.rmSync(testHomeDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("setup with --name and --key registers with HAI", async () => {
    const previous = process.env.JACS_PRIVATE_KEY_PASSWORD;
    try {
      process.env.JACS_PRIVATE_KEY_PASSWORD = "test-password-secure";
      const api = await createMockApi({ initialized: false });
      // Override homeDir so setup writes to our temp directory.
      // The mock createAgent writes config + key files to disk when paths
      // are under /tmp, so ensureConfigCompatibility and key reads will work.
      (api.runtime as any).homeDir = testHomeDir;

      const handler = setupCommand(api);
      const result = await handler({
        args: { name: "testbot", key: "hk_" + "a".repeat(64) },
      });

      expect(result.error).toBeUndefined();
      expect(result.text).toContain("JACS initialized successfully");
      expect(result.text).toContain("Registered with HAI");
      expect(result.text).toContain("testbot@hai.ai");
      expect(result.agentId).toBeDefined();
    } finally {
      if (previous === undefined) delete process.env.JACS_PRIVATE_KEY_PASSWORD;
      else process.env.JACS_PRIVATE_KEY_PASSWORD = previous;
    }
  });

  it("setup with --register=false skips registration", async () => {
    const previous = process.env.JACS_PRIVATE_KEY_PASSWORD;
    try {
      process.env.JACS_PRIVATE_KEY_PASSWORD = "test-password-secure";
      const api = await createMockApi({ initialized: false });
      (api.runtime as any).homeDir = testHomeDir;

      const handler = setupCommand(api);
      const result = await handler({
        args: { name: "testbot", register: false },
      });

      expect(result.error).toBeUndefined();
      expect(result.text).toContain("JACS initialized successfully");
      expect(result.text).toContain("Created locally");
      expect(result.text).not.toContain("Registered with HAI");
    } finally {
      if (previous === undefined) delete process.env.JACS_PRIVATE_KEY_PASSWORD;
      else process.env.JACS_PRIVATE_KEY_PASSWORD = previous;
    }
  });
});

describe("CLI commands", () => {
  it("does not have a register command", async () => {
    const api = await createMockApi({ initialized: true });
    const commands = cliCommands(api);
    expect(commands).not.toHaveProperty("register");
  });
});

describe("SKILL.md remote document storage docs", () => {
  const skillPath = path.join(__dirname, "..", "src", "skills", "moltyjacs", "SKILL.md");
  const skillContent = fs.readFileSync(skillPath, "utf-8");

  it("mentions all 20 doc-store tool names", () => {
    const tools = [
      "jacs_hai_save_memory",
      "jacs_hai_get_memory",
      "jacs_hai_save_soul",
      "jacs_hai_get_soul",
      "jacs_hai_store_text_file",
      "jacs_hai_store_image_file",
      "jacs_hai_get_record_bytes",
      "jacs_hai_store_document",
      "jacs_hai_sign_and_store",
      "jacs_hai_get_document",
      "jacs_hai_get_latest_document",
      "jacs_hai_get_document_versions",
      "jacs_hai_list_documents",
      "jacs_hai_remove_document",
      "jacs_hai_update_document",
      "jacs_hai_search_documents",
      "jacs_hai_query_by_type",
      "jacs_hai_query_by_field",
      "jacs_hai_query_by_agent",
      "jacs_hai_storage_capabilities",
    ];
    for (const tool of tools) {
      expect(skillContent, `SKILL.md missing tool: ${tool}`).toContain(tool);
    }
  });

  it("mentions all 6 doc-store CLI commands", () => {
    const cmds = [
      "openclaw haiai save-memory",
      "openclaw haiai get-memory",
      "openclaw haiai save-soul",
      "openclaw haiai get-soul",
      "openclaw haiai store-text",
      "openclaw haiai store-image",
    ];
    for (const cmd of cmds) {
      expect(skillContent, `SKILL.md missing CLI command: ${cmd}`).toContain(cmd);
    }
  });
});
