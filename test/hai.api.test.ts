/**
 * Tests for HAI.ai API client request shape (registerWithHai, verifyHaiRegistration).
 * Uses mocked fetch so the agent's registration and verification flows are validated.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { registerWithHai, verifyHaiRegistration } from "../src/tools/hai";

const MOCK_API_URL = "https://api.test.hai.ai";

describe("registerWithHai", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.HAI_API_KEY;
  });

  it("sends POST with agent_id, public_key, public_key_hash, and Authorization", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        agent_id: "agent-123",
        public_key_hash: "abc123",
        verified: true,
        verified_at: "2026-01-01T00:00:00Z",
        registration_type: "agent",
      }),
    });

    await registerWithHai(
      "agent-123",
      "-----BEGIN PUBLIC KEY-----\n...",
      "abc123",
      "My Agent",
      "secret-api-key",
      MOCK_API_URL
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${MOCK_API_URL}/v1/agents`);
    expect(opts.method).toBe("POST");
    expect(opts.headers).toMatchObject({
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: "Bearer secret-api-key",
    });
    const body = JSON.parse(opts.body);
    expect(body.agent_id).toBe("agent-123");
    expect(body.public_key).toBe("-----BEGIN PUBLIC KEY-----\n...");
    expect(body.public_key_hash).toBe("abc123");
    expect(body.name).toBe("My Agent");
  });

  it("throws when HAI_API_KEY is missing and apiKey not passed", async () => {
    await expect(
      registerWithHai("agent-123", "pubkey", "hash", undefined, undefined, MOCK_API_URL)
    ).rejects.toThrow("API key required");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses HAI_API_KEY from env when apiKey not passed", async () => {
    process.env.HAI_API_KEY = "env-key";
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        agent_id: "agent-123",
        public_key_hash: "hash",
        verified: true,
        verified_at: null,
        registration_type: "agent",
      }),
    });

    await registerWithHai("agent-123", "pubkey", "hash", undefined, undefined, MOCK_API_URL);

    const opts = fetchMock.mock.calls[0][1];
    expect(opts.headers.Authorization).toBe("Bearer env-key");
  });
});

describe("verifyHaiRegistration", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends GET to /v1/agents/:agentId with Accept header", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        agent_id: "550e8400-e29b-41d4-a716-446655440000",
        public_key_hash: "def456",
        verified: true,
        verified_at: "2026-01-01T00:00:00Z",
        registration_type: "agent",
      }),
    });

    const result = await verifyHaiRegistration(
      "550e8400-e29b-41d4-a716-446655440000",
      "def456",
      MOCK_API_URL
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${MOCK_API_URL}/v1/agents/550e8400-e29b-41d4-a716-446655440000`);
    expect(opts.method).toBe("GET");
    expect(opts.headers).toMatchObject({ Accept: "application/json" });
    expect(result.verified).toBe(true);
    expect(result.agent_id).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("throws when agent not found (404)", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });

    await expect(
      verifyHaiRegistration("missing-agent", "hash", MOCK_API_URL)
    ).rejects.toThrow("not registered with HAI.ai");
  });
});
