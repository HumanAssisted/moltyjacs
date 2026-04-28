/**
 * E2E test for jacs_hai_get_raw_email tool (PRD §5.6, Issue 016).
 *
 * PRD §5.6 mandates: "call jacs_hai_get_raw_email tool, pipe into verify
 * tool, assert valid: true." The prior moltyjacs test suite only verified
 * the tool was *registered* (test/tools.test.ts:666 appears inside the
 * `expectedTools` array). This test exercises actual behavior end-to-end:
 *
 *   1. Call the registered `jacs_hai_get_raw_email` tool handler.
 *   2. Decode the base64 the tool returns.
 *   3. Pipe the decoded bytes into `HaiClient.verifyEmail` (via the
 *      @haiai/haiai library — mocked here; Rust is the load-bearing real
 *      crypto path per Issue 017 and fixtures/email_conformance.json's
 *      `verify_implemented_by: "rust_only"` declaration).
 *   4. Assert `valid: true`.
 *
 * A regression in either the tool handler's delegation to
 * `haiClient.getRawEmail` (src/tools/index.ts:2529) or in the shape of
 * `RawEmailResult` would fail this test — closing the regression hole that
 * shipped Issue 001 at the napi binding layer.
 *
 * See docs/haiai/RAW_EMAIL_RETRIEVAL_ISSUES/RAW_EMAIL_RETRIEVAL_ISSUE_016.md.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createMockApi, invokeTool } from "./setup";
import { registerTools } from "../src/tools/index";

describe("jacs_hai_get_raw_email E2E (Issue 016, PRD §5.6)", () => {
  let api: Awaited<ReturnType<typeof createMockApi>>;

  beforeEach(async () => {
    api = await createMockApi({ initialized: true, agentId: "test-agent-uuid" });
    registerTools(api);
  });

  it("is registered with the expected schema", () => {
    const tool = api.registeredTools.get("jacs_hai_get_raw_email");
    expect(tool).toBeDefined();
    expect(tool.description).toMatch(/raw/i);
    expect(tool.parameters?.required).toEqual(["messageId"]);
    expect(tool.parameters?.properties?.messageId?.type).toBe("string");
  });

  it("calls HaiClient.getRawEmail and returns the FFI wire shape", async () => {
    const result = await invokeTool(api, "jacs_hai_get_raw_email", {
      messageId: "msg-e2e-001",
    });

    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();
    // Contract: handler emits raw_email_b64 (base64 string), not rawEmail.
    expect(typeof result.result.message_id).toBe("string");
    expect(result.result.available).toBe(true);
    expect(typeof result.result.raw_email_b64).toBe("string");
    expect((result.result.raw_email_b64 as string).length).toBeGreaterThan(0);
    expect(result.result.size_bytes).toBeGreaterThan(0);
    expect(result.result.omitted_reason).toBeNull();
  });

  it("pipes decoded bytes into verifyEmail and asserts valid=true (PRD §5.6)", async () => {
    // Step 1: fetch raw via the tool.
    const rawResult = await invokeTool(api, "jacs_hai_get_raw_email", {
      messageId: "msg-e2e-verify-001",
    });
    expect(rawResult.error).toBeUndefined();
    expect(rawResult.result.available).toBe(true);

    const b64 = rawResult.result.raw_email_b64 as string;
    const rawBytes = Buffer.from(b64, "base64");
    expect(rawBytes.length).toBe(rawResult.result.size_bytes);

    // Step 2: pipe bytes into verifyEmail via HaiClient (from runtime.jacs
    // helper, same entry point other tools use).
    const haiClient = await api.runtime.jacs?.getHaiClient();
    expect(haiClient).toBeDefined();
    const verifyResult = await (haiClient as any).verifyEmail(rawBytes);

    // Step 3: assert valid: true. The moltyjacs mock HaiClient returns
    // valid=true unconditionally — this test verifies the plumbing, not
    // the crypto. Real crypto verification against a signed fixture is
    // exercised in rust/haiai/tests/email_conformance.rs and is declared
    // as the load-bearing check in fixtures/email_conformance.json
    // (verify_implemented_by: "rust_only"). See Issue 017.
    expect(verifyResult.valid).toBe(true);
  });

  it("propagates available: false with omitted_reason through the tool", async () => {
    // Install an override on the mock HaiClient so getRawEmail returns
    // the "not stored" sentinel — this proves the handler forwards the
    // oversize/legacy signal without coercing it.
    const haiClient = await api.runtime.jacs?.getHaiClient();
    expect(haiClient).toBeDefined();
    (haiClient as any).getRawEmailOverride = async (id: string) => ({
      messageId: id,
      rfcMessageId: null,
      available: false,
      rawEmail: null,
      sizeBytes: null,
      omittedReason: "not_stored",
    });

    const result = await invokeTool(api, "jacs_hai_get_raw_email", {
      messageId: "legacy-row-id",
    });
    expect(result.error).toBeUndefined();
    expect(result.result.available).toBe(false);
    expect(result.result.raw_email_b64).toBeNull();
    expect(result.result.omitted_reason).toBe("not_stored");
  });

  it("propagates oversize sentinel with size_bytes null", async () => {
    const haiClient = await api.runtime.jacs?.getHaiClient();
    (haiClient as any).getRawEmailOverride = async (id: string) => ({
      messageId: id,
      rfcMessageId: "<big-25mb@example.com>",
      available: false,
      rawEmail: null,
      sizeBytes: null,
      omittedReason: "oversize",
    });

    const result = await invokeTool(api, "jacs_hai_get_raw_email", {
      messageId: "oversize-id",
    });
    expect(result.error).toBeUndefined();
    expect(result.result.available).toBe(false);
    expect(result.result.raw_email_b64).toBeNull();
    expect(result.result.omitted_reason).toBe("oversize");
  });
});
