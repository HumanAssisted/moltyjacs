/**
 * JACS Document Type Tools
 *
 * Tools for creating and managing typed JACS documents:
 * - Agent State (memory, skill, plan, config, hook)
 * - Commitments (agreements between agents)
 * - Todo Lists (private work tracking)
 * - Conversations (signed message threads)
 */

import { JacsAgent } from "@hai-ai/jacs";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import * as path from "path";
import type { OpenClawPluginAPI } from "../index";
import type { ToolResult } from "./index";

// Schema URLs for each document type
const SCHEMAS = {
  agentstate: "https://hai.ai/schemas/agentstate/v1/agentstate.schema.json",
  commitment: "https://hai.ai/schemas/commitment/v1/commitment.schema.json",
  todo: "https://hai.ai/schemas/todo/v1/todo.schema.json",
  message: "https://hai.ai/schemas/message/v1/message.schema.json",
} as const;

// Valid agent state types
const AGENT_STATE_TYPES = ["memory", "skill", "plan", "config", "hook", "other"] as const;
type AgentStateType = (typeof AGENT_STATE_TYPES)[number];

// Valid commitment statuses
const COMMITMENT_STATUSES = [
  "pending", "active", "completed", "failed", "renegotiated", "disputed", "revoked",
] as const;
type CommitmentStatus = (typeof COMMITMENT_STATUSES)[number];

// Valid todo item types and statuses
const TODO_ITEM_TYPES = ["goal", "task"] as const;
const TODO_ITEM_STATUSES = ["pending", "in-progress", "completed", "abandoned"] as const;
const TODO_ITEM_PRIORITIES = ["low", "medium", "high", "critical"] as const;

// Recurrence frequencies
const RECURRENCE_FREQUENCIES = [
  "daily", "weekly", "biweekly", "monthly", "quarterly", "yearly",
] as const;

// ---------- Parameter Interfaces ----------

export interface CreateAgentStateParams {
  stateType: AgentStateType;
  name: string;
  description?: string;
  content?: string;
  contentType?: string;
  framework?: string;
  tags?: string[];
  origin?: "authored" | "adopted" | "generated" | "imported";
  sourceUrl?: string;
}

export interface SignFileAsStateParams {
  stateType: AgentStateType;
  name: string;
  filePath: string;
  embed?: boolean;
  description?: string;
  framework?: string;
}

export interface VerifyAgentStateParams {
  document: any;
}

export interface CreateCommitmentParams {
  description: string;
  status?: CommitmentStatus;
  terms?: Record<string, any>;
  question?: string;
  startDate?: string;
  endDate?: string;
  recurrence?: { frequency: string; interval: number };
  conversationRef?: string;
  todoRef?: string;
  taskId?: string;
}

export interface UpdateCommitmentParams {
  document: any;
  status?: CommitmentStatus;
  answer?: string;
  completionAnswer?: string;
  disputeReason?: string;
}

export interface DisputeCommitmentParams {
  document: any;
  reason: string;
}

export interface RevokeCommitmentParams {
  document: any;
  reason: string;
}

export interface CreateTodoParams {
  name: string;
  items?: Array<{
    itemType: "goal" | "task";
    description: string;
    priority?: string;
    tags?: string[];
  }>;
}

export interface AddTodoItemParams {
  document: any;
  itemType: "goal" | "task";
  description: string;
  priority?: string;
  assignedAgent?: string;
  tags?: string[];
}

export interface UpdateTodoItemParams {
  document: any;
  itemId: string;
  status?: string;
  description?: string;
  priority?: string;
}

export interface StartConversationParams {
  content: any;
  to: string[];
  from: string[];
}

export interface SendMessageParams {
  threadId: string;
  content: any;
  to: string[];
  from: string[];
  previousMessageId?: string;
}

// ---------- Helper Functions ----------

/**
 * Get the JACS agent instance from the API runtime
 */
function getAgent(api: OpenClawPluginAPI): JacsAgent | null {
  return api.runtime.jacs?.getAgent() || null;
}

/**
 * Guess MIME type from file extension
 */
function guessMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".md": "text/markdown",
    ".txt": "text/plain",
    ".json": "application/json",
    ".yaml": "application/yaml",
    ".yml": "application/yaml",
    ".js": "application/javascript",
    ".ts": "application/typescript",
    ".sh": "text/x-shellscript",
    ".py": "text/x-python",
    ".html": "text/html",
    ".xml": "application/xml",
    ".csv": "text/csv",
    ".pdf": "application/pdf",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

// ---------- Document Builders (exported for testing) ----------

export function buildAgentStateDocument(params: CreateAgentStateParams): Record<string, any> {
  const doc: Record<string, any> = {
    $schema: SCHEMAS.agentstate,
    jacsType: "agentstate",
    jacsLevel: "config",
    jacsAgentStateType: params.stateType,
    jacsAgentStateName: params.name,
  };

  if (params.description) doc.jacsAgentStateDescription = params.description;
  if (params.content) doc.jacsAgentStateContent = params.content;
  if (params.contentType) doc.jacsAgentStateContentType = params.contentType;
  if (params.framework) doc.jacsAgentStateFramework = params.framework;
  if (params.tags && params.tags.length > 0) doc.jacsAgentStateTags = params.tags;
  if (params.origin) doc.jacsAgentStateOrigin = params.origin;
  if (params.sourceUrl) doc.jacsAgentStateSourceUrl = params.sourceUrl;

  return doc;
}

export function buildCommitmentDocument(params: CreateCommitmentParams): Record<string, any> {
  const doc: Record<string, any> = {
    $schema: SCHEMAS.commitment,
    jacsType: "commitment",
    jacsLevel: "config",
    jacsCommitmentDescription: params.description,
    jacsCommitmentStatus: params.status || "pending",
  };

  if (params.terms) doc.jacsCommitmentTerms = params.terms;
  if (params.question) doc.jacsCommitmentQuestion = params.question;
  if (params.startDate) doc.jacsCommitmentStartDate = params.startDate;
  if (params.endDate) doc.jacsCommitmentEndDate = params.endDate;
  if (params.conversationRef) doc.jacsCommitmentConversationRef = params.conversationRef;
  if (params.todoRef) doc.jacsCommitmentTodoRef = params.todoRef;
  if (params.taskId) doc.jacsCommitmentTaskId = params.taskId;

  if (params.recurrence) {
    doc.jacsCommitmentRecurrence = {
      frequency: params.recurrence.frequency,
      interval: params.recurrence.interval,
    };
  }

  return doc;
}

export function buildTodoDocument(params: CreateTodoParams): Record<string, any> {
  const items = (params.items || []).map((item) => ({
    itemId: uuidv4(),
    itemType: item.itemType,
    description: item.description,
    status: "pending" as const,
    ...(item.priority && { priority: item.priority }),
    ...(item.tags && item.tags.length > 0 && { tags: item.tags }),
  }));

  return {
    $schema: SCHEMAS.todo,
    jacsType: "todo",
    jacsLevel: "config",
    jacsTodoName: params.name,
    jacsTodoItems: items,
  };
}

export function buildMessageDocument(params: {
  threadId: string;
  content: any;
  to: string[];
  from: string[];
  previousMessageId?: string;
}): Record<string, any> {
  const doc: Record<string, any> = {
    $schema: SCHEMAS.message,
    jacsType: "message",
    jacsLevel: "raw",
    threadID: params.threadId,
    content: typeof params.content === "string" ? { body: params.content } : params.content,
    to: params.to,
    from: params.from,
  };

  if (params.previousMessageId) {
    doc.jacsMessagePreviousId = params.previousMessageId;
  }

  return doc;
}

// ---------- Tool Registration ----------

export function registerDocumentTools(api: OpenClawPluginAPI): void {
  // ===== Agent State Tools =====

  api.registerTool({
    name: "jacs_create_agentstate",
    description:
      "Create a signed agent state document. Use this to sign and track agent memory, skills, plans, configs, or hooks with cryptographic provenance.",
    parameters: {
      type: "object",
      properties: {
        stateType: {
          type: "string",
          enum: AGENT_STATE_TYPES,
          description: "Type of agent state: memory, skill, plan, config, hook, or other",
        },
        name: {
          type: "string",
          description: "Human-readable name (e.g., 'Project Memory', 'code-review skill')",
        },
        description: {
          type: "string",
          description: "Description of what this state document contains",
        },
        content: {
          type: "string",
          description: "The content to embed inline (for small documents)",
        },
        contentType: {
          type: "string",
          description: "MIME type of the content (e.g., 'text/markdown', 'application/json')",
        },
        framework: {
          type: "string",
          description: "Which agent framework this is for (e.g., 'claude-code', 'openclaw', 'generic')",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags for categorization and search",
        },
        origin: {
          type: "string",
          enum: ["authored", "adopted", "generated", "imported"],
          description: "How this state document was created",
        },
        sourceUrl: {
          type: "string",
          description: "Where the original content was obtained from",
        },
      },
      required: ["stateType", "name"],
    },
    handler: async (params: CreateAgentStateParams): Promise<ToolResult> => {
      const agent = getAgent(api);
      if (!agent) {
        return { error: "JACS not initialized. Run 'openclaw jacs init' first." };
      }

      try {
        const doc = buildAgentStateDocument(params);
        const signed = agent.createDocument(JSON.stringify(doc), null, null, true, null, null);
        return { result: JSON.parse(signed) };
      } catch (err: any) {
        return { error: `Failed to create agent state: ${err.message}` };
      }
    },
  });

  api.registerTool({
    name: "jacs_sign_file_as_state",
    description:
      "Sign a file as agent state with a path reference and SHA-256 hash. Use this to create provenance records for MEMORY.md, SKILL.md, config files, or hook scripts.",
    parameters: {
      type: "object",
      properties: {
        stateType: {
          type: "string",
          enum: AGENT_STATE_TYPES,
          description: "Type of agent state",
        },
        name: {
          type: "string",
          description: "Human-readable name for this state document",
        },
        filePath: {
          type: "string",
          description: "Path to the file to sign",
        },
        embed: {
          type: "boolean",
          description: "Embed file content in the document (default: false, hooks always embed)",
        },
        description: {
          type: "string",
          description: "Description of the file",
        },
        framework: {
          type: "string",
          description: "Agent framework (e.g., 'claude-code', 'openclaw')",
        },
      },
      required: ["stateType", "name", "filePath"],
    },
    handler: async (params: SignFileAsStateParams): Promise<ToolResult> => {
      const agent = getAgent(api);
      if (!agent) {
        return { error: "JACS not initialized. Run 'openclaw jacs init' first." };
      }

      if (!fs.existsSync(params.filePath)) {
        return { error: `File not found: ${params.filePath}` };
      }

      try {
        // Hooks always embed for security
        const shouldEmbed = params.stateType === "hook" ? true : (params.embed ?? false);
        const contentType = guessMimeType(params.filePath);

        const doc = buildAgentStateDocument({
          stateType: params.stateType,
          name: params.name,
          description: params.description,
          contentType,
          framework: params.framework,
          origin: "authored",
        });

        const signed = agent.createDocument(
          JSON.stringify(doc),
          null,
          null,
          true,
          params.filePath,
          shouldEmbed
        );
        return { result: JSON.parse(signed) };
      } catch (err: any) {
        return { error: `Failed to sign file as state: ${err.message}` };
      }
    },
  });

  api.registerTool({
    name: "jacs_verify_agentstate",
    description:
      "Verify an agent state document's signature and integrity. Returns the state type, name, and verification status.",
    parameters: {
      type: "object",
      properties: {
        document: {
          type: "object",
          description: "The agent state document to verify",
        },
      },
      required: ["document"],
    },
    handler: async (params: VerifyAgentStateParams): Promise<ToolResult> => {
      const agent = getAgent(api);
      if (!agent) {
        return { error: "JACS not initialized. Run 'openclaw jacs init' first." };
      }

      try {
        const isValid = agent.verifyDocument(JSON.stringify(params.document));
        return {
          result: {
            valid: isValid,
            stateType: params.document.jacsAgentStateType,
            name: params.document.jacsAgentStateName,
            description: params.document.jacsAgentStateDescription,
            framework: params.document.jacsAgentStateFramework,
            contentType: params.document.jacsAgentStateContentType,
            documentId: params.document.jacsId,
            agentId: params.document.jacsSignature?.agentID,
            signedAt: params.document.jacsSignature?.date,
          },
        };
      } catch (err: any) {
        return { error: `Verification failed: ${err.message}` };
      }
    },
  });

  // ===== Commitment Tools =====

  api.registerTool({
    name: "jacs_create_commitment",
    description:
      "Create a signed commitment document. Commitments track agreements and obligations between agents with lifecycle statuses: pending, active, completed, failed, renegotiated, disputed, revoked.",
    parameters: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "What is being committed to",
        },
        status: {
          type: "string",
          enum: COMMITMENT_STATUSES,
          description: "Initial status (default: 'pending')",
        },
        terms: {
          type: "object",
          description: "Structured terms (deliverable, deadline, compensation, etc.)",
        },
        question: {
          type: "string",
          description: "Question prompt for the commitment",
        },
        startDate: {
          type: "string",
          description: "When the commitment begins (ISO 8601 date-time)",
        },
        endDate: {
          type: "string",
          description: "When the commitment ends/deadline (ISO 8601 date-time)",
        },
        recurrence: {
          type: "object",
          properties: {
            frequency: {
              type: "string",
              enum: RECURRENCE_FREQUENCIES,
            },
            interval: {
              type: "integer",
              minimum: 1,
            },
          },
          required: ["frequency", "interval"],
          description: "Recurrence pattern for recurring commitments",
        },
        conversationRef: {
          type: "string",
          description: "UUID of the conversation thread that produced this commitment",
        },
        todoRef: {
          type: "string",
          description: "Reference to a todo item (format: 'list-uuid:item-uuid')",
        },
        taskId: {
          type: "string",
          description: "UUID of a task this commitment serves",
        },
      },
      required: ["description"],
    },
    handler: async (params: CreateCommitmentParams): Promise<ToolResult> => {
      const agent = getAgent(api);
      if (!agent) {
        return { error: "JACS not initialized. Run 'openclaw jacs init' first." };
      }

      try {
        const doc = buildCommitmentDocument(params);
        const signed = agent.createDocument(JSON.stringify(doc), null, null, true, null, null);
        return { result: JSON.parse(signed) };
      } catch (err: any) {
        return { error: `Failed to create commitment: ${err.message}` };
      }
    },
  });

  api.registerTool({
    name: "jacs_update_commitment",
    description:
      "Update a commitment's status or fields. Use this to transition commitments through their lifecycle: pending -> active -> completed/failed/renegotiated/disputed/revoked.",
    parameters: {
      type: "object",
      properties: {
        document: {
          type: "object",
          description: "The existing commitment document to update",
        },
        status: {
          type: "string",
          enum: COMMITMENT_STATUSES,
          description: "New status for the commitment",
        },
        answer: {
          type: "string",
          description: "Answer to the commitment question",
        },
        completionAnswer: {
          type: "string",
          description: "Answer verifying commitment completion",
        },
        disputeReason: {
          type: "string",
          description: "Reason for dispute (required when status is 'disputed' or 'revoked')",
        },
      },
      required: ["document"],
    },
    handler: async (params: UpdateCommitmentParams): Promise<ToolResult> => {
      const agent = getAgent(api);
      if (!agent) {
        return { error: "JACS not initialized. Run 'openclaw jacs init' first." };
      }

      const doc = { ...params.document };
      const docId = doc.jacsId;

      if (!docId) {
        return { error: "Document missing jacsId field" };
      }

      if (params.status) doc.jacsCommitmentStatus = params.status;
      if (params.answer) doc.jacsCommitmentAnswer = params.answer;
      if (params.completionAnswer) doc.jacsCommitmentCompletionAnswer = params.completionAnswer;
      if (params.disputeReason) doc.jacsCommitmentDisputeReason = params.disputeReason;

      try {
        const updated = agent.updateDocument(docId, JSON.stringify(doc));
        return { result: JSON.parse(updated) };
      } catch (err: any) {
        return { error: `Failed to update commitment: ${err.message}` };
      }
    },
  });

  api.registerTool({
    name: "jacs_dispute_commitment",
    description:
      "Dispute a commitment with a reason. Sets the status to 'disputed' and records the dispute reason.",
    parameters: {
      type: "object",
      properties: {
        document: {
          type: "object",
          description: "The commitment document to dispute",
        },
        reason: {
          type: "string",
          description: "Reason for the dispute",
        },
      },
      required: ["document", "reason"],
    },
    handler: async (params: DisputeCommitmentParams): Promise<ToolResult> => {
      const agent = getAgent(api);
      if (!agent) {
        return { error: "JACS not initialized. Run 'openclaw jacs init' first." };
      }

      const doc = { ...params.document };
      const docId = doc.jacsId;

      if (!docId) {
        return { error: "Document missing jacsId field" };
      }

      doc.jacsCommitmentStatus = "disputed";
      doc.jacsCommitmentDisputeReason = params.reason;

      try {
        const updated = agent.updateDocument(docId, JSON.stringify(doc));
        return { result: JSON.parse(updated) };
      } catch (err: any) {
        return { error: `Failed to dispute commitment: ${err.message}` };
      }
    },
  });

  api.registerTool({
    name: "jacs_revoke_commitment",
    description:
      "Revoke a commitment with a reason. Sets the status to 'revoked' and records the revocation reason.",
    parameters: {
      type: "object",
      properties: {
        document: {
          type: "object",
          description: "The commitment document to revoke",
        },
        reason: {
          type: "string",
          description: "Reason for revocation",
        },
      },
      required: ["document", "reason"],
    },
    handler: async (params: RevokeCommitmentParams): Promise<ToolResult> => {
      const agent = getAgent(api);
      if (!agent) {
        return { error: "JACS not initialized. Run 'openclaw jacs init' first." };
      }

      const doc = { ...params.document };
      const docId = doc.jacsId;

      if (!docId) {
        return { error: "Document missing jacsId field" };
      }

      doc.jacsCommitmentStatus = "revoked";
      doc.jacsCommitmentDisputeReason = params.reason;

      try {
        const updated = agent.updateDocument(docId, JSON.stringify(doc));
        return { result: JSON.parse(updated) };
      } catch (err: any) {
        return { error: `Failed to revoke commitment: ${err.message}` };
      }
    },
  });

  // ===== Todo Tools =====

  api.registerTool({
    name: "jacs_create_todo",
    description:
      "Create a signed todo list. Todo lists are private, signed documents for tracking goals and tasks. Items can be hierarchical with sub-goals and sub-tasks.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name for the todo list (e.g., 'Sprint 12 Tasks', 'Project Goals')",
        },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              itemType: {
                type: "string",
                enum: TODO_ITEM_TYPES,
                description: "goal (broad objective) or task (specific action)",
              },
              description: {
                type: "string",
                description: "Description of the item",
              },
              priority: {
                type: "string",
                enum: TODO_ITEM_PRIORITIES,
              },
              tags: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["itemType", "description"],
          },
          description: "Initial items to add to the list",
        },
      },
      required: ["name"],
    },
    handler: async (params: CreateTodoParams): Promise<ToolResult> => {
      const agent = getAgent(api);
      if (!agent) {
        return { error: "JACS not initialized. Run 'openclaw jacs init' first." };
      }

      try {
        const doc = buildTodoDocument(params);
        const signed = agent.createDocument(JSON.stringify(doc), null, null, true, null, null);
        return { result: JSON.parse(signed) };
      } catch (err: any) {
        return { error: `Failed to create todo list: ${err.message}` };
      }
    },
  });

  api.registerTool({
    name: "jacs_add_todo_item",
    description:
      "Add a new item (goal or task) to an existing todo list. The list is re-signed with a new version.",
    parameters: {
      type: "object",
      properties: {
        document: {
          type: "object",
          description: "The existing todo list document",
        },
        itemType: {
          type: "string",
          enum: TODO_ITEM_TYPES,
          description: "goal (broad objective) or task (specific action)",
        },
        description: {
          type: "string",
          description: "Description of the item",
        },
        priority: {
          type: "string",
          enum: TODO_ITEM_PRIORITIES,
          description: "Priority level",
        },
        assignedAgent: {
          type: "string",
          description: "UUID of the agent assigned to this item",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags for categorization",
        },
      },
      required: ["document", "itemType", "description"],
    },
    handler: async (params: AddTodoItemParams): Promise<ToolResult> => {
      const agent = getAgent(api);
      if (!agent) {
        return { error: "JACS not initialized. Run 'openclaw jacs init' first." };
      }

      const doc = { ...params.document };
      const docId = doc.jacsId;

      if (!docId) {
        return { error: "Document missing jacsId field" };
      }

      const newItem: Record<string, any> = {
        itemId: uuidv4(),
        itemType: params.itemType,
        description: params.description,
        status: "pending",
      };

      if (params.priority) newItem.priority = params.priority;
      if (params.assignedAgent) newItem.assignedAgent = params.assignedAgent;
      if (params.tags && params.tags.length > 0) newItem.tags = params.tags;

      // Append to items array
      if (!Array.isArray(doc.jacsTodoItems)) {
        doc.jacsTodoItems = [];
      }
      doc.jacsTodoItems.push(newItem);

      try {
        const updated = agent.updateDocument(docId, JSON.stringify(doc));
        const result = JSON.parse(updated);
        return {
          result: {
            ...result,
            addedItemId: newItem.itemId,
          },
        };
      } catch (err: any) {
        return { error: `Failed to add todo item: ${err.message}` };
      }
    },
  });

  api.registerTool({
    name: "jacs_update_todo_item",
    description:
      "Update a todo item's status, description, or priority. When marking as 'completed', automatically sets the completion date.",
    parameters: {
      type: "object",
      properties: {
        document: {
          type: "object",
          description: "The existing todo list document",
        },
        itemId: {
          type: "string",
          description: "UUID of the item to update",
        },
        status: {
          type: "string",
          enum: TODO_ITEM_STATUSES,
          description: "New status for the item",
        },
        description: {
          type: "string",
          description: "Updated description",
        },
        priority: {
          type: "string",
          enum: TODO_ITEM_PRIORITIES,
          description: "Updated priority",
        },
      },
      required: ["document", "itemId"],
    },
    handler: async (params: UpdateTodoItemParams): Promise<ToolResult> => {
      const agent = getAgent(api);
      if (!agent) {
        return { error: "JACS not initialized. Run 'openclaw jacs init' first." };
      }

      const doc = { ...params.document };
      const docId = doc.jacsId;

      if (!docId) {
        return { error: "Document missing jacsId field" };
      }

      // Find the item by ID (supports nested items)
      function findItem(items: any[]): any | null {
        for (const item of items) {
          if (item.itemId === params.itemId) return item;
          if (item.childItems && Array.isArray(item.childItems)) {
            const found = findItem(item.childItems);
            if (found) return found;
          }
        }
        return null;
      }

      if (!Array.isArray(doc.jacsTodoItems)) {
        return { error: "Document has no jacsTodoItems array" };
      }

      const item = findItem(doc.jacsTodoItems);
      if (!item) {
        return { error: `Item not found: ${params.itemId}` };
      }

      if (params.status) {
        item.status = params.status;
        if (params.status === "completed") {
          item.completedDate = new Date().toISOString();
        }
      }
      if (params.description) item.description = params.description;
      if (params.priority) item.priority = params.priority;

      try {
        const updated = agent.updateDocument(docId, JSON.stringify(doc));
        return { result: JSON.parse(updated) };
      } catch (err: any) {
        return { error: `Failed to update todo item: ${err.message}` };
      }
    },
  });

  // ===== Conversation Tools =====

  api.registerTool({
    name: "jacs_start_conversation",
    description:
      "Start a new signed conversation thread. Creates a message with a new thread ID that can be replied to with jacs_send_message.",
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "object",
          description: "Message content (body, subject, etc.)",
        },
        to: {
          type: "array",
          items: { type: "string" },
          description: "Recipient agent IDs",
        },
        from: {
          type: "array",
          items: { type: "string" },
          description: "Sender agent IDs",
        },
      },
      required: ["content", "to", "from"],
    },
    handler: async (params: StartConversationParams): Promise<ToolResult> => {
      const agent = getAgent(api);
      if (!agent) {
        return { error: "JACS not initialized. Run 'openclaw jacs init' first." };
      }

      try {
        const threadId = uuidv4();
        const doc = buildMessageDocument({
          threadId,
          content: params.content,
          to: params.to,
          from: params.from,
        });

        const signed = agent.createDocument(JSON.stringify(doc), null, null, true, null, null);
        const result = JSON.parse(signed);
        return {
          result: {
            ...result,
            threadId,
          },
        };
      } catch (err: any) {
        return { error: `Failed to start conversation: ${err.message}` };
      }
    },
  });

  api.registerTool({
    name: "jacs_send_message",
    description:
      "Send a signed message in an existing conversation thread. Messages are chained via previousMessageId for ordering.",
    parameters: {
      type: "object",
      properties: {
        threadId: {
          type: "string",
          description: "UUID of the conversation thread",
        },
        content: {
          type: "object",
          description: "Message content (body, subject, etc.)",
        },
        to: {
          type: "array",
          items: { type: "string" },
          description: "Recipient agent IDs",
        },
        from: {
          type: "array",
          items: { type: "string" },
          description: "Sender agent IDs",
        },
        previousMessageId: {
          type: "string",
          description: "UUID of the previous message in this thread (for ordering)",
        },
      },
      required: ["threadId", "content", "to", "from"],
    },
    handler: async (params: SendMessageParams): Promise<ToolResult> => {
      const agent = getAgent(api);
      if (!agent) {
        return { error: "JACS not initialized. Run 'openclaw jacs init' first." };
      }

      try {
        const doc = buildMessageDocument({
          threadId: params.threadId,
          content: params.content,
          to: params.to,
          from: params.from,
          previousMessageId: params.previousMessageId,
        });

        const signed = agent.createDocument(JSON.stringify(doc), null, null, true, null, null);
        return { result: JSON.parse(signed) };
      } catch (err: any) {
        return { error: `Failed to send message: ${err.message}` };
      }
    },
  });
}
