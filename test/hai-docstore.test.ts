/**
 * Tests for the 20 HAI Remote Document Storage tools.
 *
 * Pattern mirrors `test/hai.api.test.ts`: build a mock OpenClawPluginAPI via
 * `createMockApi`, register all tools, drive the underlying HaiClient mock by
 * setting `(haiClient as any)._overrides.<methodName> = ...` (the override
 * map added in TASK_001).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createMockApi, invokeTool } from "./setup";
import { registerTools } from "../src/tools/index";
import { RateLimitedError } from "@haiai/haiai";

type Api = Awaited<ReturnType<typeof createMockApi>>;

async function getMockHaiClient(api: Api): Promise<any> {
  return api.runtime.jacs!.getHaiClient() as any;
}

const TOOL_NAMES = [
  // D5
  "jacs_hai_save_memory",
  "jacs_hai_get_memory",
  "jacs_hai_save_soul",
  "jacs_hai_get_soul",
  // D9
  "jacs_hai_store_text_file",
  "jacs_hai_store_image_file",
  "jacs_hai_get_record_bytes",
  // Trait CRUD
  "jacs_hai_store_document",
  "jacs_hai_sign_and_store",
  "jacs_hai_get_document",
  "jacs_hai_get_latest_document",
  "jacs_hai_update_document",
  // Trait list / remove / versions
  "jacs_hai_get_document_versions",
  "jacs_hai_list_documents",
  "jacs_hai_remove_document",
  // Trait query / search
  "jacs_hai_search_documents",
  "jacs_hai_query_by_type",
  "jacs_hai_query_by_field",
  "jacs_hai_query_by_agent",
  "jacs_hai_storage_capabilities",
];

const MUTATING_TOOLS = [
  "jacs_hai_save_memory",
  "jacs_hai_save_soul",
  "jacs_hai_store_document",
  "jacs_hai_sign_and_store",
  "jacs_hai_update_document",
  "jacs_hai_remove_document",
  "jacs_hai_store_text_file",
  "jacs_hai_store_image_file",
];

describe("HAI Remote Document Storage tools — registration", () => {
  let api: Api;

  beforeEach(async () => {
    api = await createMockApi({ initialized: true, agentId: "test-agent" });
    registerTools(api);
  });

  for (const name of TOOL_NAMES) {
    it(`registers ${name}`, () => {
      expect(api.registeredTools.has(name), `Missing tool: ${name}`).toBe(true);
      const tool = api.registeredTools.get(name);
      expect(typeof tool.handler).toBe("function");
      expect(tool.parameters?.type).toBe("object");
    });
  }

  it("flags 8 mutating tools as optional", () => {
    for (const name of MUTATING_TOOLS) {
      const tool = api.registeredTools.get(name);
      expect(
        tool._registerOptions?.optional,
        `Expected ${name} to be optional`,
      ).toBe(true);
    }
  });

  it("does not flag read-only tools as optional", () => {
    const readOnly = TOOL_NAMES.filter((n) => !MUTATING_TOOLS.includes(n));
    for (const name of readOnly) {
      const tool = api.registeredTools.get(name);
      expect(
        tool._registerOptions?.optional,
        `Expected ${name} to be non-optional`,
      ).not.toBe(true);
    }
  });

  it("schemas declare required args where SDK requires them", () => {
    const expectations: Record<string, string[] | undefined> = {
      jacs_hai_save_memory: undefined,
      jacs_hai_get_memory: undefined,
      jacs_hai_save_soul: undefined,
      jacs_hai_get_soul: undefined,
      jacs_hai_store_text_file: ["path"],
      jacs_hai_store_image_file: ["path"],
      jacs_hai_get_record_bytes: ["key"],
      jacs_hai_store_document: ["signedJson"],
      jacs_hai_sign_and_store: ["dataJson"],
      jacs_hai_get_document: ["key"],
      jacs_hai_get_latest_document: ["docId"],
      jacs_hai_update_document: ["docId", "signedJson"],
      jacs_hai_get_document_versions: ["docId"],
      jacs_hai_list_documents: undefined,
      jacs_hai_remove_document: ["key"],
      jacs_hai_search_documents: ["query"],
      jacs_hai_query_by_type: ["docType"],
      jacs_hai_query_by_field: ["field", "value"],
      jacs_hai_query_by_agent: ["agentId"],
      jacs_hai_storage_capabilities: undefined,
    };
    for (const [name, required] of Object.entries(expectations)) {
      const tool = api.registeredTools.get(name);
      if (required === undefined) {
        expect(tool.parameters?.required, `${name} should not declare required`).toBeUndefined();
      } else {
        expect(tool.parameters?.required, `${name} required mismatch`).toEqual(required);
      }
    }
  });
});

describe("HAI Remote Document Storage tools — D5 (memory/soul)", () => {
  let api: Api;
  let client: any;

  beforeEach(async () => {
    api = await createMockApi({ initialized: true, agentId: "test-agent" });
    registerTools(api);
    client = await getMockHaiClient(api);
    client._overrides = {};
  });

  it("save_memory passes content to saveMemory and returns { key }", async () => {
    let captured: any = "<unset>";
    client._overrides.saveMemory = async (content: any) => {
      captured = content;
      return "memory-key-1";
    };

    const result = await invokeTool(api, "jacs_hai_save_memory", { content: "hello" });
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({ key: "memory-key-1" });
    expect(captured).toBe("hello");
  });

  it("save_memory passes null when content omitted", async () => {
    let captured: any = "<unset>";
    client._overrides.saveMemory = async (content: any) => {
      captured = content;
      return "memory-key-cwd";
    };

    const result = await invokeTool(api, "jacs_hai_save_memory", {});
    expect(result.error).toBeUndefined();
    expect(captured).toBeNull();
  });

  it("get_memory returns { document, raw } when present", async () => {
    const env = { jacsId: "mem-1", jacsType: "memory", jacsVersion: "v1" };
    client._overrides.getMemory = async () => JSON.stringify(env);

    const result = await invokeTool(api, "jacs_hai_get_memory", {});
    expect(result.error).toBeUndefined();
    expect(result.result.document).toEqual(env);
    expect(result.result.raw).toBe(JSON.stringify(env));
  });

  it("get_memory returns { document: null } when absent", async () => {
    client._overrides.getMemory = async () => null;

    const result = await invokeTool(api, "jacs_hai_get_memory", {});
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({ document: null });
    expect(result.result.raw).toBeUndefined();
  });

  it("save_soul mirrors save_memory", async () => {
    let captured: any = "<unset>";
    client._overrides.saveSoul = async (content: any) => {
      captured = content;
      return "soul-key-1";
    };

    const result = await invokeTool(api, "jacs_hai_save_soul", { content: "soul-text" });
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({ key: "soul-key-1" });
    expect(captured).toBe("soul-text");
  });

  it("get_soul returns { document, raw } when present", async () => {
    const env = { jacsId: "soul-1", jacsType: "soul" };
    client._overrides.getSoul = async () => JSON.stringify(env);

    const result = await invokeTool(api, "jacs_hai_get_soul", {});
    expect(result.error).toBeUndefined();
    expect(result.result.document).toEqual(env);
    expect(result.result.raw).toBe(JSON.stringify(env));
  });

  it("get_soul returns { document: null } when absent", async () => {
    client._overrides.getSoul = async () => null;

    const result = await invokeTool(api, "jacs_hai_get_soul", {});
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({ document: null });
  });
});

describe("HAI Remote Document Storage tools — Trait CRUD", () => {
  let api: Api;
  let client: any;

  beforeEach(async () => {
    api = await createMockApi({ initialized: true, agentId: "test-agent" });
    registerTools(api);
    client = await getMockHaiClient(api);
    client._overrides = {};
  });

  it("store_document passes signedJson and returns { key }", async () => {
    let captured: any = "<unset>";
    client._overrides.storeDocument = async (signedJson: any) => {
      captured = signedJson;
      return "doc-key-1";
    };

    const result = await invokeTool(api, "jacs_hai_store_document", {
      signedJson: '{"jacsId":"abc"}',
    });
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({ key: "doc-key-1" });
    expect(captured).toBe('{"jacsId":"abc"}');
  });

  it("sign_and_store returns the SignedDocument object directly", async () => {
    const signed = { jacsId: "x", jacsVersion: "1", payload: { foo: "bar" } };
    client._overrides.signAndStore = async () => signed;

    const result = await invokeTool(api, "jacs_hai_sign_and_store", {
      dataJson: '{"foo":"bar"}',
    });
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual(signed);
    expect(result.result.key).toBeUndefined();
  });

  it("get_document returns { document, raw }", async () => {
    const env = { jacsId: "x", jacsType: "agent" };
    client._overrides.getDocument = async () => JSON.stringify(env);

    const result = await invokeTool(api, "jacs_hai_get_document", { key: "x:1" });
    expect(result.error).toBeUndefined();
    expect(result.result.document).toEqual(env);
    expect(result.result.raw).toBe(JSON.stringify(env));
  });

  it("get_document falls back to { raw } when payload is unparseable", async () => {
    client._overrides.getDocument = async () => "not-json{";

    const result = await invokeTool(api, "jacs_hai_get_document", { key: "x" });
    expect(result.error).toBeUndefined();
    expect(result.result.raw).toBe("not-json{");
    expect(result.result.document).toBeUndefined();
  });

  it("get_latest_document returns { document, raw }", async () => {
    const env = { jacsId: "x", jacsType: "agent", jacsVersion: "v3" };
    client._overrides.getLatestDocument = async () => JSON.stringify(env);

    const result = await invokeTool(api, "jacs_hai_get_latest_document", { docId: "x" });
    expect(result.error).toBeUndefined();
    expect(result.result.document).toEqual(env);
  });

  it("update_document returns { document, raw }", async () => {
    const updated = { jacsId: "x", jacsVersion: "v2" };
    client._overrides.updateDocument = async () => updated;

    const result = await invokeTool(api, "jacs_hai_update_document", {
      docId: "x",
      signedJson: '{"foo":"bar"}',
    });
    expect(result.error).toBeUndefined();
    expect(result.result.document).toEqual(updated);
    expect(result.result.raw).toBe(JSON.stringify(updated));
  });
});

describe("HAI Remote Document Storage tools — Trait list/remove/versions", () => {
  let api: Api;
  let client: any;

  beforeEach(async () => {
    api = await createMockApi({ initialized: true, agentId: "test-agent" });
    registerTools(api);
    client = await getMockHaiClient(api);
    client._overrides = {};
  });

  it("get_document_versions returns { keys: string[] }", async () => {
    client._overrides.getDocumentVersions = async () => ["x:1", "x:2"];

    const result = await invokeTool(api, "jacs_hai_get_document_versions", { docId: "x" });
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({ keys: ["x:1", "x:2"] });
  });

  it("list_documents returns { keys } and accepts no jacsType", async () => {
    let captured: any = "<unset>";
    client._overrides.listDocuments = async (jacsType: any) => {
      captured = jacsType;
      return ["a:1", "b:1"];
    };

    const result = await invokeTool(api, "jacs_hai_list_documents", {});
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({ keys: ["a:1", "b:1"] });
    expect(captured).toBeNull();
  });

  it("list_documents passes jacsType when provided", async () => {
    let captured: any = "<unset>";
    client._overrides.listDocuments = async (jacsType: any) => {
      captured = jacsType;
      return ["agent:1"];
    };

    const result = await invokeTool(api, "jacs_hai_list_documents", { jacsType: "agent" });
    expect(result.error).toBeUndefined();
    expect(captured).toBe("agent");
  });

  it("remove_document returns { removed: true, key }", async () => {
    let captured: any = "<unset>";
    client._overrides.removeDocument = async (key: string) => {
      captured = key;
    };

    const result = await invokeTool(api, "jacs_hai_remove_document", { key: "doc:1" });
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({ removed: true, key: "doc:1" });
    expect(captured).toBe("doc:1");
  });
});

describe("HAI Remote Document Storage tools — Trait query/search", () => {
  let api: Api;
  let client: any;

  beforeEach(async () => {
    api = await createMockApi({ initialized: true, agentId: "test-agent" });
    registerTools(api);
    client = await getMockHaiClient(api);
    client._overrides = {};
  });

  it("search_documents returns the search-results object directly", async () => {
    const envelope = { hits: [{ key: "x:1", score: 0.9 }], total: 1 };
    client._overrides.searchDocuments = async () => envelope;

    const result = await invokeTool(api, "jacs_hai_search_documents", { query: "foo" });
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual(envelope);
    expect(result.result.keys).toBeUndefined();
  });

  it("search_documents passes default limit=25, offset=0", async () => {
    const captured: any[] = [];
    client._overrides.searchDocuments = async (...args: any[]) => {
      captured.push(...args);
      return {};
    };

    await invokeTool(api, "jacs_hai_search_documents", { query: "q" });
    expect(captured).toEqual(["q", 25, 0]);
  });

  it("query_by_type returns { keys } and applies defaults", async () => {
    const captured: any[] = [];
    client._overrides.queryByType = async (...args: any[]) => {
      captured.push(...args);
      return ["a:1"];
    };

    const result = await invokeTool(api, "jacs_hai_query_by_type", { docType: "agent" });
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({ keys: ["a:1"] });
    expect(captured).toEqual(["agent", 25, 0]);
  });

  it("query_by_field returns { keys }", async () => {
    client._overrides.queryByField = async () => ["k:1", "k:2"];

    const result = await invokeTool(api, "jacs_hai_query_by_field", {
      field: "status",
      value: "active",
    });
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({ keys: ["k:1", "k:2"] });
  });

  it("query_by_agent returns { keys }", async () => {
    client._overrides.queryByAgent = async () => ["k:1"];

    const result = await invokeTool(api, "jacs_hai_query_by_agent", {
      agentId: "agent-x",
    });
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({ keys: ["k:1"] });
  });

  it("storage_capabilities passes through the capabilities object", async () => {
    const caps = { backend: "remote", supportsSearch: true };
    client._overrides.storageCapabilities = async () => caps;

    const result = await invokeTool(api, "jacs_hai_storage_capabilities", {});
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual(caps);
  });
});

describe("HAI Remote Document Storage tools — D9 (typed bytes)", () => {
  let api: Api;
  let client: any;
  let tempFile: string;

  beforeEach(async () => {
    api = await createMockApi({ initialized: true, agentId: "test-agent" });
    registerTools(api);
    client = await getMockHaiClient(api);
    client._overrides = {};

    tempFile = path.join(os.tmpdir(), `docstore-test-${process.pid}-${Date.now()}.txt`);
    fs.writeFileSync(tempFile, "hello text");
  });

  afterEach(() => {
    try {
      fs.unlinkSync(tempFile);
    } catch {
      // Already removed or never created — ignore
    }
  });

  it("store_text_file passes path and returns { key }", async () => {
    let captured: any = "<unset>";
    client._overrides.storeTextFile = async (p: string) => {
      captured = p;
      return "txt-key-1";
    };

    const result = await invokeTool(api, "jacs_hai_store_text_file", { path: tempFile });
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({ key: "txt-key-1" });
    expect(captured).toBe(tempFile);
  });

  it("store_text_file errors when file does not exist", async () => {
    let invoked = false;
    client._overrides.storeTextFile = async () => {
      invoked = true;
      return "should-not-happen";
    };

    const result = await invokeTool(api, "jacs_hai_store_text_file", {
      path: `/tmp/does-not-exist-${process.pid}-${Date.now()}`,
    });
    expect(result.error).toContain("File not found");
    expect(invoked).toBe(false);
  });

  it("store_image_file passes path and returns { key }", async () => {
    let captured: any = "<unset>";
    client._overrides.storeImageFile = async (p: string) => {
      captured = p;
      return "img-key-1";
    };

    const result = await invokeTool(api, "jacs_hai_store_image_file", { path: tempFile });
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({ key: "img-key-1" });
    expect(captured).toBe(tempFile);
  });

  it("get_record_bytes returns base64-encoded bytes with sizeBytes", async () => {
    const buf = Buffer.from([1, 2, 3, 4]);
    client._overrides.getRecordBytes = async () => buf;

    const result = await invokeTool(api, "jacs_hai_get_record_bytes", { key: "k:1" });
    expect(result.error).toBeUndefined();
    expect(result.result.bytes).toBe(buf.toString("base64"));
    expect(result.result.sizeBytes).toBe(4);
  });

  it("get_record_bytes accepts Uint8Array (not Buffer) too", async () => {
    const u8 = new Uint8Array([10, 20, 30]);
    client._overrides.getRecordBytes = async () => u8;

    const result = await invokeTool(api, "jacs_hai_get_record_bytes", { key: "k:1" });
    expect(result.error).toBeUndefined();
    expect(result.result.bytes).toBe(Buffer.from(u8).toString("base64"));
    expect(result.result.sizeBytes).toBe(3);
  });

  it("get_record_bytes does not annotate small records with warning", async () => {
    client._overrides.getRecordBytes = async () => Buffer.alloc(1024); // 1 KB
    const result = await invokeTool(api, "jacs_hai_get_record_bytes", { key: "k:1" });
    expect(result.error).toBeUndefined();
    expect(result.result.sizeBytes).toBe(1024);
    expect(result.result.warning).toBeUndefined();
  });

  it("get_record_bytes annotates records larger than ~1 MB with a warning", async () => {
    const big = Buffer.alloc(1_000_001); // just over the threshold
    client._overrides.getRecordBytes = async () => big;

    const result = await invokeTool(api, "jacs_hai_get_record_bytes", { key: "k:1" });
    expect(result.error).toBeUndefined();
    expect(result.result.sizeBytes).toBe(1_000_001);
    expect(typeof result.result.warning).toBe("string");
    expect(result.result.warning).toContain("1000001 bytes");
    expect(result.result.warning).toContain("SDK directly");
  });
});

describe("HAI Remote Document Storage tools — error paths", () => {
  it("returns standard error when JACS not initialized", async () => {
    const api = await createMockApi({ initialized: false });
    registerTools(api);

    const result = await invokeTool(api, "jacs_hai_save_memory", { content: "x" });
    expect(result.error).toBe(
      "HaiClient not available. JACS must be initialized first.",
    );
  });

  it("propagates HaiClient error message", async () => {
    const api = await createMockApi({ initialized: true });
    registerTools(api);
    const client = (await getMockHaiClient(api)) as any;
    client._overrides = {
      saveMemory: async () => {
        throw new Error("upstream failure");
      },
    };

    const result = await invokeTool(api, "jacs_hai_save_memory", { content: "x" });
    expect(result.error).toContain("upstream failure");
  });

  it("catches RateLimitedError specifically", async () => {
    const api = await createMockApi({ initialized: true });
    registerTools(api);
    const client = (await getMockHaiClient(api)) as any;
    client._overrides = {
      storeDocument: async () => {
        throw new RateLimitedError("too many");
      },
    };

    const result = await invokeTool(api, "jacs_hai_store_document", {
      signedJson: '{"x":1}',
    });
    expect(result.error).toContain("Rate limited");
  });
});
