/**
 * Minimal MCP (Model Context Protocol) JSON-RPC 2.0 server over the assistant
 * read-tool registry (universal-feed plan Phase 5 — "MCP exposure of the tool
 * registry for power users"). This is the "second transport" the read-tool
 * registry was built for (see tools/index.ts header): it reuses
 * `listAssistantTools` (tools/list) and `runAssistantTool` (tools/call) with
 * ZERO tool rework — org + permissions come from the authenticated request via
 * the injected ctx, never from the MCP client.
 *
 * NOT read-only any more (2026-08-22). It was, and the original note here said
 * so; the tool-forge gateway added four entries to the same registry, three of
 * which write. What keeps that safe is NOT the transport — it is that every
 * entry declares its own permission and both `listAssistantTools` (tools/list)
 * and `runAssistantTool` (tools/call) filter on it. The /api/mcp route gate
 * (`assistant.chat`) decides who reaches the gateway; it decides nothing about
 * what they may do once here. A caller holding only `assistant.chat` sees the
 * read tools and neither sees nor can invoke the writers.
 *
 * The corollary matters more than the note: a new tool that omits a distinct
 * permission, or reuses `assistant.chat`, silently widens that route gate to
 * whatever the tool can do.
 *
 * ## The Warehouse OS verbs are deliberately NOT here
 *
 * `UI_TOOLS` (agent-loop.ts → workspace-tools.ts) are CLIENT tools: the chat
 * loop emits an SSE frame and the operator's browser executes it against the
 * workspace store. An MCP request is a bare HTTP POST with no browser attached
 * to it, so `open_tile` over this transport would have nowhere to land —
 * advertising it would be advertising a tool that silently does nothing. The
 * read half is different and DOES arrive for free: registering a tool in
 * `tools/index.ts` (the session-reflection tools, for instance) exposes it here
 * with no rework, which is the whole point of the shared registry.
 *
 * Transport: Streamable-HTTP request/response — one JSON-RPC message (or batch)
 * per POST, answered with application/json. No SSE streaming (the read tools are
 * single-shot). Deps-injected so the dispatch unit-tests DB-free.
 */

import { z } from 'zod';
import type { AssistantToolCtx, AssistantToolRunResult } from '@/lib/assistant/tools/types';

/** The MCP protocol revision this server implements. */
export const MCP_PROTOCOL_VERSION = '2025-06-18';
const MCP_SERVER_INFO = { name: 'cycle-forge-assistant-tools', version: '1.0.0' } as const;

export interface McpToolEntry {
  name: string;
  description: string;
  permission: string;
  inputSchema: z.ZodTypeAny;
}

export interface McpServerDeps {
  /** The caller's permission-filtered tool list (default: listAssistantTools). */
  listTools: (ctx: Pick<AssistantToolCtx, 'permissions'>) => McpToolEntry[];
  /** The single tool-execution chokepoint (default: runAssistantTool). */
  runTool: (name: string, args: unknown, ctx: AssistantToolCtx) => Promise<AssistantToolRunResult>;
}

type JsonRpcId = string | number | null;

interface JsonRpcMessage {
  jsonrpc?: unknown;
  id?: JsonRpcId;
  method?: unknown;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// JSON-RPC 2.0 error codes.
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

/**
 * Dispatch a single JSON-RPC message. Returns the response object, or `null` for
 * a notification (no `id` — the client expects no reply). Never throws: a tool
 * failure becomes an `isError` tool result, a protocol error a JSON-RPC error.
 */
export async function handleMcpMessage(
  message: JsonRpcMessage,
  ctx: AssistantToolCtx,
  deps: McpServerDeps,
): Promise<JsonRpcResponse | null> {
  const isNotification = message == null || message.id === undefined;
  const id: JsonRpcId = message && message.id !== undefined ? message.id : null;

  const ok = (result: unknown): JsonRpcResponse | null =>
    isNotification ? null : { jsonrpc: '2.0', id, result };
  const fail = (code: number, msg: string): JsonRpcResponse | null =>
    isNotification ? null : { jsonrpc: '2.0', id, error: { code, message: msg } };

  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return isNotification ? null : { jsonrpc: '2.0', id, error: { code: INVALID_REQUEST, message: 'Invalid Request' } };
  }

  switch (message.method) {
    case 'initialize':
      return ok({
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: MCP_SERVER_INFO,
      });

    // Client lifecycle notifications — acknowledged with no reply.
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;

    case 'ping':
      return ok({});

    case 'tools/list': {
      const tools = deps.listTools(ctx).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: z.toJSONSchema(t.inputSchema),
      }));
      return ok({ tools });
    }

    case 'tools/call': {
      const params = (message.params ?? {}) as { name?: unknown; arguments?: unknown };
      if (typeof params.name !== 'string') {
        return fail(INVALID_PARAMS, 'tools/call requires a string "name"');
      }
      // runTool enforces unknown-tool / per-tool permission / input validation,
      // and org is taken from ctx — the MCP client cannot widen scope.
      const result = await deps.runTool(params.name, params.arguments ?? {}, ctx);
      if (result.ok) {
        return ok({ content: [{ type: 'text', text: JSON.stringify(result.data) }], isError: false });
      }
      // Tool-level failures (unknown_tool / forbidden / invalid_input / tool_error)
      // surface as an isError tool result, per MCP convention — not a JSON-RPC error.
      return ok({ content: [{ type: 'text', text: result.error }], isError: true });
    }

    default:
      return fail(METHOD_NOT_FOUND, `Method not found: ${message.method}`);
  }
}
