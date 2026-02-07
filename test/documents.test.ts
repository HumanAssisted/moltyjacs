/**
 * Tests for document builder functions in src/tools/documents.ts
 */

import { describe, it, expect } from "vitest";
import {
  buildAgentStateDocument,
  buildCommitmentDocument,
  buildTodoDocument,
  buildMessageDocument,
} from "../src/tools/documents";

describe("buildAgentStateDocument", () => {
  it("creates minimal agent state with required fields", () => {
    const doc = buildAgentStateDocument({
      stateType: "memory",
      name: "Project Memory",
    });

    expect(doc.$schema).toBe("https://hai.ai/schemas/agentstate/v1/agentstate.schema.json");
    expect(doc.jacsType).toBe("agentstate");
    expect(doc.jacsLevel).toBe("config");
    expect(doc.jacsAgentStateType).toBe("memory");
    expect(doc.jacsAgentStateName).toBe("Project Memory");
  });

  it("includes optional fields when provided", () => {
    const doc = buildAgentStateDocument({
      stateType: "skill",
      name: "code-review",
      description: "A skill for code review",
      content: "# Code Review\nReview code carefully",
      contentType: "text/markdown",
      framework: "claude-code",
      tags: ["review", "code"],
      origin: "authored",
      sourceUrl: "https://example.com/skill",
    });

    expect(doc.jacsAgentStateDescription).toBe("A skill for code review");
    expect(doc.jacsAgentStateContent).toBe("# Code Review\nReview code carefully");
    expect(doc.jacsAgentStateContentType).toBe("text/markdown");
    expect(doc.jacsAgentStateFramework).toBe("claude-code");
    expect(doc.jacsAgentStateTags).toEqual(["review", "code"]);
    expect(doc.jacsAgentStateOrigin).toBe("authored");
    expect(doc.jacsAgentStateSourceUrl).toBe("https://example.com/skill");
  });

  it("omits optional fields when not provided", () => {
    const doc = buildAgentStateDocument({
      stateType: "config",
      name: "test-config",
    });

    expect(doc.jacsAgentStateDescription).toBeUndefined();
    expect(doc.jacsAgentStateContent).toBeUndefined();
    expect(doc.jacsAgentStateContentType).toBeUndefined();
    expect(doc.jacsAgentStateFramework).toBeUndefined();
    expect(doc.jacsAgentStateTags).toBeUndefined();
  });

  it("omits tags when empty array", () => {
    const doc = buildAgentStateDocument({
      stateType: "plan",
      name: "test-plan",
      tags: [],
    });

    expect(doc.jacsAgentStateTags).toBeUndefined();
  });

  it("supports all state types", () => {
    const types = ["memory", "skill", "plan", "config", "hook", "other"] as const;
    for (const stateType of types) {
      const doc = buildAgentStateDocument({ stateType, name: `test-${stateType}` });
      expect(doc.jacsAgentStateType).toBe(stateType);
    }
  });
});

describe("buildCommitmentDocument", () => {
  it("creates minimal commitment with required fields", () => {
    const doc = buildCommitmentDocument({
      description: "Deliver API docs by Friday",
    });

    expect(doc.$schema).toBe("https://hai.ai/schemas/commitment/v1/commitment.schema.json");
    expect(doc.jacsType).toBe("commitment");
    expect(doc.jacsLevel).toBe("config");
    expect(doc.jacsCommitmentDescription).toBe("Deliver API docs by Friday");
    expect(doc.jacsCommitmentStatus).toBe("pending");
  });

  it("sets custom initial status", () => {
    const doc = buildCommitmentDocument({
      description: "Already agreed upon task",
      status: "active",
    });

    expect(doc.jacsCommitmentStatus).toBe("active");
  });

  it("includes terms when provided", () => {
    const terms = {
      deliverable: "API documentation",
      deadline: "2026-02-14",
      compensation: 500,
    };

    const doc = buildCommitmentDocument({
      description: "Deliver API docs",
      terms,
    });

    expect(doc.jacsCommitmentTerms).toEqual(terms);
  });

  it("includes dates when provided", () => {
    const doc = buildCommitmentDocument({
      description: "Weekly report",
      startDate: "2026-02-01T00:00:00Z",
      endDate: "2026-02-28T23:59:59Z",
    });

    expect(doc.jacsCommitmentStartDate).toBe("2026-02-01T00:00:00Z");
    expect(doc.jacsCommitmentEndDate).toBe("2026-02-28T23:59:59Z");
  });

  it("includes recurrence when provided", () => {
    const doc = buildCommitmentDocument({
      description: "Weekly standup",
      recurrence: { frequency: "weekly", interval: 1 },
    });

    expect(doc.jacsCommitmentRecurrence).toEqual({
      frequency: "weekly",
      interval: 1,
    });
  });

  it("includes cross-references when provided", () => {
    const doc = buildCommitmentDocument({
      description: "Linked commitment",
      conversationRef: "conv-uuid-123",
      todoRef: "list-uuid:item-uuid",
      taskId: "task-uuid-456",
    });

    expect(doc.jacsCommitmentConversationRef).toBe("conv-uuid-123");
    expect(doc.jacsCommitmentTodoRef).toBe("list-uuid:item-uuid");
    expect(doc.jacsCommitmentTaskId).toBe("task-uuid-456");
  });

  it("includes question when provided", () => {
    const doc = buildCommitmentDocument({
      description: "Do you agree to the terms?",
      question: "Will you deliver by Friday?",
    });

    expect(doc.jacsCommitmentQuestion).toBe("Will you deliver by Friday?");
  });

  it("omits optional fields when not provided", () => {
    const doc = buildCommitmentDocument({
      description: "Minimal commitment",
    });

    expect(doc.jacsCommitmentTerms).toBeUndefined();
    expect(doc.jacsCommitmentQuestion).toBeUndefined();
    expect(doc.jacsCommitmentStartDate).toBeUndefined();
    expect(doc.jacsCommitmentEndDate).toBeUndefined();
    expect(doc.jacsCommitmentRecurrence).toBeUndefined();
    expect(doc.jacsCommitmentConversationRef).toBeUndefined();
    expect(doc.jacsCommitmentTodoRef).toBeUndefined();
    expect(doc.jacsCommitmentTaskId).toBeUndefined();
  });
});

describe("buildTodoDocument", () => {
  it("creates minimal todo list with empty items", () => {
    const doc = buildTodoDocument({ name: "My Tasks" });

    expect(doc.$schema).toBe("https://hai.ai/schemas/todo/v1/todo.schema.json");
    expect(doc.jacsType).toBe("todo");
    expect(doc.jacsLevel).toBe("config");
    expect(doc.jacsTodoName).toBe("My Tasks");
    expect(doc.jacsTodoItems).toEqual([]);
  });

  it("creates todo list with initial items", () => {
    const doc = buildTodoDocument({
      name: "Sprint 12",
      items: [
        { itemType: "goal", description: "Complete auth system" },
        { itemType: "task", description: "Implement JWT", priority: "high" },
      ],
    });

    expect(doc.jacsTodoItems).toHaveLength(2);

    const goal = doc.jacsTodoItems[0];
    expect(goal.itemType).toBe("goal");
    expect(goal.description).toBe("Complete auth system");
    expect(goal.status).toBe("pending");
    expect(goal.itemId).toBeDefined();
    expect(goal.itemId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

    const task = doc.jacsTodoItems[1];
    expect(task.itemType).toBe("task");
    expect(task.description).toBe("Implement JWT");
    expect(task.priority).toBe("high");
    expect(task.status).toBe("pending");
  });

  it("generates unique UUIDs for each item", () => {
    const doc = buildTodoDocument({
      name: "Test",
      items: [
        { itemType: "task", description: "Task 1" },
        { itemType: "task", description: "Task 2" },
        { itemType: "task", description: "Task 3" },
      ],
    });

    const ids = doc.jacsTodoItems.map((item: any) => item.itemId);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(3);
  });

  it("includes tags when provided", () => {
    const doc = buildTodoDocument({
      name: "Tagged Tasks",
      items: [
        { itemType: "task", description: "Tagged task", tags: ["urgent", "frontend"] },
      ],
    });

    expect(doc.jacsTodoItems[0].tags).toEqual(["urgent", "frontend"]);
  });

  it("omits priority when not provided", () => {
    const doc = buildTodoDocument({
      name: "Test",
      items: [{ itemType: "task", description: "No priority" }],
    });

    expect(doc.jacsTodoItems[0].priority).toBeUndefined();
  });
});

describe("buildMessageDocument", () => {
  it("creates message with required fields", () => {
    const doc = buildMessageDocument({
      threadId: "thread-123",
      content: { body: "Hello world", subject: "Greeting" },
      to: ["agent-1"],
      from: ["agent-2"],
    });

    expect(doc.$schema).toBe("https://hai.ai/schemas/message/v1/message.schema.json");
    expect(doc.jacsType).toBe("message");
    expect(doc.jacsLevel).toBe("raw");
    expect(doc.threadID).toBe("thread-123");
    expect(doc.content).toEqual({ body: "Hello world", subject: "Greeting" });
    expect(doc.to).toEqual(["agent-1"]);
    expect(doc.from).toEqual(["agent-2"]);
  });

  it("wraps string content in object", () => {
    const doc = buildMessageDocument({
      threadId: "thread-456",
      content: "Plain text message",
      to: ["agent-1"],
      from: ["agent-2"],
    });

    expect(doc.content).toEqual({ body: "Plain text message" });
  });

  it("includes previousMessageId when provided", () => {
    const doc = buildMessageDocument({
      threadId: "thread-123",
      content: { body: "Reply" },
      to: ["agent-1"],
      from: ["agent-2"],
      previousMessageId: "prev-msg-uuid",
    });

    expect(doc.jacsMessagePreviousId).toBe("prev-msg-uuid");
  });

  it("omits previousMessageId when not provided", () => {
    const doc = buildMessageDocument({
      threadId: "thread-123",
      content: { body: "First message" },
      to: ["agent-1"],
      from: ["agent-2"],
    });

    expect(doc.jacsMessagePreviousId).toBeUndefined();
  });

  it("supports multiple to/from addresses", () => {
    const doc = buildMessageDocument({
      threadId: "thread-789",
      content: { body: "Group message" },
      to: ["agent-1", "agent-2", "agent-3"],
      from: ["agent-4"],
    });

    expect(doc.to).toHaveLength(3);
    expect(doc.from).toHaveLength(1);
  });
});
