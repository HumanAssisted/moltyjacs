/**
 * HAI Remote Document Storage Tools
 *
 * Wraps the 20 doc-store methods on `HaiClient` from `@haiai/haiai` as
 * `jacs_hai_*` OpenClaw tools. All network I/O is delegated to the SDK; this
 * module is a thin shell that:
 *   - resolves the lazy `HaiClient` via `withHaiClient`
 *   - normalises return shapes per PRD §3.3
 *   - exposes 6 reusable `*Logic` helpers consumed by `src/cli.ts`
 */

import * as fs from "fs";
import type { OpenClawPluginAPI } from "../index";
import type { ToolResult } from "./index";
import { registerOpenClawTool } from "./openclaw";
import { withHaiClient } from "./withHaiClient";

// ---------------------------------------------------------------------------
// Shared parsing helpers
// ---------------------------------------------------------------------------

function parseEnvelope(raw: string): { document: any; raw: string } | { raw: string } {
  try {
    return { document: JSON.parse(raw), raw };
  } catch {
    return { raw };
  }
}

/**
 * Soft size threshold (in bytes) above which `bytesToBase64Result` annotates
 * the response with a `warning` field. Base64 expansion (~33%) plus the JSON
 * tool-result envelope means large records put pressure on the host's context
 * window. Callers receiving the warning should consider going through the SDK
 * directly or paginating.
 */
const RECORD_BYTES_WARN_THRESHOLD = 1_000_000;

function bytesToBase64Result(
  bytes: Uint8Array | Buffer,
): { bytes: string; sizeBytes: number; warning?: string } {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const result: { bytes: string; sizeBytes: number; warning?: string } = {
    bytes: buf.toString("base64"),
    sizeBytes: buf.length,
  };
  if (buf.length > RECORD_BYTES_WARN_THRESHOLD) {
    result.warning = `Record is ${buf.length} bytes; base64 expansion adds ~33% overhead and the encoded payload is shuttled through the tool-result JSON. For large records consider using the SDK directly to avoid context-window pressure.`;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Logic helpers (consumed by both tool handlers and CLI handlers)
// ---------------------------------------------------------------------------

export interface SaveContentParams {
  content?: string | null;
}

export async function saveMemoryLogic(
  api: OpenClawPluginAPI,
  params: SaveContentParams,
): Promise<ToolResult> {
  return withHaiClient(api, async (haiClient) => {
    const key = await haiClient.saveMemory(params.content ?? null);
    return { key };
  });
}

export async function getMemoryLogic(
  api: OpenClawPluginAPI,
  _params: Record<string, never>,
): Promise<ToolResult> {
  return withHaiClient(api, async (haiClient) => {
    const raw = await haiClient.getMemory();
    if (raw === null || raw === undefined) {
      return { document: null };
    }
    return parseEnvelope(raw);
  });
}

export async function saveSoulLogic(
  api: OpenClawPluginAPI,
  params: SaveContentParams,
): Promise<ToolResult> {
  return withHaiClient(api, async (haiClient) => {
    const key = await haiClient.saveSoul(params.content ?? null);
    return { key };
  });
}

export async function getSoulLogic(
  api: OpenClawPluginAPI,
  _params: Record<string, never>,
): Promise<ToolResult> {
  return withHaiClient(api, async (haiClient) => {
    const raw = await haiClient.getSoul();
    if (raw === null || raw === undefined) {
      return { document: null };
    }
    return parseEnvelope(raw);
  });
}

export interface PathParams {
  path: string;
}

export async function storeTextFileLogic(
  api: OpenClawPluginAPI,
  params: PathParams,
): Promise<ToolResult> {
  if (!params?.path) {
    return { error: "path is required" };
  }
  if (!fs.existsSync(params.path)) {
    return { error: `File not found: ${params.path}` };
  }
  return withHaiClient(api, async (haiClient) => {
    const key = await haiClient.storeTextFile(params.path);
    return { key };
  });
}

export async function storeImageFileLogic(
  api: OpenClawPluginAPI,
  params: PathParams,
): Promise<ToolResult> {
  if (!params?.path) {
    return { error: "path is required" };
  }
  if (!fs.existsSync(params.path)) {
    return { error: `File not found: ${params.path}` };
  }
  return withHaiClient(api, async (haiClient) => {
    const key = await haiClient.storeImageFile(params.path);
    return { key };
  });
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerHaiDocStoreTools(api: OpenClawPluginAPI): void {
  // -------------------------------------------------------------------------
  // D5 — MEMORY / SOUL (4 tools)
  // -------------------------------------------------------------------------

  registerOpenClawTool(api, {
    name: "jacs_hai_save_memory",
    description:
      "Sign and store a MEMORY.md record on the HAI service. If content is omitted, the SDK reads MEMORY.md from the current working directory.",
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description:
            "Markdown content for the MEMORY record. Omit to let the SDK read MEMORY.md from CWD.",
        },
      },
    },
    handler: async (params: SaveContentParams = {}): Promise<ToolResult> =>
      saveMemoryLogic(api, params ?? {}),
  });

  registerOpenClawTool(api, {
    name: "jacs_hai_get_memory",
    description:
      "Fetch the latest MEMORY record's signed envelope from the HAI service.",
    parameters: { type: "object", properties: {} },
    handler: async (): Promise<ToolResult> => getMemoryLogic(api, {}),
  });

  registerOpenClawTool(api, {
    name: "jacs_hai_save_soul",
    description:
      "Sign and store a SOUL.md record on the HAI service. If content is omitted, the SDK reads SOUL.md from the current working directory.",
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description:
            "Markdown content for the SOUL record. Omit to let the SDK read SOUL.md from CWD.",
        },
      },
    },
    handler: async (params: SaveContentParams = {}): Promise<ToolResult> =>
      saveSoulLogic(api, params ?? {}),
  });

  registerOpenClawTool(api, {
    name: "jacs_hai_get_soul",
    description:
      "Fetch the latest SOUL record's signed envelope from the HAI service.",
    parameters: { type: "object", properties: {} },
    handler: async (): Promise<ToolResult> => getSoulLogic(api, {}),
  });

  // -------------------------------------------------------------------------
  // D9 — Typed bytes (3 tools)
  // -------------------------------------------------------------------------

  registerOpenClawTool(api, {
    name: "jacs_hai_store_text_file",
    description:
      "Read a text file from disk, sign it, and store it via the HAI service. Returns the record key.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute or CWD-relative path to a text file." },
      },
      required: ["path"],
    },
    handler: async (params: PathParams): Promise<ToolResult> =>
      storeTextFileLogic(api, params),
  });

  registerOpenClawTool(api, {
    name: "jacs_hai_store_image_file",
    description:
      "Read an image file from disk, sign it, and store it via the HAI service. Returns the record key.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute or CWD-relative path to an image file." },
      },
      required: ["path"],
    },
    handler: async (params: PathParams): Promise<ToolResult> =>
      storeImageFileLogic(api, params),
  });

  registerOpenClawTool(api, {
    name: "jacs_hai_get_record_bytes",
    description:
      "Fetch raw record bytes for a stored typed-bytes record. Bytes are returned base64-encoded for JSON safety. For records larger than ~1 MB the result includes a `warning` field; consider using the SDK directly to avoid base64 overhead and context-window pressure.",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "Record key (id or id:version)." },
      },
      required: ["key"],
    },
    handler: async (params: { key: string }): Promise<ToolResult> =>
      withHaiClient(api, async (haiClient) => {
        const bytes = await haiClient.getRecordBytes(params.key);
        return bytesToBase64Result(bytes);
      }),
  });

  // -------------------------------------------------------------------------
  // Trait CRUD (5 tools)
  // -------------------------------------------------------------------------

  registerOpenClawTool(api, {
    name: "jacs_hai_store_document",
    description: "Store a pre-signed JACS document on the HAI service. Returns the record key (id:version).",
    parameters: {
      type: "object",
      properties: {
        signedJson: {
          type: "string",
          description: "Signed JACS envelope JSON (string).",
        },
      },
      required: ["signedJson"],
    },
    handler: async (params: { signedJson: string }): Promise<ToolResult> =>
      withHaiClient(api, async (haiClient) => {
        const key = await haiClient.storeDocument(params.signedJson);
        return { key };
      }),
  });

  registerOpenClawTool(api, {
    name: "jacs_hai_sign_and_store",
    description:
      "Sign and store a JSON document in one call. Returns the SignedDocument object.",
    parameters: {
      type: "object",
      properties: {
        dataJson: {
          type: "string",
          description: "Unsigned JSON payload (string).",
        },
      },
      required: ["dataJson"],
    },
    handler: async (params: { dataJson: string }): Promise<ToolResult> =>
      withHaiClient(api, async (haiClient) => {
        return haiClient.signAndStore(params.dataJson);
      }),
  });

  registerOpenClawTool(api, {
    name: "jacs_hai_get_document",
    description: "Fetch a stored document by key (id or id:version).",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "Record key (id or id:version)." },
      },
      required: ["key"],
    },
    handler: async (params: { key: string }): Promise<ToolResult> =>
      withHaiClient(api, async (haiClient) => {
        const raw = await haiClient.getDocument(params.key);
        return parseEnvelope(raw);
      }),
  });

  registerOpenClawTool(api, {
    name: "jacs_hai_get_latest_document",
    description: "Fetch the latest version of a document by id.",
    parameters: {
      type: "object",
      properties: {
        docId: { type: "string", description: "Document id." },
      },
      required: ["docId"],
    },
    handler: async (params: { docId: string }): Promise<ToolResult> =>
      withHaiClient(api, async (haiClient) => {
        const raw = await haiClient.getLatestDocument(params.docId);
        return parseEnvelope(raw);
      }),
  });

  registerOpenClawTool(api, {
    name: "jacs_hai_update_document",
    description: "Sign a new version of an existing document.",
    parameters: {
      type: "object",
      properties: {
        docId: { type: "string", description: "Document id to update." },
        signedJson: {
          type: "string",
          description: "Signed JACS envelope JSON for the new version.",
        },
      },
      required: ["docId", "signedJson"],
    },
    handler: async (params: { docId: string; signedJson: string }): Promise<ToolResult> =>
      withHaiClient(api, async (haiClient) => {
        const obj = await haiClient.updateDocument(params.docId, params.signedJson);
        const raw = JSON.stringify(obj);
        return { document: obj, raw };
      }),
  });

  // -------------------------------------------------------------------------
  // Trait list / remove / versions (3 tools)
  // -------------------------------------------------------------------------

  registerOpenClawTool(api, {
    name: "jacs_hai_get_document_versions",
    description: "List all version keys of a document by id.",
    parameters: {
      type: "object",
      properties: {
        docId: { type: "string", description: "Document id." },
      },
      required: ["docId"],
    },
    handler: async (params: { docId: string }): Promise<ToolResult> =>
      withHaiClient(api, async (haiClient) => {
        const keys = await haiClient.getDocumentVersions(params.docId);
        return { keys };
      }),
  });

  registerOpenClawTool(api, {
    name: "jacs_hai_list_documents",
    description: "List stored document keys, optionally filtered by jacsType.",
    parameters: {
      type: "object",
      properties: {
        jacsType: {
          type: "string",
          description: "Optional jacsType filter (e.g. 'agent', 'memory', 'todo').",
        },
      },
    },
    handler: async (params: { jacsType?: string | null } = {}): Promise<ToolResult> =>
      withHaiClient(api, async (haiClient) => {
        const keys = await haiClient.listDocuments(params?.jacsType ?? null);
        return { keys };
      }),
  });

  registerOpenClawTool(api, {
    name: "jacs_hai_remove_document",
    description: "Tombstone (soft-delete) a document by key.",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "Record key (id or id:version)." },
      },
      required: ["key"],
    },
    handler: async (params: { key: string }): Promise<ToolResult> =>
      withHaiClient(api, async (haiClient) => {
        await haiClient.removeDocument(params.key);
        return { removed: true, key: params.key };
      }),
  });

  // -------------------------------------------------------------------------
  // Trait query / search (5 tools)
  // -------------------------------------------------------------------------

  registerOpenClawTool(api, {
    name: "jacs_hai_search_documents",
    description: "Fulltext / hybrid search across stored documents.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query string." },
        limit: {
          type: "number",
          description: "Maximum results (default 25).",
        },
        offset: {
          type: "number",
          description: "Pagination offset (default 0).",
        },
      },
      required: ["query"],
    },
    handler: async (params: {
      query: string;
      limit?: number;
      offset?: number;
    }): Promise<ToolResult> =>
      withHaiClient(api, async (haiClient) => {
        return haiClient.searchDocuments(
          params.query,
          params.limit ?? 25,
          params.offset ?? 0,
        );
      }),
  });

  registerOpenClawTool(api, {
    name: "jacs_hai_query_by_type",
    description: "List document keys of a specific jacsType.",
    parameters: {
      type: "object",
      properties: {
        docType: { type: "string", description: "jacsType to filter by." },
        limit: { type: "number", description: "Maximum results (default 25)." },
        offset: { type: "number", description: "Pagination offset (default 0)." },
      },
      required: ["docType"],
    },
    handler: async (params: {
      docType: string;
      limit?: number;
      offset?: number;
    }): Promise<ToolResult> =>
      withHaiClient(api, async (haiClient) => {
        const keys = await haiClient.queryByType(
          params.docType,
          params.limit ?? 25,
          params.offset ?? 0,
        );
        return { keys };
      }),
  });

  registerOpenClawTool(api, {
    name: "jacs_hai_query_by_field",
    description: "List document keys whose envelope field matches a value.",
    parameters: {
      type: "object",
      properties: {
        field: { type: "string", description: "Envelope field name." },
        value: { type: "string", description: "Value to match." },
        limit: { type: "number", description: "Maximum results (default 25)." },
        offset: { type: "number", description: "Pagination offset (default 0)." },
      },
      required: ["field", "value"],
    },
    handler: async (params: {
      field: string;
      value: string;
      limit?: number;
      offset?: number;
    }): Promise<ToolResult> =>
      withHaiClient(api, async (haiClient) => {
        const keys = await haiClient.queryByField(
          params.field,
          params.value,
          params.limit ?? 25,
          params.offset ?? 0,
        );
        return { keys };
      }),
  });

  registerOpenClawTool(api, {
    name: "jacs_hai_query_by_agent",
    description: "List document keys signed by a specific agent.",
    parameters: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "Signing agent id." },
        limit: { type: "number", description: "Maximum results (default 25)." },
        offset: { type: "number", description: "Pagination offset (default 0)." },
      },
      required: ["agentId"],
    },
    handler: async (params: {
      agentId: string;
      limit?: number;
      offset?: number;
    }): Promise<ToolResult> =>
      withHaiClient(api, async (haiClient) => {
        const keys = await haiClient.queryByAgent(
          params.agentId,
          params.limit ?? 25,
          params.offset ?? 0,
        );
        return { keys };
      }),
  });

  registerOpenClawTool(api, {
    name: "jacs_hai_storage_capabilities",
    description: "Report storage backend capabilities (supported features).",
    parameters: { type: "object", properties: {} },
    handler: async (): Promise<ToolResult> =>
      withHaiClient(api, async (haiClient) => {
        return haiClient.storageCapabilities();
      }),
  });
}
