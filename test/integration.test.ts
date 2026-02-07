/**
 * Integration tests using the REAL @hai-ai/jacs native module.
 *
 * These tests exercise actual cryptographic signing and verification
 * against the JACS Rust core via the NAPI bindings. They require:
 * - The native binary at ../JACS/jacsnpm/jacs.darwin-arm64.node
 * - Test fixtures (keys) at ../JACS/jacs/tests/fixtures/keys/
 * - Config at ../JACS/jacs/jacs.config.json
 *
 * Run with: npm run test:integration
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { JacsAgent } from "@hai-ai/jacs";
import path from "path";
import fs from "fs";
import {
  buildAgentStateDocument,
  buildCommitmentDocument,
  buildTodoDocument,
  buildMessageDocument,
} from "../src/tools/documents";

// JACS workspace root (where jacs.config.json lives, relative paths resolve from here)
const JACS_ROOT = path.resolve(__dirname, "../../JACS/jacs");
const TEST_CONFIG = path.join(JACS_ROOT, "jacs.config.json");
const DOCS_DIR = path.join(JACS_ROOT, "documents");

let agent: JacsAgent;
let originalCwd: string;
// Track document files created during tests so we can clean up
const createdDocFiles: string[] = [];

function cleanupDoc(docId: string): void {
  const filePath = path.join(DOCS_DIR, `${docId}.json`);
  try { fs.unlinkSync(filePath); } catch {}
}

beforeAll(() => {
  originalCwd = process.cwd();
  // The JACS config uses relative paths (tests/fixtures, tests/fixtures/keys)
  // so we must chdir to the JACS workspace root
  process.chdir(JACS_ROOT);
  agent = new JacsAgent();
  agent.load(TEST_CONFIG);
});

afterAll(() => {
  // Clean up any documents saved during tests
  for (const docId of createdDocFiles) {
    cleanupDoc(docId);
  }
  process.chdir(originalCwd);
});

describe("Integration: JacsAgent basics", () => {
  it("loads successfully and can verify itself", () => {
    const isValid = agent.verifyAgent();
    expect(isValid).toBe(true);
  });

  it("can sign and verify a string", () => {
    const data = "hello from moltyjacs integration test";
    const signature = agent.signString(data);
    expect(signature).toBeTruthy();
    expect(typeof signature).toBe("string");
    expect(signature.length).toBeGreaterThan(10);
  });
});

describe("Integration: Agent State documents", () => {
  it("creates and verifies a memory state document", () => {
    const doc = buildAgentStateDocument({
      stateType: "memory",
      name: "Integration Test Memory",
      description: "A memory document created during integration testing",
      content: "key=value pairs stored here",
      contentType: "text/plain",
      framework: "openclaw",
      tags: ["test", "integration"],
    });

    const signed = agent.createDocument(JSON.stringify(doc), null, null, true, null, null);
    const parsed = JSON.parse(signed);

    // Verify JACS header fields were added
    expect(parsed.jacsId).toBeTruthy();
    expect(parsed.jacsVersion).toBeTruthy();
    expect(parsed.jacsSignature).toBeTruthy();
    expect(parsed.jacsSignature.signature).toBeTruthy();
    expect(parsed.jacsSignature.agentID).toBeTruthy();
    expect(parsed.jacsSha256).toBeTruthy();

    // Verify our content is preserved
    expect(parsed.jacsType).toBe("agentstate");
    expect(parsed.jacsAgentStateType).toBe("memory");
    expect(parsed.jacsAgentStateName).toBe("Integration Test Memory");
    expect(parsed.jacsAgentStateContent).toBe("key=value pairs stored here");
    expect(parsed.jacsAgentStateTags).toEqual(["test", "integration"]);

    // Verify the document cryptographically
    const isValid = agent.verifyDocument(signed);
    expect(isValid).toBe(true);
  });

  it("creates skill, plan, config, and hook state types", () => {
    for (const stateType of ["skill", "plan", "config", "hook"] as const) {
      const doc = buildAgentStateDocument({
        stateType,
        name: `Test ${stateType}`,
      });

      const signed = agent.createDocument(JSON.stringify(doc), null, null, true, null, null);
      const parsed = JSON.parse(signed);

      expect(parsed.jacsAgentStateType).toBe(stateType);
      expect(agent.verifyDocument(signed)).toBe(true);
    }
  });

  it("detects tampering in an agent state document", () => {
    const doc = buildAgentStateDocument({
      stateType: "memory",
      name: "Tamper Test",
      content: "original content",
    });

    const signed = agent.createDocument(JSON.stringify(doc), null, null, true, null, null);
    const parsed = JSON.parse(signed);

    // Tamper with the content
    parsed.jacsAgentStateContent = "TAMPERED content";
    const tampered = JSON.stringify(parsed);

    expect(() => agent.verifyDocument(tampered)).toThrow();
  });
});

describe("Integration: Commitment documents", () => {
  it("creates and verifies a commitment", () => {
    const doc = buildCommitmentDocument({
      description: "Deliver code review by Friday",
      status: "pending",
      terms: { deliverable: "code review", deadline: "Friday" },
      question: "Will you complete the review?",
      startDate: "2025-01-01T00:00:00Z",
      endDate: "2025-01-05T00:00:00Z",
    });

    const signed = agent.createDocument(JSON.stringify(doc), null, null, true, null, null);
    const parsed = JSON.parse(signed);

    expect(parsed.jacsType).toBe("commitment");
    expect(parsed.jacsCommitmentDescription).toBe("Deliver code review by Friday");
    expect(parsed.jacsCommitmentStatus).toBe("pending");
    expect(parsed.jacsCommitmentTerms).toEqual({
      deliverable: "code review",
      deadline: "Friday",
    });
    expect(parsed.jacsCommitmentQuestion).toBe("Will you complete the review?");

    expect(agent.verifyDocument(signed)).toBe(true);
  });

  it("creates a commitment with recurrence", () => {
    const doc = buildCommitmentDocument({
      description: "Weekly standup report",
      recurrence: { frequency: "weekly", interval: 1 },
    });

    const signed = agent.createDocument(JSON.stringify(doc), null, null, true, null, null);
    const parsed = JSON.parse(signed);

    expect(parsed.jacsCommitmentRecurrence).toEqual({
      frequency: "weekly",
      interval: 1,
    });

    expect(agent.verifyDocument(signed)).toBe(true);
  });

  it("updates a commitment status", () => {
    // Create initial commitment (noSave: true returns JSON)
    const doc = buildCommitmentDocument({
      description: "Test commitment for update",
      status: "pending",
    });

    const signed = agent.createDocument(JSON.stringify(doc), null, null, true, null, null);
    const parsed = JSON.parse(signed);
    const docId = parsed.jacsId;

    // Manually save to disk so updateDocument can find it
    const docPath = path.join(DOCS_DIR, `${docId}.json`);
    fs.writeFileSync(docPath, signed);
    createdDocFiles.push(docId);

    // Update status to active
    parsed.jacsCommitmentStatus = "active";
    const updated = agent.updateDocument(docId, JSON.stringify(parsed));
    const updatedParsed = JSON.parse(updated);
    createdDocFiles.push(updatedParsed.jacsId);

    expect(updatedParsed.jacsCommitmentStatus).toBe("active");
    expect(updatedParsed.jacsVersion).not.toBe(parsed.jacsVersion);

    expect(agent.verifyDocument(updated)).toBe(true);
  });

  it("detects tampering in a commitment", () => {
    const doc = buildCommitmentDocument({
      description: "Secure commitment",
      status: "active",
    });

    const signed = agent.createDocument(JSON.stringify(doc), null, null, true, null, null);
    const parsed = JSON.parse(signed);

    parsed.jacsCommitmentDescription = "TAMPERED description";
    expect(() => agent.verifyDocument(JSON.stringify(parsed))).toThrow();
  });
});

describe("Integration: Todo documents", () => {
  it("creates and verifies a todo list with items", () => {
    const doc = buildTodoDocument({
      name: "Sprint 12 Tasks",
      items: [
        { itemType: "goal", description: "Complete API redesign", priority: "high" },
        { itemType: "task", description: "Write unit tests", priority: "medium", tags: ["testing"] },
      ],
    });

    const signed = agent.createDocument(JSON.stringify(doc), null, null, true, null, null);
    const parsed = JSON.parse(signed);

    expect(parsed.jacsType).toBe("todo");
    expect(parsed.jacsTodoName).toBe("Sprint 12 Tasks");
    expect(parsed.jacsTodoItems).toHaveLength(2);
    expect(parsed.jacsTodoItems[0].itemType).toBe("goal");
    expect(parsed.jacsTodoItems[0].description).toBe("Complete API redesign");
    expect(parsed.jacsTodoItems[0].itemId).toBeTruthy();
    expect(parsed.jacsTodoItems[1].tags).toEqual(["testing"]);

    expect(agent.verifyDocument(signed)).toBe(true);
  });

  it("creates an empty todo list", () => {
    const doc = buildTodoDocument({ name: "Empty List" });

    const signed = agent.createDocument(JSON.stringify(doc), null, null, true, null, null);
    const parsed = JSON.parse(signed);

    expect(parsed.jacsTodoName).toBe("Empty List");
    expect(parsed.jacsTodoItems).toEqual([]);
    expect(agent.verifyDocument(signed)).toBe(true);
  });

  it("adds items to a todo list via updateDocument", () => {
    const doc = buildTodoDocument({ name: "Updatable List" });
    const signed = agent.createDocument(JSON.stringify(doc), null, null, true, null, null);
    const parsed = JSON.parse(signed);
    const docId = parsed.jacsId;

    // Manually save to disk so updateDocument can find the original
    const docPath = path.join(DOCS_DIR, `${docId}.json`);
    fs.writeFileSync(docPath, signed);
    createdDocFiles.push(docId);

    // Add an item
    parsed.jacsTodoItems.push({
      itemId: "test-item-001",
      itemType: "task",
      description: "Added via update",
      status: "pending",
    });

    const updated = agent.updateDocument(docId, JSON.stringify(parsed));
    const updatedParsed = JSON.parse(updated);
    createdDocFiles.push(updatedParsed.jacsId);

    expect(updatedParsed.jacsTodoItems).toHaveLength(1);
    expect(updatedParsed.jacsTodoItems[0].description).toBe("Added via update");
    expect(agent.verifyDocument(updated)).toBe(true);
  });
});

describe("Integration: Message/Conversation documents", () => {
  it("creates and verifies a conversation-starting message", () => {
    const doc = buildMessageDocument({
      threadId: "test-thread-001",
      content: { body: "Hello, let's negotiate terms" },
      to: ["agent-bob"],
      from: ["agent-alice"],
    });

    const signed = agent.createDocument(JSON.stringify(doc), null, null, true, null, null);
    const parsed = JSON.parse(signed);

    expect(parsed.jacsType).toBe("message");
    expect(parsed.threadID).toBe("test-thread-001");
    expect(parsed.content.body).toBe("Hello, let's negotiate terms");
    expect(parsed.to).toEqual(["agent-bob"]);
    expect(parsed.from).toEqual(["agent-alice"]);

    expect(agent.verifyDocument(signed)).toBe(true);
  });

  it("creates a reply message with previousMessageId", () => {
    // First message
    const msg1 = buildMessageDocument({
      threadId: "test-thread-002",
      content: { body: "Initial message" },
      to: ["agent-bob"],
      from: ["agent-alice"],
    });
    const signed1 = agent.createDocument(JSON.stringify(msg1), null, null, true, null, null);
    const parsed1 = JSON.parse(signed1);

    // Reply
    const msg2 = buildMessageDocument({
      threadId: "test-thread-002",
      content: { body: "Reply to initial message" },
      to: ["agent-alice"],
      from: ["agent-bob"],
      previousMessageId: parsed1.jacsId,
    });
    const signed2 = agent.createDocument(JSON.stringify(msg2), null, null, true, null, null);
    const parsed2 = JSON.parse(signed2);

    expect(parsed2.threadID).toBe("test-thread-002");
    expect(parsed2.jacsMessagePreviousId).toBe(parsed1.jacsId);
    expect(parsed2.content.body).toBe("Reply to initial message");

    expect(agent.verifyDocument(signed2)).toBe(true);
  });

  it("detects tampering in a message", () => {
    const doc = buildMessageDocument({
      threadId: "tamper-thread",
      content: { body: "Original message" },
      to: ["agent-b"],
      from: ["agent-a"],
    });

    const signed = agent.createDocument(JSON.stringify(doc), null, null, true, null, null);
    const parsed = JSON.parse(signed);

    parsed.content.body = "TAMPERED message";
    expect(() => agent.verifyDocument(JSON.stringify(parsed))).toThrow();
  });
});

describe("Integration: Cross-document verification", () => {
  it("each document type produces unique IDs and signatures", () => {
    const docs = [
      buildAgentStateDocument({ stateType: "memory", name: "State 1" }),
      buildCommitmentDocument({ description: "Commitment 1" }),
      buildTodoDocument({ name: "Todo 1" }),
      buildMessageDocument({
        threadId: "unique-test",
        content: "Message 1",
        to: ["a"],
        from: ["b"],
      }),
    ];

    const signedDocs = docs.map((doc) =>
      JSON.parse(agent.createDocument(JSON.stringify(doc), null, null, true, null, null))
    );

    // All IDs should be unique
    const ids = signedDocs.map((d) => d.jacsId);
    expect(new Set(ids).size).toBe(4);

    // All hashes should be unique
    const hashes = signedDocs.map((d) => d.jacsSha256);
    expect(new Set(hashes).size).toBe(4);

    // All should verify independently
    for (const doc of signedDocs) {
      expect(agent.verifyDocument(JSON.stringify(doc))).toBe(true);
    }
  });
});
