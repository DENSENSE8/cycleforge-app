/**
 * One execution chokepoint for every tool call a model makes (Ask plan §17).
 *
 * Both agent loops — the Anthropic loop in agent-loop.ts and the Grok loop
 * PR 1 adds (grok-agent-loop.ts) — call this and nothing else. A write tool from the
 * per-request map runs here (permission → Zod → run → domain-failure
 * detection); every other name falls through to `runAssistantTool`, the read
 * registry's own chokepoint (unknown-tool → permission → Zod → run). So a
 * model-invented name is answered by the registry as `unknown_tool`, the same
 * way it was before this module existed.
 *
 * Invariants (the loops promise these; this is where they hold):
 *   • org / staff / permissions are `ctx` — a model-supplied organizationId in
 *     the arguments is just another argument the Zod schema accepts or
 *     rejects; it never becomes authority;
 *   • nothing throws out of dispatch — failures return `{ ok:false }` so a
 *     loop can hand the model a clean error to route around;
 *   • a write tool that RESOLVES `{ ok:false, error }` (validation / 404 /
 *     409) is a domain failure and is reported like a thrown one, matching
 *     how read-tool failures reach the model.
 *
 * UI tools (navigate / highlight / …) never reach dispatch: the loop that owns
 * the emit sink forwards them to the browser and acknowledges them to the
 * model itself.
 *
 * Extracted from agent-loop.ts `runWriteTool` in PR 0 — no behaviour change.
 */

import type { z } from 'zod';
import { askOnlyRefusal } from '@/lib/assistant/access-mode';
import { WRITE_TOOL_NAMES } from '@/lib/assistant/tool-activity';
import { ASSISTANT_TOOLS, GREEN_READ_TOOL_NAMES, type runAssistantTool } from './index';
import type { AssistantToolCtx, AssistantToolDef, AssistantToolRunResult } from './types';

export type WriteToolDef = AssistantToolDef<z.ZodTypeAny, unknown>;
export type WriteToolMap = ReadonlyMap<string, WriteToolDef>;
export type RunAssistantToolFn = typeof runAssistantTool;

/**
 * The per-request write tools this caller may see at all, keyed by name.
 * Filtering on the tool's own `permission` here is what keeps a caller without
 * it from ever being advertised (or able to dispatch) that tool; the per-kind
 * check inside propose_mutation is the second, finer gate. An Ask-only turn
 * gets none.
 */
export function buildWriteToolMap(
  ctx: Pick<AssistantToolCtx, 'permissions' | 'accessMode'>,
  writeTools: ReadonlyArray<WriteToolDef> | undefined,
): WriteToolMap {
  if (ctx.accessMode === 'ask') return new Map();
  const permitted = (writeTools ?? []).filter((t) => ctx.permissions.has(t.permission));
  return new Map(permitted.map((t) => [t.name, t]));
}

export async function dispatchToolCall(
  name: string,
  rawInput: unknown,
  ctx: AssistantToolCtx,
  writeMap: WriteToolMap,
  runTool: RunAssistantToolFn,
): Promise<AssistantToolRunResult> {
  // Ask only: the GREEN registry or nothing. A session write or a gateway
  // decision is refused HERE, whatever the advertisement said; an invented
  // name still falls through to the registry's own `unknown_tool`.
  if (
    ctx.accessMode === 'ask' &&
    !GREEN_READ_TOOL_NAMES.has(name) &&
    ((WRITE_TOOL_NAMES as readonly string[]).includes(name) || writeMap.has(name) || ASSISTANT_TOOLS.has(name))
  ) {
    return { ok: false, code: 'forbidden', error: askOnlyRefusal(name) };
  }
  const tool = writeMap.get(name);
  if (!tool) return runTool(name, rawInput, ctx);

  if (!ctx.permissions.has(tool.permission)) {
    return { ok: false, code: 'forbidden', error: `Missing permission ${tool.permission}` };
  }
  const parsed = tool.inputSchema.safeParse(rawInput ?? {});
  if (!parsed.success) return { ok: false, code: 'invalid_input', error: parsed.error.message };
  try {
    const data = await tool.run(parsed.data, ctx, {} as never);
    if (data && typeof data === 'object' && (data as { ok?: unknown }).ok === false) {
      return { ok: false, code: 'tool_error', error: String((data as { error?: unknown }).error ?? 'write failed') };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, code: 'tool_error', error: err instanceof Error ? err.message : String(err) };
  }
}
