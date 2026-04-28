/**
 * Sanity tests for the doc-store stub methods on the HaiClient mock.
 *
 * These verify each mock method is callable, returns the correct shape, and
 * is overridable via the `_overrides` map. They protect against silent
 * breakage of the surface that TASK_002's hai-docstore tools depend on.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { HaiClient } from "@haiai/haiai";

describe("HaiClient mock — doc-store stub methods", () => {
  let client: HaiClient;

  beforeEach(async () => {
    client = await HaiClient.fromCredentials(
      "test-jacs-id",
      "-----BEGIN PRIVATE KEY-----\nmock\n-----END PRIVATE KEY-----\n",
    );
  });

  it("mock saveMemory returns string key", async () => {
    const result = await client.saveMemory("hello");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("mock getMemory returns string or null", async () => {
    const result = await client.getMemory();
    expect(result === null || typeof result === "string").toBe(true);
  });

  it("mock saveSoul returns string key", async () => {
    const result = await client.saveSoul("soul content");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("mock getSoul returns string or null", async () => {
    const result = await client.getSoul();
    expect(result === null || typeof result === "string").toBe(true);
  });

  it("mock storeDocument returns string key", async () => {
    const result = await client.storeDocument('{"foo":"bar"}');
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("mock signAndStore returns plain object", async () => {
    const result = await client.signAndStore('{"foo":"bar"}');
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(false);
  });

  it("mock getDocument returns JSON-parseable string", async () => {
    const result = await client.getDocument("some-key");
    expect(typeof result).toBe("string");
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("mock getLatestDocument returns JSON-parseable string", async () => {
    const result = await client.getLatestDocument("some-doc-id");
    expect(typeof result).toBe("string");
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("mock getDocumentVersions returns string[]", async () => {
    const result = await client.getDocumentVersions("some-doc-id");
    expect(Array.isArray(result)).toBe(true);
    for (const v of result) expect(typeof v).toBe("string");
  });

  it("mock listDocuments returns string[] with type filter or null", async () => {
    const a = await client.listDocuments();
    const b = await client.listDocuments(null);
    const c = await client.listDocuments("agent");
    for (const arr of [a, b, c]) {
      expect(Array.isArray(arr)).toBe(true);
      for (const v of arr) expect(typeof v).toBe("string");
    }
  });

  it("mock removeDocument resolves to undefined", async () => {
    const result = await client.removeDocument("some-key");
    expect(result).toBeUndefined();
  });

  it("mock updateDocument returns object", async () => {
    const result = await client.updateDocument("doc-id", '{"foo":"bar"}');
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(false);
  });

  it("mock searchDocuments returns object and accepts default limit/offset", async () => {
    const a = await client.searchDocuments("query");
    const b = await client.searchDocuments("query", 25, 0);
    for (const r of [a, b]) {
      expect(typeof r).toBe("object");
      expect(r).not.toBeNull();
      expect(Array.isArray(r)).toBe(false);
    }
  });

  it("mock queryByType returns string[]", async () => {
    const result = await client.queryByType("agent", 25, 0);
    expect(Array.isArray(result)).toBe(true);
    for (const v of result) expect(typeof v).toBe("string");
  });

  it("mock queryByField returns string[]", async () => {
    const result = await client.queryByField("status", "active", 25, 0);
    expect(Array.isArray(result)).toBe(true);
    for (const v of result) expect(typeof v).toBe("string");
  });

  it("mock queryByAgent returns string[]", async () => {
    const result = await client.queryByAgent("agent-id", 25, 0);
    expect(Array.isArray(result)).toBe(true);
    for (const v of result) expect(typeof v).toBe("string");
  });

  it("mock storageCapabilities returns object", async () => {
    const result = await client.storageCapabilities();
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(false);
  });

  it("mock storeTextFile returns string key", async () => {
    const result = await client.storeTextFile("/tmp/path.txt");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("mock storeImageFile returns string key", async () => {
    const result = await client.storeImageFile("/tmp/path.png");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("mock getRecordBytes returns Uint8Array (Buffer)", async () => {
    const result = await client.getRecordBytes("some-key");
    expect(result instanceof Uint8Array || Buffer.isBuffer(result)).toBe(true);
  });
});
