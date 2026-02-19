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
