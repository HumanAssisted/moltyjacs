/**
 * Tests for the 6 doc-store CLI subcommands in `src/cli.ts`:
 *   save-memory, get-memory, save-soul, get-soul, store-text, store-image
 *
 * Each handler delegates to a `*Logic` helper exported by
 * `src/tools/hai-docstore.ts`, which in turn calls `HaiClient` doc-store
 * methods. Tests drive the underlying SDK via the `_overrides` map on the
 * mock added in TASK_001.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createMockApi } from "./setup";
import { cliCommands } from "../src/cli";

type Api = Awaited<ReturnType<typeof createMockApi>>;

async function getMockHaiClient(api: Api): Promise<any> {
  return api.runtime.jacs!.getHaiClient() as any;
}

const tempFiles: string[] = [];
function makeTempFile(contents: string, suffix = ".txt"): string {
  const p = path.join(
    os.tmpdir(),
    `cli-docstore-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}${suffix}`,
  );
  fs.writeFileSync(p, contents);
  tempFiles.push(p);
  return p;
}

afterEach(() => {
  while (tempFiles.length) {
    const p = tempFiles.pop()!;
    try {
      fs.unlinkSync(p);
    } catch {
      // ignore
    }
  }
});

describe("CLI doc-store commands — registration", () => {
  it("registers all 6 doc-store CLI commands", async () => {
    const api = await createMockApi({ initialized: true });
    const cmds = cliCommands(api);
    expect(cmds["save-memory"]).toBeDefined();
    expect(cmds["get-memory"]).toBeDefined();
    expect(cmds["save-soul"]).toBeDefined();
    expect(cmds["get-soul"]).toBeDefined();
    expect(cmds["store-text"]).toBeDefined();
    expect(cmds["store-image"]).toBeDefined();
  });

  it("save-memory and save-soul declare --content / --file flags", async () => {
    const api = await createMockApi({ initialized: true });
    const cmds = cliCommands(api);
    for (const name of ["save-memory", "save-soul"]) {
      const cmd = cmds[name];
      expect(cmd.args).toContain("[--content <text>]");
      expect(cmd.args).toContain("[--file <path>]");
    }
  });

  it("store-text and store-image declare positional <path> arg", async () => {
    const api = await createMockApi({ initialized: true });
    const cmds = cliCommands(api);
    for (const name of ["store-text", "store-image"]) {
      const cmd = cmds[name];
      expect(cmd.args).toEqual(["<path>"]);
    }
  });
});

describe("CLI doc-store commands — save-memory", () => {
  let api: Api;
  let client: any;

  beforeEach(async () => {
    api = await createMockApi({ initialized: true });
    client = await getMockHaiClient(api);
    client._overrides = {};
  });

  it("with --content stores via HaiClient.saveMemory and returns key in text", async () => {
    let captured: any = "<unset>";
    client._overrides.saveMemory = async (content: any) => {
      captured = content;
      return "key-1";
    };
    const cmds = cliCommands(api);
    const result = await cmds["save-memory"].handler({ content: "hello" });
    expect(result.error).toBeUndefined();
    expect(result.text).toContain("key-1");
    expect(captured).toBe("hello");
  });

  it("with --file reads file and stores its contents", async () => {
    const filePath = makeTempFile("file-contents-here");
    let captured: any = "<unset>";
    client._overrides.saveMemory = async (content: any) => {
      captured = content;
      return "key-2";
    };
    const cmds = cliCommands(api);
    const result = await cmds["save-memory"].handler({ file: filePath });
    expect(result.error).toBeUndefined();
    expect(captured).toBe("file-contents-here");
  });

  it("with --content and --file is rejected as mutually exclusive", async () => {
    const filePath = makeTempFile("ignored");
    const cmds = cliCommands(api);
    const result = await cmds["save-memory"].handler({ content: "x", file: filePath });
    expect(result.error).toBeDefined();
    expect(result.error).toContain("mutually exclusive");
  });

  it("with neither flag passes null to SDK (CWD fallback)", async () => {
    let captured: any = "<unset>";
    client._overrides.saveMemory = async (content: any) => {
      captured = content;
      return "key-3";
    };
    const cmds = cliCommands(api);
    const result = await cmds["save-memory"].handler({});
    expect(result.error).toBeUndefined();
    expect(captured).toBeNull();
  });

  it("with --file pointing at missing path returns 'File not found' without invoking SDK", async () => {
    let invoked = false;
    client._overrides.saveMemory = async () => {
      invoked = true;
      return "should-not-happen";
    };
    const cmds = cliCommands(api);
    const result = await cmds["save-memory"].handler({
      file: `/tmp/no-such-file-${process.pid}-${Date.now()}`,
    });
    expect(result.error).toContain("File not found");
    expect(invoked).toBe(false);
  });
});

describe("CLI doc-store commands — get-memory", () => {
  let api: Api;
  let client: any;

  beforeEach(async () => {
    api = await createMockApi({ initialized: true });
    client = await getMockHaiClient(api);
    client._overrides = {};
  });

  it("returns 'No memory stored yet' when SDK returns null", async () => {
    client._overrides.getMemory = async () => null;
    const cmds = cliCommands(api);
    const result = await cmds["get-memory"].handler({});
    expect(result.error).toBeUndefined();
    expect(result.text).toBe("No memory stored yet");
  });

  it("returns parsed JSON when SDK returns a signed envelope", async () => {
    const env = { jacsId: "mem-1", jacsType: "memory", jacsVersion: "v1" };
    client._overrides.getMemory = async () => JSON.stringify(env);
    const cmds = cliCommands(api);
    const result = await cmds["get-memory"].handler({});
    expect(result.error).toBeUndefined();
    expect(result.data).toEqual(env);
    expect(JSON.parse(result.text)).toEqual(env);
  });
});

describe("CLI doc-store commands — save-soul / get-soul", () => {
  let api: Api;
  let client: any;

  beforeEach(async () => {
    api = await createMockApi({ initialized: true });
    client = await getMockHaiClient(api);
    client._overrides = {};
  });

  it("save-soul mirrors save-memory (override saveSoul)", async () => {
    let captured: any = "<unset>";
    client._overrides.saveSoul = async (content: any) => {
      captured = content;
      return "soul-key-1";
    };
    const cmds = cliCommands(api);
    const result = await cmds["save-soul"].handler({ content: "soul-text" });
    expect(result.error).toBeUndefined();
    expect(result.text).toContain("soul-key-1");
    expect(captured).toBe("soul-text");
  });

  it("get-soul returns 'No soul stored yet' when SDK returns null", async () => {
    client._overrides.getSoul = async () => null;
    const cmds = cliCommands(api);
    const result = await cmds["get-soul"].handler({});
    expect(result.error).toBeUndefined();
    expect(result.text).toBe("No soul stored yet");
  });

  it("get-soul returns parsed JSON when SDK returns envelope", async () => {
    const env = { jacsId: "soul-1", jacsType: "soul" };
    client._overrides.getSoul = async () => JSON.stringify(env);
    const cmds = cliCommands(api);
    const result = await cmds["get-soul"].handler({});
    expect(result.error).toBeUndefined();
    expect(result.data).toEqual(env);
  });
});

describe("CLI doc-store commands — store-text / store-image", () => {
  let api: Api;
  let client: any;

  beforeEach(async () => {
    api = await createMockApi({ initialized: true });
    client = await getMockHaiClient(api);
    client._overrides = {};
  });

  it("store-text passes positional path to HaiClient.storeTextFile", async () => {
    const filePath = makeTempFile("text-content");
    let captured: any = "<unset>";
    client._overrides.storeTextFile = async (p: string) => {
      captured = p;
      return "txt-key-1";
    };
    const cmds = cliCommands(api);
    const result = await cmds["store-text"].handler({ path: filePath });
    expect(result.error).toBeUndefined();
    expect(captured).toBe(filePath);
    expect(result.text).toContain("txt-key-1");
  });

  it("store-text errors when file does not exist", async () => {
    let invoked = false;
    client._overrides.storeTextFile = async () => {
      invoked = true;
      return "should-not-happen";
    };
    const cmds = cliCommands(api);
    const result = await cmds["store-text"].handler({
      path: `/tmp/no-such-text-${process.pid}-${Date.now()}`,
    });
    expect(result.error).toContain("File not found");
    expect(invoked).toBe(false);
  });

  it("store-image passes positional path to HaiClient.storeImageFile", async () => {
    const filePath = makeTempFile("image-content", ".png");
    let captured: any = "<unset>";
    client._overrides.storeImageFile = async (p: string) => {
      captured = p;
      return "img-key-1";
    };
    const cmds = cliCommands(api);
    const result = await cmds["store-image"].handler({ path: filePath });
    expect(result.error).toBeUndefined();
    expect(captured).toBe(filePath);
    expect(result.text).toContain("img-key-1");
  });

  it("store-text returns usage error when path is missing", async () => {
    const cmds = cliCommands(api);
    const result = await cmds["store-text"].handler({});
    expect(result.error).toContain("Missing");
  });
});

describe("CLI doc-store commands — JACS not initialized", () => {
  it("save-memory returns standard error when JACS not initialized", async () => {
    const api = await createMockApi({ initialized: false });
    const cmds = cliCommands(api);
    const result = await cmds["save-memory"].handler({ content: "x" });
    expect(result.error).toContain("HaiClient not available");
  });

  it("get-memory returns standard error when JACS not initialized", async () => {
    const api = await createMockApi({ initialized: false });
    const cmds = cliCommands(api);
    const result = await cmds["get-memory"].handler({});
    expect(result.error).toContain("HaiClient not available");
  });
});
