import { describe, expect, it } from "vitest";
import { createMockApi } from "./setup";
import { setupCommand } from "../src/setup";

describe("setup command password source policy", () => {
  it("rejects legacy --password argument", async () => {
    const api = createMockApi({ initialized: false });
    const handler = setupCommand(api);
    const result = await handler({ args: { password: "legacy-secret" } });
    expect(result.error).toContain("--password option is no longer supported");
  });

  it("rejects multiple configured password sources", async () => {
    const previous = process.env.JACS_PRIVATE_KEY_PASSWORD;
    try {
      process.env.JACS_PRIVATE_KEY_PASSWORD = "env-secret";
      const api = createMockApi({ initialized: false });
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
