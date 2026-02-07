/**
 * Tests for tool handlers - tests that tools call agent methods correctly
 * and handle error cases properly.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createMockApi, invokeTool, MockJacsAgent } from "./setup";
import { registerTools } from "../src/tools/index";

describe("Document Tool Handlers", () => {
  let api: ReturnType<typeof createMockApi>;
  let mockAgent: MockJacsAgent;

  beforeEach(() => {
    api = createMockApi({ initialized: true });
    mockAgent = api.mockAgent;
    registerTools(api);
  });

  // ===== Agent State Tools =====

  describe("jacs_create_agentstate", () => {
    it("is registered as a tool", () => {
      expect(api.registeredTools.has("jacs_create_agentstate")).toBe(true);
    });

    it("creates agent state document via createDocument", async () => {
      const result = await invokeTool(api, "jacs_create_agentstate", {
        stateType: "memory",
        name: "Project Memory",
        description: "Working memory for the project",
      });

      expect(result.error).toBeUndefined();
      expect(result.result).toBeDefined();
      expect(result.result.jacsAgentStateType).toBe("memory");
      expect(result.result.jacsAgentStateName).toBe("Project Memory");
      expect(result.result.jacsSignature).toBeDefined();

      // Verify createDocument was called
      const call = mockAgent.getLastCall("createDocument");
      expect(call).toBeDefined();
      const inputDoc = JSON.parse(call!.args[0]);
      expect(inputDoc.$schema).toBe("https://hai.ai/schemas/agentstate/v1/agentstate.schema.json");
    });

    it("returns error when JACS not initialized", async () => {
      const uninitApi = createMockApi({ initialized: false });
      registerTools(uninitApi);

      const result = await invokeTool(uninitApi, "jacs_create_agentstate", {
        stateType: "memory",
        name: "Test",
      });

      expect(result.error).toContain("JACS not initialized");
    });

    it("passes tags correctly", async () => {
      const result = await invokeTool(api, "jacs_create_agentstate", {
        stateType: "skill",
        name: "test-skill",
        tags: ["review", "code"],
      });

      expect(result.result.jacsAgentStateTags).toEqual(["review", "code"]);
    });
  });

  describe("jacs_sign_file_as_state", () => {
    it("is registered as a tool", () => {
      expect(api.registeredTools.has("jacs_sign_file_as_state")).toBe(true);
    });

    it("returns error for missing file", async () => {
      const result = await invokeTool(api, "jacs_sign_file_as_state", {
        stateType: "memory",
        name: "MEMORY.md",
        filePath: "/nonexistent/MEMORY.md",
      });

      expect(result.error).toContain("File not found");
    });
  });

  describe("jacs_verify_agentstate", () => {
    it("is registered as a tool", () => {
      expect(api.registeredTools.has("jacs_verify_agentstate")).toBe(true);
    });

    it("verifies and returns state metadata", async () => {
      const result = await invokeTool(api, "jacs_verify_agentstate", {
        document: {
          jacsId: "test-id",
          jacsAgentStateType: "memory",
          jacsAgentStateName: "Test Memory",
          jacsAgentStateDescription: "A test memory",
          jacsAgentStateFramework: "claude-code",
          jacsAgentStateContentType: "text/markdown",
          jacsSignature: {
            agentID: "agent-123",
            date: "2026-01-01T00:00:00Z",
          },
        },
      });

      expect(result.error).toBeUndefined();
      expect(result.result.valid).toBe(true);
      expect(result.result.stateType).toBe("memory");
      expect(result.result.name).toBe("Test Memory");
      expect(result.result.framework).toBe("claude-code");
    });

    it("returns error on verification failure", async () => {
      mockAgent.verifyDocumentResponse = false;
      // Make verifyDocument throw to simulate failure
      const origVerify = mockAgent.verifyDocument.bind(mockAgent);
      mockAgent.verifyDocument = () => {
        throw new Error("Invalid signature");
      };

      const result = await invokeTool(api, "jacs_verify_agentstate", {
        document: { jacsId: "bad-doc" },
      });

      expect(result.error).toContain("Verification failed");
      mockAgent.verifyDocument = origVerify;
    });
  });

  // ===== Commitment Tools =====

  describe("jacs_create_commitment", () => {
    it("is registered as a tool", () => {
      expect(api.registeredTools.has("jacs_create_commitment")).toBe(true);
    });

    it("creates commitment with default pending status", async () => {
      const result = await invokeTool(api, "jacs_create_commitment", {
        description: "Deliver API documentation",
      });

      expect(result.error).toBeUndefined();
      expect(result.result.jacsCommitmentDescription).toBe("Deliver API documentation");
      expect(result.result.jacsCommitmentStatus).toBe("pending");
      expect(result.result.jacsSignature).toBeDefined();
    });

    it("creates commitment with all fields", async () => {
      const result = await invokeTool(api, "jacs_create_commitment", {
        description: "Weekly standup",
        status: "active",
        terms: { deliverable: "meeting notes" },
        question: "Will you attend?",
        startDate: "2026-02-01T00:00:00Z",
        endDate: "2026-12-31T23:59:59Z",
        recurrence: { frequency: "weekly", interval: 1 },
      });

      expect(result.error).toBeUndefined();
      expect(result.result.jacsCommitmentStatus).toBe("active");
      expect(result.result.jacsCommitmentTerms).toEqual({ deliverable: "meeting notes" });
      expect(result.result.jacsCommitmentRecurrence).toEqual({ frequency: "weekly", interval: 1 });
    });
  });

  describe("jacs_update_commitment", () => {
    it("is registered as a tool", () => {
      expect(api.registeredTools.has("jacs_update_commitment")).toBe(true);
    });

    it("updates commitment status", async () => {
      const result = await invokeTool(api, "jacs_update_commitment", {
        document: {
          jacsId: "commitment-123",
          jacsCommitmentDescription: "Test",
          jacsCommitmentStatus: "pending",
        },
        status: "active",
      });

      expect(result.error).toBeUndefined();
      expect(result.result.jacsCommitmentStatus).toBe("active");

      // Verify updateDocument was called with correct ID
      const call = mockAgent.getLastCall("updateDocument");
      expect(call).toBeDefined();
      expect(call!.args[0]).toBe("commitment-123");
    });

    it("returns error for missing jacsId", async () => {
      const result = await invokeTool(api, "jacs_update_commitment", {
        document: { jacsCommitmentDescription: "No ID" },
        status: "active",
      });

      expect(result.error).toContain("missing jacsId");
    });

    it("sets answer fields", async () => {
      const result = await invokeTool(api, "jacs_update_commitment", {
        document: {
          jacsId: "commitment-123",
          jacsCommitmentDescription: "Test",
          jacsCommitmentStatus: "active",
        },
        answer: "Yes, I agree",
        completionAnswer: "All tasks completed",
      });

      expect(result.result.jacsCommitmentAnswer).toBe("Yes, I agree");
      expect(result.result.jacsCommitmentCompletionAnswer).toBe("All tasks completed");
    });
  });

  describe("jacs_dispute_commitment", () => {
    it("is registered as a tool", () => {
      expect(api.registeredTools.has("jacs_dispute_commitment")).toBe(true);
    });

    it("sets status to disputed with reason", async () => {
      const result = await invokeTool(api, "jacs_dispute_commitment", {
        document: {
          jacsId: "commitment-123",
          jacsCommitmentDescription: "Test",
          jacsCommitmentStatus: "active",
        },
        reason: "Scope changed significantly",
      });

      expect(result.error).toBeUndefined();
      expect(result.result.jacsCommitmentStatus).toBe("disputed");
      expect(result.result.jacsCommitmentDisputeReason).toBe("Scope changed significantly");
    });
  });

  describe("jacs_revoke_commitment", () => {
    it("is registered as a tool", () => {
      expect(api.registeredTools.has("jacs_revoke_commitment")).toBe(true);
    });

    it("sets status to revoked with reason", async () => {
      const result = await invokeTool(api, "jacs_revoke_commitment", {
        document: {
          jacsId: "commitment-123",
          jacsCommitmentDescription: "Test",
          jacsCommitmentStatus: "active",
        },
        reason: "No longer needed",
      });

      expect(result.error).toBeUndefined();
      expect(result.result.jacsCommitmentStatus).toBe("revoked");
      expect(result.result.jacsCommitmentDisputeReason).toBe("No longer needed");
    });
  });

  // ===== Todo Tools =====

  describe("jacs_create_todo", () => {
    it("is registered as a tool", () => {
      expect(api.registeredTools.has("jacs_create_todo")).toBe(true);
    });

    it("creates empty todo list", async () => {
      const result = await invokeTool(api, "jacs_create_todo", {
        name: "Sprint 12",
      });

      expect(result.error).toBeUndefined();
      expect(result.result.jacsTodoName).toBe("Sprint 12");
      expect(result.result.jacsTodoItems).toEqual([]);
    });

    it("creates todo list with initial items", async () => {
      const result = await invokeTool(api, "jacs_create_todo", {
        name: "Sprint 12",
        items: [
          { itemType: "goal", description: "Complete auth system" },
          { itemType: "task", description: "Implement JWT" },
        ],
      });

      expect(result.result.jacsTodoItems).toHaveLength(2);
      expect(result.result.jacsTodoItems[0].itemType).toBe("goal");
      expect(result.result.jacsTodoItems[1].itemType).toBe("task");
    });
  });

  describe("jacs_add_todo_item", () => {
    it("is registered as a tool", () => {
      expect(api.registeredTools.has("jacs_add_todo_item")).toBe(true);
    });

    it("adds item to existing todo list", async () => {
      const result = await invokeTool(api, "jacs_add_todo_item", {
        document: {
          jacsId: "todo-123",
          jacsTodoName: "Sprint 12",
          jacsTodoItems: [],
        },
        itemType: "task",
        description: "New task",
        priority: "high",
      });

      expect(result.error).toBeUndefined();
      expect(result.result.addedItemId).toBeDefined();
      // The document should have the new item in jacsTodoItems
      const updatedDoc = JSON.parse(mockAgent.getLastCall("updateDocument")!.args[1]);
      expect(updatedDoc.jacsTodoItems).toHaveLength(1);
      expect(updatedDoc.jacsTodoItems[0].description).toBe("New task");
      expect(updatedDoc.jacsTodoItems[0].priority).toBe("high");
      expect(updatedDoc.jacsTodoItems[0].status).toBe("pending");
    });

    it("returns error for missing jacsId", async () => {
      const result = await invokeTool(api, "jacs_add_todo_item", {
        document: { jacsTodoName: "No ID" },
        itemType: "task",
        description: "Test",
      });

      expect(result.error).toContain("missing jacsId");
    });
  });

  describe("jacs_update_todo_item", () => {
    it("is registered as a tool", () => {
      expect(api.registeredTools.has("jacs_update_todo_item")).toBe(true);
    });

    it("updates item status", async () => {
      const result = await invokeTool(api, "jacs_update_todo_item", {
        document: {
          jacsId: "todo-123",
          jacsTodoName: "Sprint 12",
          jacsTodoItems: [
            { itemId: "item-1", itemType: "task", description: "Test", status: "pending" },
          ],
        },
        itemId: "item-1",
        status: "in-progress",
      });

      expect(result.error).toBeUndefined();
      const updatedDoc = JSON.parse(mockAgent.getLastCall("updateDocument")!.args[1]);
      expect(updatedDoc.jacsTodoItems[0].status).toBe("in-progress");
    });

    it("sets completedDate when marking completed", async () => {
      const result = await invokeTool(api, "jacs_update_todo_item", {
        document: {
          jacsId: "todo-123",
          jacsTodoName: "Sprint 12",
          jacsTodoItems: [
            { itemId: "item-1", itemType: "task", description: "Test", status: "in-progress" },
          ],
        },
        itemId: "item-1",
        status: "completed",
      });

      expect(result.error).toBeUndefined();
      const updatedDoc = JSON.parse(mockAgent.getLastCall("updateDocument")!.args[1]);
      expect(updatedDoc.jacsTodoItems[0].status).toBe("completed");
      expect(updatedDoc.jacsTodoItems[0].completedDate).toBeDefined();
    });

    it("returns error for non-existent item", async () => {
      const result = await invokeTool(api, "jacs_update_todo_item", {
        document: {
          jacsId: "todo-123",
          jacsTodoName: "Sprint 12",
          jacsTodoItems: [
            { itemId: "item-1", itemType: "task", description: "Test", status: "pending" },
          ],
        },
        itemId: "nonexistent-id",
        status: "completed",
      });

      expect(result.error).toContain("Item not found");
    });

    it("updates description and priority", async () => {
      await invokeTool(api, "jacs_update_todo_item", {
        document: {
          jacsId: "todo-123",
          jacsTodoName: "Sprint 12",
          jacsTodoItems: [
            { itemId: "item-1", itemType: "task", description: "Old desc", status: "pending" },
          ],
        },
        itemId: "item-1",
        description: "New description",
        priority: "critical",
      });

      const updatedDoc = JSON.parse(mockAgent.getLastCall("updateDocument")!.args[1]);
      expect(updatedDoc.jacsTodoItems[0].description).toBe("New description");
      expect(updatedDoc.jacsTodoItems[0].priority).toBe("critical");
    });
  });

  // ===== Conversation Tools =====

  describe("jacs_start_conversation", () => {
    it("is registered as a tool", () => {
      expect(api.registeredTools.has("jacs_start_conversation")).toBe(true);
    });

    it("creates conversation with new thread ID", async () => {
      const result = await invokeTool(api, "jacs_start_conversation", {
        content: { body: "Hello", subject: "Greeting" },
        to: ["agent-1"],
        from: ["agent-2"],
      });

      expect(result.error).toBeUndefined();
      expect(result.result.threadId).toBeDefined();
      expect(result.result.threadID).toBeDefined();
      expect(result.result.jacsSignature).toBeDefined();

      // Verify createDocument was called with correct schema
      const call = mockAgent.getLastCall("createDocument");
      const inputDoc = JSON.parse(call!.args[0]);
      expect(inputDoc.$schema).toBe("https://hai.ai/schemas/message/v1/message.schema.json");
      expect(inputDoc.jacsType).toBe("message");
      expect(inputDoc.threadID).toBeDefined();
    });
  });

  describe("jacs_send_message", () => {
    it("is registered as a tool", () => {
      expect(api.registeredTools.has("jacs_send_message")).toBe(true);
    });

    it("sends message in existing thread", async () => {
      const result = await invokeTool(api, "jacs_send_message", {
        threadId: "thread-123",
        content: { body: "Reply message" },
        to: ["agent-1"],
        from: ["agent-2"],
        previousMessageId: "prev-msg-456",
      });

      expect(result.error).toBeUndefined();
      expect(result.result.threadID).toBe("thread-123");
      expect(result.result.jacsMessagePreviousId).toBe("prev-msg-456");
    });

    it("sends message without previousMessageId", async () => {
      const result = await invokeTool(api, "jacs_send_message", {
        threadId: "thread-123",
        content: { body: "First in thread" },
        to: ["agent-1"],
        from: ["agent-2"],
      });

      expect(result.error).toBeUndefined();
      expect(result.result.jacsMessagePreviousId).toBeUndefined();
    });
  });

  // ===== Existing Tools Still Work =====

  describe("existing tools", () => {
    it("jacs_sign is still registered", () => {
      expect(api.registeredTools.has("jacs_sign")).toBe(true);
    });

    it("jacs_verify is still registered", () => {
      expect(api.registeredTools.has("jacs_verify")).toBe(true);
    });

    it("jacs_hash is still registered", () => {
      expect(api.registeredTools.has("jacs_hash")).toBe(true);
    });

    it("jacs_create_agreement is still registered", () => {
      expect(api.registeredTools.has("jacs_create_agreement")).toBe(true);
    });

    it("jacs_identity is still registered", () => {
      expect(api.registeredTools.has("jacs_identity")).toBe(true);
    });

    it("all 27 tools are registered", () => {
      const expectedTools = [
        "jacs_sign", "jacs_verify", "jacs_verify_auto", "jacs_fetch_pubkey",
        "jacs_verify_with_key", "jacs_dns_lookup", "jacs_lookup_agent",
        "jacs_create_agreement", "jacs_sign_agreement", "jacs_check_agreement",
        "jacs_hash", "jacs_identity",
        "jacs_verify_hai_registration", "jacs_get_attestation", "jacs_set_verification_claim",
        "jacs_create_agentstate", "jacs_sign_file_as_state", "jacs_verify_agentstate",
        "jacs_create_commitment", "jacs_update_commitment", "jacs_dispute_commitment", "jacs_revoke_commitment",
        "jacs_create_todo", "jacs_add_todo_item", "jacs_update_todo_item",
        "jacs_start_conversation", "jacs_send_message",
      ];

      for (const toolName of expectedTools) {
        expect(api.registeredTools.has(toolName), `Missing tool: ${toolName}`).toBe(true);
      }

      expect(api.registeredTools.size).toBe(27);
    });
  });
});

describe("Tool Error Handling", () => {
  it("all document tools return error when JACS not initialized", async () => {
    const api = createMockApi({ initialized: false });
    registerTools(api);

    const toolsToTest = [
      { name: "jacs_create_agentstate", params: { stateType: "memory", name: "test" } },
      { name: "jacs_verify_agentstate", params: { document: {} } },
      { name: "jacs_create_commitment", params: { description: "test" } },
      { name: "jacs_update_commitment", params: { document: { jacsId: "x" } } },
      { name: "jacs_dispute_commitment", params: { document: { jacsId: "x" }, reason: "test" } },
      { name: "jacs_revoke_commitment", params: { document: { jacsId: "x" }, reason: "test" } },
      { name: "jacs_create_todo", params: { name: "test" } },
      { name: "jacs_add_todo_item", params: { document: { jacsId: "x" }, itemType: "task", description: "t" } },
      { name: "jacs_update_todo_item", params: { document: { jacsId: "x" }, itemId: "i" } },
      { name: "jacs_start_conversation", params: { content: {}, to: ["a"], from: ["b"] } },
      { name: "jacs_send_message", params: { threadId: "t", content: {}, to: ["a"], from: ["b"] } },
    ];

    for (const { name, params } of toolsToTest) {
      const result = await invokeTool(api, name, params);
      expect(result.error, `Tool ${name} should return error when uninitialized`).toContain("JACS not initialized");
    }
  });
});
