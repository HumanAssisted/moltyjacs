/**
 * Shared `withHaiClient` wrapper for HAI-routed tools.
 *
 * Exports a single `withHaiClient(api, operation)` helper that:
 * - Resolves the HaiClient via the lazy `getHaiClient()` runtime hook
 * - Returns the standard "not initialized" error if absent
 * - Maps known SDK errors (EmailNotActive, RecipientNotFound, RateLimited)
 *   to human-readable error strings
 * - Falls through to `err.message` for everything else
 *
 * Hoisted from a closure inside `registerTools` (src/tools/index.ts) so both
 * `tools/index.ts` and `tools/hai-docstore.ts` can share the same wrapper.
 */

import {
  EmailNotActiveError,
  RecipientNotFoundError,
  RateLimitedError,
} from "@haiai/haiai";
import type { OpenClawPluginAPI } from "../index";
import type { ToolResult } from "./index";

type HaiClientLike = NonNullable<
  Awaited<ReturnType<NonNullable<OpenClawPluginAPI["runtime"]["jacs"]>["getHaiClient"]>>
>;

export async function getHaiClientOrError(
  api: OpenClawPluginAPI
): Promise<{ client: HaiClientLike } | { error: string }> {
  try {
    const client = await api.runtime.jacs?.getHaiClient();
    if (!client) {
      return { error: "HaiClient not available. JACS must be initialized first." };
    }
    return { client };
  } catch (err: any) {
    return { error: `HaiClient unavailable: ${err?.message || String(err)}` };
  }
}

export async function withHaiClient(
  api: OpenClawPluginAPI,
  operation: (client: HaiClientLike) => Promise<any>,
): Promise<ToolResult> {
  const haiClientResult = await getHaiClientOrError(api);
  if ("error" in haiClientResult) {
    return { error: haiClientResult.error };
  }

  try {
    const result = await operation(haiClientResult.client);
    return { result };
  } catch (err: any) {
    if (err instanceof EmailNotActiveError) {
      return { error: "Email not active — claim a username first" };
    }
    if (err instanceof RecipientNotFoundError) {
      return { error: "Recipient not found — check the email address" };
    }
    if (err instanceof RateLimitedError) {
      return { error: "Rate limited — too many emails sent, try again later" };
    }
    return { error: err?.message || String(err) };
  }
}
