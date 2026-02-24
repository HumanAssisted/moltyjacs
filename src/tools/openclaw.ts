import type { OpenClawPluginAPI } from "../index";

type ToolHandler<TParams = any, TResult = any> = (params: TParams) => Promise<TResult> | TResult;

export interface ToolDefinition<TParams = any> {
  name: string;
  description: string;
  parameters: Record<string, any>;
  handler: ToolHandler<TParams>;
}

const OPTIONAL_SIDE_EFFECT_TOOLS = new Set<string>([
  "jacs_sign",
  "jacs_create_agreement",
  "jacs_sign_agreement",
  "jacs_set_verification_claim",
  "jacs_hai_register",
  "jacs_hai_claim_username",
  "jacs_hai_update_username",
  "jacs_hai_delete_username",
  "jacs_hai_send_email",
  "jacs_hai_mark_message_read",
  "jacs_hai_mark_message_unread",
  "jacs_hai_delete_message",
  "jacs_hai_reply",
  "jacs_hai_free_chaotic_run",
  "jacs_hai_dns_certified_run",
  "jacs_hai_submit_response",
  "jacs_hai_benchmark_run",
  "jacs_create_agentstate",
  "jacs_sign_file_as_state",
  "jacs_create_commitment",
  "jacs_update_commitment",
  "jacs_dispute_commitment",
  "jacs_revoke_commitment",
  "jacs_create_todo",
  "jacs_add_todo_item",
  "jacs_update_todo_item",
  "jacs_start_conversation",
  "jacs_send_message",
]);

function isOptionalTool(name: string): boolean {
  return OPTIONAL_SIDE_EFFECT_TOOLS.has(name);
}

/**
 * Register a tool with both modern OpenClaw and legacy plugin runtimes:
 * - `execute(id, params)` for current OpenClaw APIs
 * - `handler(params)` for older local test harnesses/runtime shims
 */
export function registerOpenClawTool(api: OpenClawPluginAPI, tool: ToolDefinition): void {
  const handler = tool.handler;
  const execute = async (_invocationId: string, params: any) => handler(params);

  api.registerTool(
    {
      ...tool,
      handler,
      execute,
    },
    { optional: isOptionalTool(tool.name) }
  );
}
