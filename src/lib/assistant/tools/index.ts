/**
 * Assistant tool registry + runner (plan §3.1/§3.2).
 *
 * One export the agent loop consumes; MCP can later expose the same entries
 * (name/description/zod-input → JSON schema) over a second transport with no
 * rework. `runAssistantTool` is the single execution chokepoint: unknown-tool
 * → permission → Zod-validate → run, with the org ALWAYS taken from the
 * authenticated ctx (never from model input).
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { AssistantToolCtx, AssistantToolDef, AssistantToolDeps, AssistantToolRunResult } from './types';
import {
  getAssignments,
  getMyTechQueue,
  getOperationsJourney,
  getOrderLookup,
  getPackingKpi,
  getReceivingByTracking,
  getTicketEntities,
  listSupportFollowups,
  listWarrantyClaims,
  lookupSerial,
  lookupWarrantyCoverage,
  searchPhotosTool,
} from './domain-read-tools';
import {
  exactIdSerialSearch,
  getBenchmarks,
  getChatHistory,
  getFeedState,
  getGraph,
  getKpis,
  getMutationHistory,
  getNodeDetail,
  getSignalsByNode,
  getTopReasons,
  getUnitJourney,
  hybridEntitySearch,
  resolveSupportTicket,
  searchNotes,
} from './read-tools';
import {
  listReceivingLinePhotosTool,
  resolveReceivingLineForOrderTool,
} from './receiving-photo-tools';
import { listStaffTool, resolveItemNumberTool } from './item-rule-tools';
import { TOOL_FORGE_GATEWAY_TOOLS } from '@/lib/tool-forge/gateway-tools';

const READ_TOOLS: ReadonlyArray<AssistantToolDef<any, unknown>> = [
  getSignalsByNode,
  getTopReasons,
  getUnitJourney,
  getFeedState,
  getGraph,
  getNodeDetail,
  getBenchmarks,
  getKpis,
  searchNotes,
  getMutationHistory,
  getChatHistory,
  hybridEntitySearch,
  exactIdSerialSearch,
  resolveSupportTicket,
  getOperationsJourney,
  getOrderLookup,
  lookupSerial,
  lookupWarrantyCoverage,
  listWarrantyClaims,
  getAssignments,
  getMyTechQueue,
  listSupportFollowups,
  searchPhotosTool,
  getReceivingByTracking,
  getTicketEntities,
  getPackingKpi,
  // The two reads that make "move the photos from order A to order B on this
  // carton" expressible: order id → line id, and line → photo ids. The move
  // itself stays behind propose_mutation.
  resolveReceivingLineForOrderTool,
  listReceivingLinePhotosTool,
  // "Create a rule for this product": pasted handle → item number, and a
  // spoken name → staff id. The write is propose_mutation
  // automation_rule.upsert_item_staff.
  resolveItemNumberTool,
  listStaffTool,
];

/**
 * The four tool-forge gateway tools (search_tool_registry,
 * submit_approval_decision, execute_build_sandbox, commit_to_git).
 *
 * Registered HERE rather than behind a second gateway, because this map is
 * what src/lib/mcp/tool-server.ts builds tools/list from and dispatches
 * tools/call through — one registry, one chokepoint, one permission check per
 * call. Three of them write, which the read-only registry above does not, so
 * they are kept in a named list: the separation is visible at a glance, and
 * `listAssistantTools` filtering on each tool's OWN permission means a caller
 * holding only `assistant.chat` neither sees them nor can invoke them.
 */
const GATEWAY_TOOLS: ReadonlyArray<AssistantToolDef<any, unknown>> = TOOL_FORGE_GATEWAY_TOOLS;

const ALL_TOOLS: ReadonlyArray<AssistantToolDef<any, unknown>> = [...READ_TOOLS, ...GATEWAY_TOOLS];

export const ASSISTANT_TOOLS: ReadonlyMap<string, AssistantToolDef<any, unknown>> = new Map(
  ALL_TOOLS.map((t) => [t.name, t]),
);

export function listAssistantTools(ctx?: Pick<AssistantToolCtx, 'permissions'>) {
  return ALL_TOOLS.filter((t) => !ctx || ctx.permissions.has(t.permission)).map((t) => ({
    name: t.name,
    description: t.description,
    permission: t.permission,
    inputSchema: t.inputSchema,
  }));
}

const defaultDeps: AssistantToolDeps = {
  query: async (orgId, text, params) => {
    const r = await tenantQuery(orgId, text, params);
    return { rows: r.rows as Array<Record<string, unknown>> };
  },
};

export async function runAssistantTool(
  name: string,
  rawInput: unknown,
  ctx: AssistantToolCtx,
  deps: AssistantToolDeps = defaultDeps,
): Promise<AssistantToolRunResult> {
  const tool = ASSISTANT_TOOLS.get(name);
  if (!tool) return { ok: false, code: 'unknown_tool', error: `Unknown tool "${name}"` };
  if (!ctx.permissions.has(tool.permission)) {
    return { ok: false, code: 'forbidden', error: `Missing permission ${tool.permission} for ${name}` };
  }
  const parsed = tool.inputSchema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return { ok: false, code: 'invalid_input', error: `Invalid input for ${name}: ${parsed.error.message}` };
  }
  try {
    const data = await tool.run(parsed.data, ctx, deps);
    return { ok: true, data };
  } catch (err) {
    // Graceful tool-error surfacing: the agent loop shows the model a clean
    // failure it can route around, never a thrown 500.
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, code: 'tool_error', error: `${name} failed: ${message}` };
  }
}

