import { describe, expect, it } from "vitest";
import { createMockApi } from "./setup";
import { setupCommand } from "../src/setup";
import { cliCommands } from "../src/cli";

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

describe("CLI commands", () => {
  it("does not have a register command", async () => {
    const api = await createMockApi({ initialized: true });
    const commands = cliCommands(api);
    expect(commands).not.toHaveProperty("register");
  });
});
