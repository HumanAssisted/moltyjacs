/**
 * Tests for DNS parsing functions
 */

import { describe, it, expect } from "vitest";
import { parseDnsTxt } from "../src/tools/index";

describe("parseDnsTxt", () => {
  it("parses a complete DNS TXT record", () => {
    const txt = "v=hai.ai; jacs_agent_id=550e8400-e29b-41d4-a716-446655440000; alg=SHA-256; enc=base64; jac_public_key_hash=abc123def456";
    const result = parseDnsTxt(txt);

    expect(result.v).toBe("hai.ai");
    expect(result.jacsAgentId).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(result.alg).toBe("SHA-256");
    expect(result.enc).toBe("base64");
    expect(result.publicKeyHash).toBe("abc123def456");
  });

  it("handles missing fields gracefully", () => {
    const txt = "v=hai.ai; jacs_agent_id=test-id";
    const result = parseDnsTxt(txt);

    expect(result.v).toBe("hai.ai");
    expect(result.jacsAgentId).toBe("test-id");
    expect(result.alg).toBeUndefined();
    expect(result.enc).toBeUndefined();
    expect(result.publicKeyHash).toBeUndefined();
  });

  it("handles empty string", () => {
    const result = parseDnsTxt("");

    expect(result.v).toBeUndefined();
    expect(result.jacsAgentId).toBeUndefined();
  });

  it("handles malformed entries (no value)", () => {
    const txt = "v=hai.ai; badfield; jacs_agent_id=test";
    const result = parseDnsTxt(txt);

    expect(result.v).toBe("hai.ai");
    expect(result.jacsAgentId).toBe("test");
  });

  it("handles extra whitespace", () => {
    const txt = "  v = hai.ai ;  jacs_agent_id = test-id  ";
    const result = parseDnsTxt(txt);

    // Note: the current implementation splits on "=" and trims, so
    // "v " becomes "v" and " hai.ai" becomes "hai.ai"
    expect(result.v).toBe("hai.ai");
    expect(result.jacsAgentId).toBe("test-id");
  });

  it("handles record with only version", () => {
    const txt = "v=hai.ai";
    const result = parseDnsTxt(txt);

    expect(result.v).toBe("hai.ai");
    expect(result.jacsAgentId).toBeUndefined();
  });
});

describe("DNS record format (CLI dns-record output round-trip)", () => {
  it("parses the same format the CLI tells users to add to DNS", () => {
    const agentId = "550e8400-e29b-41d4-a716-446655440000";
    const publicKeyHash = "a1b2c3d4e5f6";
    const txtRecord = `v=hai.ai; jacs_agent_id=${agentId}; alg=SHA-256; enc=base64; jac_public_key_hash=${publicKeyHash}`;

    const parsed = parseDnsTxt(txtRecord);

    expect(parsed.v).toBe("hai.ai");
    expect(parsed.jacsAgentId).toBe(agentId);
    expect(parsed.alg).toBe("SHA-256");
    expect(parsed.enc).toBe("base64");
    expect(parsed.publicKeyHash).toBe(publicKeyHash);
  });
});
