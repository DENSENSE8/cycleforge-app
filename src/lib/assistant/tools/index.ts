/** Assistant tool registry + runner (plan §3.1/§3.2). */

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
import { getOrderDocuments } from './order-document-tools';
import { listLocationContents, locateProduct } from './wms-tools';
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
  // Warehouse location reads: "where is X" and "what is in bin Y". Both carry
  // their own table to the panel (wms-tools.ts).
  locateProduct,
  listLocationContents,
  // An order's shipping label / packing slip / paired paperwork, opened in the
  // document rail (order-document-tools.ts).
  getOrderDocuments,
  // The two reads that make "move the photos from order A to order B on this
  // carton" expressible: order id → line id, and line → photo ids. The move
  // itself stays behind propose_mutation.
  resolveReceivingLineForOrderTool,
  listReceivingLinePhotosTool,
];

/** The four tool-forge gateway tools (search_tool_registry, submit_approval_decision, execute_build_sandbox, commit_to_git). */
const GATEWAY_TOOLS: ReadonlyArray<AssistantToolDef<any, unknown>> = TOOL_FORGE_GATEWAY_TOOLS;

const ALL_TOOLS: ReadonlyArray<AssistantToolDef<any, unknown>> = [...READ_TOOLS, ...GATEWAY_TOOLS];

export const ASSISTANT_TOOLS: ReadonlyMap<string, AssistantToolDef<any, unknown>> = new Map(
  ALL_TOOLS.map((t) => [t.name, t]),
);

/**
 * The GREEN tier: org-scoped reads with no side effect. The only server tools
 * an Ask-only turn may advertise or dispatch (`access-mode.ts`); the gateway
 * tools submit decisions and commits, so they are not in it.
 */
export const GREEN_READ_TOOL_NAMES: ReadonlySet<string> = new Set(READ_TOOLS.map((t) => t.name));

export function listAssistantTools(ctx?: Pick<AssistantToolCtx, 'permissions' | 'accessMode'>) {
  const pool = ctx?.accessMode === 'ask' ? READ_TOOLS : ALL_TOOLS;
  return pool.filter((t) => !ctx || ctx.permissions.has(t.permission)).map((t) => ({
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

