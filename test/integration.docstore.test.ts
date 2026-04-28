/**
 * E2E integration tests for the 20 doc-store tools/methods (Issue 010).
 *
 * Strategy
 * --------
 * The HAI doc-store HTTP surface is implemented in the Rust `haiinpm` native
 * binding which is not available in this repo's CI sandbox. Spinning up a live
 * HAI backend in tests is also out of scope.
 *
 * Instead we exercise the *real* `@haiai/haiai` HaiClient (loaded via the
 * vitest.config.integration.ts alias `@haiai/haiai -> ../haisdk/node`) and
 * inject a stub `FFIClientAdapter` via the public `_setFFIAdapter` testing
 * hook. Every doc-store method on HaiClient delegates to the adapter, so this
 * setup gives us:
 *
 *   1. **Real HaiClient code path** — including the lazy `this.ffi` getter,
 *      argument coercion (e.g. `?? null` default for `saveMemory`/`saveSoul`),
 *      and the awaited delegation to the adapter.
 *   2. **Real wire-shape contract** — argument names/order and return types
 *      match what the FFI layer actually consumes/emits, not what the unit
 *      mock declares. A drift between the moltyjacs-side mock and the real
 *      SDK would be caught here.
 *   3. **Real error class identity** — `RateLimitedError` thrown from the
 *      adapter is the same class an `instanceof` check in the moltyjacs
 *      `withHaiClient` wrapper imports.
 *
 * The remaining gap (the live HTTP behaviour of haiinpm itself) is covered by
 * `haisdk/rust/haiai/tests/jacs_remote_integration.rs --ignored` against a
 * hosted stack — that is the correct level for it.
 *
 * What we cover here, per PRD §3.3 (envelope shapes):
 *   - D5: save_memory, get_memory, save_soul, get_soul         (4)
 *   - D9: store_text_file, store_image_file, get_record_bytes  (3)
 *   - Trait CRUD: store_document, sign_and_store, get_document,
 *                 get_latest_document, update_document,
 *                 get_document_versions                          (6)
 *   - List/remove: list_documents, remove_document             (2)
 *   - Query/search: search_documents, query_by_type,
 *                   query_by_field, query_by_agent,
 *                   storage_capabilities                        (5)
 *
 * That is the full 20-method scope from REMOTE_DOC_STORE_PRD §3.3.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { HaiClient, RateLimitedError } from "@haiai/haiai";

// ---------------------------------------------------------------------------
// FFI adapter stub
// ---------------------------------------------------------------------------
//
// We mirror `haisdk/node/tests/ffi-mock.ts` here because that file is internal
// to the haisdk repo and not exported from the package. Only the methods used
// by the 20 doc-store calls actually need behaviour; everything else throws so
// any accidental call to a non-doc-store method shows up as a loud failure.

type FFIMethod = (...args: unknown[]) => unknown;
type FFIOverrides = Partial<Record<string, FFIMethod>>;

function buildDocStoreFFI(overrides: FFIOverrides = {}): unknown {
  const reject = (name: string) => () =>
    Promise.reject(new Error(`FFI method not stubbed: ${name}`));

  const stub: Record<string, FFIMethod> = {
    // 20 doc-store methods. Each test typically supplies its own override; the
    // defaults here keep the adapter shape complete so HaiClient's lazy ffi
    // getter is happy and any unstubbed call surfaces clearly.
    storeDocument: reject("storeDocument"),
    signAndStore: reject("signAndStore"),
    getDocument: reject("getDocument"),
    getLatestDocument: reject("getLatestDocument"),
    getDocumentVersions: reject("getDocumentVersions"),
    listDocuments: reject("listDocuments"),
    removeDocument: reject("removeDocument"),
    updateDocument: reject("updateDocument"),
    searchDocuments: reject("searchDocuments"),
    queryByType: reject("queryByType"),
    queryByField: reject("queryByField"),
    queryByAgent: reject("queryByAgent"),
    storageCapabilities: reject("storageCapabilities"),
    saveMemory: reject("saveMemory"),
    saveSoul: reject("saveSoul"),
    getMemory: reject("getMemory"),
    getSoul: reject("getSoul"),
    storeTextFile: reject("storeTextFile"),
    storeImageFile: reject("storeImageFile"),
    getRecordBytes: reject("getRecordBytes"),
  };

  return Object.assign(stub, overrides);
}

// ---------------------------------------------------------------------------
// Real HaiClient builder
// ---------------------------------------------------------------------------

function generateEd25519Pem(): string {
  const { privateKey } = generateKeyPairSync("ed25519");
  return privateKey
    .export({ format: "pem", type: "pkcs8" })
    .toString()
    .trim();
}

async function makeRealClient(jacsId = "test-docstore-agent"): Promise<HaiClient> {
  // fromCredentials creates an ephemeral JACS workspace + agent. No on-disk
  // key material is required and no haiinpm native binding is loaded until a
  // method that actually exercises ffi is invoked.
  return HaiClient.fromCredentials(jacsId, generateEd25519Pem(), {
    url: "https://hai.example",
  });
}

function inject(client: HaiClient, overrides: FFIOverrides): void {
  // _setFFIAdapter is the documented test hook on HaiClient. Cast the FFI
  // adapter shape to `any` because the public type isn't exported from the
  // package's index.ts (it lives in dist/types/ffi-client.d.ts).
  (client as unknown as { _setFFIAdapter(a: unknown): void })._setFFIAdapter(
    buildDocStoreFFI(overrides) as unknown,
  );
}

// ---------------------------------------------------------------------------
// D5 — MEMORY / SOUL
// ---------------------------------------------------------------------------

describe("doc-store e2e (real HaiClient): D5 memory/soul", () => {
  let client: HaiClient;

  beforeEach(async () => {
    client = await makeRealClient();
  });

  it("saveMemory passes content through and returns the key", async () => {
    let captured: unknown = "<unset>";
    inject(client, {
      saveMemory: async (content: unknown) => {
        captured = content;
        return "mem-id:v1";
      },
    });

    const key = await client.saveMemory("# MEMORY.md\n\nproject: foo");
    expect(key).toBe("mem-id:v1");
    expect(captured).toBe("# MEMORY.md\n\nproject: foo");
  });

  it("saveMemory coerces undefined to null for CWD-fallback mode", async () => {
    let captured: unknown = "<unset>";
    inject(client, {
      saveMemory: async (content: unknown) => {
        captured = content;
        return "mem-id:v2";
      },
    });

    const key = await client.saveMemory();
    expect(key).toBe("mem-id:v2");
    // PRD §3.3 contract: SDK forwards `null`, not `undefined`, so the Rust
    // side reads MEMORY.md from CWD. This catches a regression where the
    // null-coercion is dropped from saveMemory()'s wrapper.
    expect(captured).toBeNull();
  });

  it("saveSoul passes content through and returns the key", async () => {
    let captured: unknown = "<unset>";
    inject(client, {
      saveSoul: async (content: unknown) => {
        captured = content;
        return "soul-id:v1";
      },
    });

    const key = await client.saveSoul("# SOUL.md\n\nvoice: terse");
    expect(key).toBe("soul-id:v1");
    expect(captured).toBe("# SOUL.md\n\nvoice: terse");
  });

  it("saveSoul coerces undefined to null for CWD-fallback mode", async () => {
    let captured: unknown = "<unset>";
    inject(client, {
      saveSoul: async (content: unknown) => {
        captured = content;
        return "soul-id:v2";
      },
    });

    await client.saveSoul();
    expect(captured).toBeNull();
  });

  it("getMemory returns envelope JSON when present", async () => {
    const envelope = JSON.stringify({
      jacsId: "mem-1",
      jacsType: "memory",
      jacsAgentStateContent: "hello",
    });
    inject(client, {
      getMemory: async () => envelope,
    });

    const out = await client.getMemory();
    expect(out).toBe(envelope);
  });

  it("getMemory returns null when no record exists", async () => {
    inject(client, {
      getMemory: async () => null,
    });

    const out = await client.getMemory();
    expect(out).toBeNull();
  });

  it("getSoul returns envelope JSON when present", async () => {
    const envelope = JSON.stringify({ jacsId: "soul-1", jacsType: "soul" });
    inject(client, { getSoul: async () => envelope });
    expect(await client.getSoul()).toBe(envelope);
  });

  it("getSoul returns null when no record exists", async () => {
    inject(client, { getSoul: async () => null });
    expect(await client.getSoul()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// D9 — typed-content helpers
// ---------------------------------------------------------------------------

describe("doc-store e2e (real HaiClient): D9 typed-content", () => {
  let client: HaiClient;

  beforeEach(async () => {
    client = await makeRealClient();
  });

  it("storeTextFile passes path through and returns the key", async () => {
    let captured: unknown = "<unset>";
    inject(client, {
      storeTextFile: async (path: unknown) => {
        captured = path;
        return "txt-id:v1";
      },
    });

    const key = await client.storeTextFile("/tmp/signed.md");
    expect(key).toBe("txt-id:v1");
    expect(captured).toBe("/tmp/signed.md");
  });

  it("storeImageFile passes path through and returns the key", async () => {
    let captured: unknown = "<unset>";
    inject(client, {
      storeImageFile: async (path: unknown) => {
        captured = path;
        return "png-id:v1";
      },
    });

    const key = await client.storeImageFile("/tmp/signed.png");
    expect(key).toBe("png-id:v1");
    expect(captured).toBe("/tmp/signed.png");
  });

  it("getRecordBytes returns a Uint8Array", async () => {
    const pngMagic = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    let capturedKey: unknown = "<unset>";
    inject(client, {
      getRecordBytes: async (key: unknown) => {
        capturedKey = key;
        return pngMagic;
      },
    });

    const out = await client.getRecordBytes("png-id:v1");
    expect(capturedKey).toBe("png-id:v1");
    expect(out).toBeInstanceOf(Uint8Array);
    expect(Array.from(out)).toEqual(Array.from(pngMagic));
  });
});

// ---------------------------------------------------------------------------
// Trait CRUD
// ---------------------------------------------------------------------------

describe("doc-store e2e (real HaiClient): Trait CRUD", () => {
  let client: HaiClient;

  beforeEach(async () => {
    client = await makeRealClient();
  });

  it("storeDocument forwards the signed JSON string", async () => {
    let captured: unknown = "<unset>";
    inject(client, {
      storeDocument: async (signedJson: unknown) => {
        captured = signedJson;
        return "doc-id:v1";
      },
    });

    const key = await client.storeDocument('{"jacsId":"doc-1"}');
    expect(key).toBe("doc-id:v1");
    expect(captured).toBe('{"jacsId":"doc-1"}');
  });

  it("signAndStore returns a SignedDocument record (object, not string)", async () => {
    inject(client, {
      signAndStore: async (dataJson: unknown) => {
        expect(dataJson).toBe('{"hello":"world"}');
        return {
          jacsId: "doc-2",
          jacsType: "document",
          jacsVersion: "1",
          jacsSignature: { signature: "real-sig" },
        };
      },
    });

    const out = await client.signAndStore('{"hello":"world"}');
    expect(typeof out).toBe("object");
    expect(out).not.toBeNull();
    // PRD §3.3: signAndStore returns the SignedDocument *object* (not a
    // stringified JSON). The moltyjacs `jacs_hai_sign_and_store` tool relies
    // on this.
    expect((out as Record<string, unknown>).jacsId).toBe("doc-2");
    expect((out as Record<string, unknown>).jacsType).toBe("document");
  });

  it("getDocument returns envelope JSON as a string", async () => {
    const envelope = JSON.stringify({ jacsId: "doc-3", jacsType: "document" });
    inject(client, {
      getDocument: async (key: unknown) => {
        expect(key).toBe("doc-3:v1");
        return envelope;
      },
    });

    const out = await client.getDocument("doc-3:v1");
    expect(out).toBe(envelope);
  });

  it("getLatestDocument returns the latest envelope JSON", async () => {
    const envelope = JSON.stringify({ jacsId: "doc-4", jacsVersion: "latest" });
    inject(client, {
      getLatestDocument: async (docId: unknown) => {
        expect(docId).toBe("doc-4");
        return envelope;
      },
    });

    expect(await client.getLatestDocument("doc-4")).toBe(envelope);
  });

  it("getDocumentVersions returns an array of version keys", async () => {
    inject(client, {
      getDocumentVersions: async (docId: unknown) => {
        expect(docId).toBe("doc-5");
        return ["doc-5:1", "doc-5:2", "doc-5:3"];
      },
    });

    const versions = await client.getDocumentVersions("doc-5");
    expect(versions).toEqual(["doc-5:1", "doc-5:2", "doc-5:3"]);
  });

  it("updateDocument forwards (docId, signedJson) and returns SignedDocument", async () => {
    let capturedDocId: unknown = "<unset>";
    let capturedJson: unknown = "<unset>";
    inject(client, {
      updateDocument: async (docId: unknown, signedJson: unknown) => {
        capturedDocId = docId;
        capturedJson = signedJson;
        return {
          jacsId: "doc-6",
          jacsType: "document",
          jacsVersion: "2",
        };
      },
    });

    const out = await client.updateDocument(
      "doc-6",
      '{"jacsId":"doc-6","data":"v2"}',
    );
    expect(capturedDocId).toBe("doc-6");
    expect(capturedJson).toBe('{"jacsId":"doc-6","data":"v2"}');
    expect((out as Record<string, unknown>).jacsVersion).toBe("2");
  });
});

// ---------------------------------------------------------------------------
// List + remove
// ---------------------------------------------------------------------------

describe("doc-store e2e (real HaiClient): list / remove", () => {
  let client: HaiClient;

  beforeEach(async () => {
    client = await makeRealClient();
  });

  it("listDocuments forwards the optional jacsType filter", async () => {
    let captured: unknown = "<unset>";
    inject(client, {
      listDocuments: async (jacsType: unknown) => {
        captured = jacsType;
        return ["k1", "k2"];
      },
    });

    const out = await client.listDocuments("memory");
    expect(out).toEqual(["k1", "k2"]);
    expect(captured).toBe("memory");
  });

  it("listDocuments coerces missing filter to null (PRD §3.3 contract)", async () => {
    let captured: unknown = "<unset>";
    inject(client, {
      listDocuments: async (jacsType: unknown) => {
        captured = jacsType;
        return [];
      },
    });

    await client.listDocuments();
    // Real SDK forwards null, not undefined.
    expect(captured).toBeNull();
  });

  it("removeDocument resolves to undefined (void)", async () => {
    let called = false;
    let capturedKey: unknown = "<unset>";
    inject(client, {
      removeDocument: async (key: unknown) => {
        capturedKey = key;
        called = true;
        // Adapter returns void.
      },
    });

    const out = await client.removeDocument("doc-7:v1");
    expect(out).toBeUndefined();
    expect(called).toBe(true);
    expect(capturedKey).toBe("doc-7:v1");
  });
});

// ---------------------------------------------------------------------------
// Query / search
// ---------------------------------------------------------------------------

describe("doc-store e2e (real HaiClient): query / search", () => {
  let client: HaiClient;

  beforeEach(async () => {
    client = await makeRealClient();
  });

  it("searchDocuments forwards (query, limit, offset)", async () => {
    let captured: { q?: unknown; l?: unknown; o?: unknown } = {};
    inject(client, {
      searchDocuments: async (q: unknown, l: unknown, o: unknown) => {
        captured = { q, l, o };
        return { results: [], total_count: 0 };
      },
    });

    const out = await client.searchDocuments("marker-xyz", 10, 5);
    expect(captured).toEqual({ q: "marker-xyz", l: 10, o: 5 });
    expect((out as Record<string, unknown>).results).toEqual([]);
    expect((out as Record<string, unknown>).total_count).toBe(0);
  });

  it("queryByType forwards (docType, limit, offset)", async () => {
    let captured: { t?: unknown; l?: unknown; o?: unknown } = {};
    inject(client, {
      queryByType: async (t: unknown, l: unknown, o: unknown) => {
        captured = { t, l, o };
        return ["k1", "k2"];
      },
    });

    const out = await client.queryByType("memory", 25, 0);
    expect(captured).toEqual({ t: "memory", l: 25, o: 0 });
    expect(out).toEqual(["k1", "k2"]);
  });

  it("queryByField forwards (field, value, limit, offset)", async () => {
    let captured: { f?: unknown; v?: unknown; l?: unknown; o?: unknown } = {};
    inject(client, {
      queryByField: async (f: unknown, v: unknown, l: unknown, o: unknown) => {
        captured = { f, v, l, o };
        return ["k1"];
      },
    });

    const out = await client.queryByField("jacsType", "todo", 5, 2);
    expect(captured).toEqual({ f: "jacsType", v: "todo", l: 5, o: 2 });
    expect(out).toEqual(["k1"]);
  });

  it("queryByAgent forwards (agentId, limit, offset)", async () => {
    let captured: { a?: unknown; l?: unknown; o?: unknown } = {};
    inject(client, {
      queryByAgent: async (a: unknown, l: unknown, o: unknown) => {
        captured = { a, l, o };
        return ["k1", "k2"];
      },
    });

    const out = await client.queryByAgent("agent-xyz", 25, 0);
    expect(captured).toEqual({ a: "agent-xyz", l: 25, o: 0 });
    expect(out).toEqual(["k1", "k2"]);
  });

  it("storageCapabilities returns the capabilities object", async () => {
    inject(client, {
      storageCapabilities: async () => ({
        fulltext: true,
        vector: false,
        backend: "remote",
      }),
    });

    const out = await client.storageCapabilities();
    expect((out as Record<string, unknown>).fulltext).toBe(true);
    expect((out as Record<string, unknown>).vector).toBe(false);
    expect((out as Record<string, unknown>).backend).toBe("remote");
  });
});

// ---------------------------------------------------------------------------
// Round-trips — one per PRD §3.3 envelope shape
// ---------------------------------------------------------------------------

describe("doc-store e2e (real HaiClient): round-trips", () => {
  let client: HaiClient;

  beforeEach(async () => {
    client = await makeRealClient();
  });

  it("save_memory + get_memory round-trips through the real SDK", async () => {
    const stored = JSON.stringify({
      jacsId: "round-mem-1",
      jacsType: "memory",
      jacsAgentStateContent: "hello e2e",
    });
    inject(client, {
      saveMemory: async () => "round-mem-1:v1",
      getMemory: async () => stored,
    });

    const key = await client.saveMemory("hello e2e");
    expect(key).toBe("round-mem-1:v1");

    const env = await client.getMemory();
    expect(env).toContain("hello e2e");
  });

  it("save_soul + get_soul round-trips through the real SDK", async () => {
    const stored = JSON.stringify({
      jacsId: "round-soul-1",
      jacsType: "soul",
      jacsAgentStateContent: "voice: terse",
    });
    inject(client, {
      saveSoul: async () => "round-soul-1:v1",
      getSoul: async () => stored,
    });

    expect(await client.saveSoul("voice: terse")).toBe("round-soul-1:v1");
    expect(await client.getSoul()).toContain("voice: terse");
  });

  it("store_document + get_document + remove_document round-trips", async () => {
    const stored = JSON.stringify({
      jacsId: "round-doc-1",
      jacsType: "todo",
    });
    let removed = false;

    inject(client, {
      storeDocument: async () => "round-doc-1:v1",
      getDocument: async () => stored,
      removeDocument: async () => {
        removed = true;
      },
    });

    const key = await client.storeDocument(stored);
    expect(key).toBe("round-doc-1:v1");

    const env = await client.getDocument(key);
    expect(env).toContain("round-doc-1");

    await client.removeDocument(key);
    expect(removed).toBe(true);
  });

  it("sign_and_store + get_latest_document round-trips", async () => {
    const stored = JSON.stringify({
      jacsId: "round-doc-2",
      jacsType: "agentstate",
      jacsVersion: "1",
    });
    inject(client, {
      signAndStore: async () => ({
        jacsId: "round-doc-2",
        jacsType: "agentstate",
        jacsVersion: "1",
      }),
      getLatestDocument: async () => stored,
    });

    const signed = await client.signAndStore('{"name":"foo"}');
    expect((signed as Record<string, unknown>).jacsId).toBe("round-doc-2");

    const latest = await client.getLatestDocument("round-doc-2");
    expect(latest).toContain("round-doc-2");
  });

  it("store_text_file + get_record_bytes round-trips", async () => {
    const bytes = Buffer.from("# round-trip text e2e", "utf-8");
    inject(client, {
      storeTextFile: async () => "txt-round:v1",
      getRecordBytes: async () => new Uint8Array(bytes),
    });

    const key = await client.storeTextFile("/tmp/anything.md");
    expect(key).toBe("txt-round:v1");

    const out = await client.getRecordBytes(key);
    expect(out).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(out).toString("utf-8")).toBe("# round-trip text e2e");
  });

  it("query_by_type + list_documents agree on returned key shape", async () => {
    inject(client, {
      queryByType: async () => ["k1", "k2", "k3"],
      listDocuments: async () => ["k1", "k2", "k3"],
    });

    const byType = await client.queryByType("todo", 25, 0);
    const listed = await client.listDocuments("todo");
    expect(byType).toEqual(listed);
    // Both return string[] of keys, not envelope objects.
    expect(byType.every((k) => typeof k === "string")).toBe(true);
  });

  it("search_documents returns an object envelope with results", async () => {
    inject(client, {
      searchDocuments: async () => ({
        results: [{ key: "k1", score: 0.9 }],
        total_count: 1,
      }),
    });

    const out = (await client.searchDocuments("hello", 25, 0)) as Record<
      string,
      unknown
    >;
    expect(Array.isArray(out.results)).toBe(true);
    expect((out.results as unknown[]).length).toBe(1);
    expect(out.total_count).toBe(1);
  });

  it("storage_capabilities is always an object (not a string)", async () => {
    inject(client, {
      storageCapabilities: async () => ({ fulltext: true, vector: true }),
    });

    const out = await client.storageCapabilities();
    expect(typeof out).toBe("object");
    expect(out).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Error class identity
// ---------------------------------------------------------------------------
//
// Issue 010 §3 calls out: "Error class identity at runtime ... if the real SDK
// throws a class with the same name but a different prototype chain,
// instanceof checks could miss it." Verify here that an error thrown from the
// adapter and surfaced through HaiClient is instanceof the real
// `RateLimitedError` exported from `@haiai/haiai`.

describe("doc-store e2e (real HaiClient): error identity", () => {
  it("RateLimitedError thrown from FFI propagates as instanceof real export", async () => {
    const client = await makeRealClient();
    inject(client, {
      saveMemory: async () => {
        throw new RateLimitedError("rate limited", 429);
      },
    });

    await expect(client.saveMemory("anything")).rejects.toBeInstanceOf(
      RateLimitedError,
    );
  });

  it("generic FFI error propagates with the expected message", async () => {
    const client = await makeRealClient();
    inject(client, {
      getDocument: async () => {
        throw new Error("not found");
      },
    });

    await expect(client.getDocument("missing")).rejects.toThrow(/not found/);
  });
});
