/**
 * Tests for HAI.ai integration via HaiClient (haisdk).
 *
 * The old registerWithHai/verifyHaiRegistration functions have been removed.
 * HAI API calls now go through HaiClient from haisdk.
 * This file tests that the HaiClient mock works correctly in tools.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createMockApi, invokeTool } from "./setup";
import { registerTools } from "../src/tools/index";
import { HaiClient } from "haisdk";

describe("HaiClient integration via tools", () => {
  let api: ReturnType<typeof createMockApi>;

  beforeEach(() => {
    api = createMockApi({ initialized: true, agentId: "test-agent-uuid" });
    registerTools(api);
  });

  it("jacs_verify_hai_registration uses HaiClient.getAgentAttestation", async () => {
    const result = await invokeTool(api, "jacs_verify_hai_registration", {
      agentId: "other-agent-uuid",
    });

    // The mock HaiClient returns registered: true
    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();
    expect(result.result.jacsId).toBe("other-agent-uuid");
    expect(result.result.registered).toBe(true);
  });

  it("jacs_verify_hai_registration returns error when JACS not initialized", async () => {
    const uninitApi = createMockApi({ initialized: false });
    registerTools(uninitApi);
    const result = await invokeTool(uninitApi, "jacs_verify_hai_registration", {
      agentId: "some-agent",
    });
    expect(result.error).toContain("not available");
  });

  it("jacs_get_attestation with agentId uses HaiClient", async () => {
    const result = await invokeTool(api, "jacs_get_attestation", {
      agentId: "other-agent-uuid",
    });

    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();
    expect(result.result.agentId).toBe("other-agent-uuid");
    expect(result.result.trustLevel).toBeDefined();
  });

  it("jacs_get_attestation self-check uses HaiClient.verify", async () => {
    const result = await invokeTool(api, "jacs_get_attestation", {});

    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();
    expect(result.result.agentId).toBe("test-agent-uuid");
    expect(result.result.trustLevel).toBeDefined();
  });

  it("jacs_hai_hello calls HaiClient.hello", async () => {
    const result = await invokeTool(api, "jacs_hai_hello", { includeTest: true });
    expect(result.error).toBeUndefined();
    expect(result.result.success).toBe(true);
    expect(result.result.testScenario).toBeDefined();
  });

  it("jacs_hai_claim_username defaults to current agent ID", async () => {
    const result = await invokeTool(api, "jacs_hai_claim_username", {
      username: "agent-alpha",
    });

    expect(result.error).toBeUndefined();
    expect(result.result.agentId).toBe("test-agent-uuid");
    expect(result.result.username).toBe("agent-alpha");
  });

  it("jacs_hai_send_email returns queued result", async () => {
    const result = await invokeTool(api, "jacs_hai_send_email", {
      to: "other@hai.ai",
      subject: "Test",
      body: "Hello",
    });

    expect(result.error).toBeUndefined();
    expect(result.result.messageId).toBeDefined();
  });

  it("jacs_hai_send_email with attachments returns queued result", async () => {
    const result = await invokeTool(api, "jacs_hai_send_email", {
      to: "other@hai.ai",
      subject: "Test with attachment",
      body: "See attached",
      attachments: [
        {
          filename: "report.pdf",
          contentType: "application/pdf",
          dataBase64: Buffer.from("fake-pdf-data").toString("base64"),
        },
      ],
    });

    expect(result.error).toBeUndefined();
    expect(result.result.messageId).toBeDefined();
    expect(result.result.status).toBe("queued");
  });

  it("jacs_hai_dns_certified_run exposes checkout URL", async () => {
    const result = await invokeTool(api, "jacs_hai_dns_certified_run", {});
    expect(result.error).toBeUndefined();
    expect(result.result.checkoutUrl).toContain("checkout.hai.ai");
  });

  it("jacs_hai_submit_response submits benchmark response", async () => {
    const result = await invokeTool(api, "jacs_hai_submit_response", {
      jobId: "job-123",
      message: "resolved",
      processingTimeMs: 125,
    });

    expect(result.error).toBeUndefined();
    expect(result.result.success).toBe(true);
    expect(result.result.jobId).toBe("job-123");
  });
});

describe("HaiClient mock", () => {
  it("fromCredentials creates a client", () => {
    const client = HaiClient.fromCredentials(
      "test-id",
      "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n",
    );
    expect(client).toBeDefined();
    expect(client.jacsId).toBe("test-id");
  });

  it("getAgentAttestation returns result", async () => {
    const client = HaiClient.fromCredentials(
      "test-id",
      "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n",
    );
    const result = await client.getAgentAttestation("other-agent");
    expect(result.jacsId).toBe("other-agent");
    expect(result.registered).toBe(true);
  });

  it("verify returns result", async () => {
    const client = HaiClient.fromCredentials(
      "test-id",
      "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n",
    );
    const result = await client.verify();
    expect(result.jacsId).toBe("test-id");
    expect(result.registered).toBe(true);
  });

  it("register returns result", async () => {
    const client = HaiClient.fromCredentials(
      "test-id",
      "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n",
    );
    const result = await client.register({ description: "test" });
    expect(result.success).toBe(true);
    expect(result.agentId).toBe("test-id");
  });
});
