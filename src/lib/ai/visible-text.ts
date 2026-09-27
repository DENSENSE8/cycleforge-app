/**
 * The ONE streaming filter between a model round's raw `delta.content` and
 * the operator's chat. `grok-agent-loop` builds one per round and publishes
 * only what it returns:
 *
 *   text      → `delta`      the answer, as prose
 *   reasoning → `reasoning`  folded into the turn's collapsed thinking history
 *   echoes    → the loop     tool calls the model WROTE instead of making
 *
 * Two stages, one object. Stage one is the Harmony channel splitter
 * (`createHarmonyTextFilter`): `final` → text, `analysis` → reasoning. Stage
 * two scans what survives for the grammars a model uses to TALK about a call
 * or its thinking instead of using the wire:
 *
 *   • `<think>…</think>`                       → reasoning
 *   • `<tool_call>…</tool_call>`               → echo (Hermes / Qwen)
 *   • `<|python_tag|>…<|eom_id|>`              → echo (Llama 3.x)
 *   • `[name(k="v", …), …]` for a known tool   → echo (Llama pythonic)
 *   • `{"name":"<known tool>", "parameters"|"arguments":…}` → echo (bare JSON)
 *
 * Measured 2026-09-26 on llama-4-scout through the Cloudflare gateway: the
 * transcript printed `[hybrid_entity_search(query="SKU X00ABC123",
 * limit="12")] Let's see where…` as the answer. That syntax must never reach
 * the operator, so it is scrubbed here, server-side, before `delta`.
 *
 * Streaming-safe in the same way as the Harmony stage: a tail that could
 * still become one of these constructs (`<thi`, `[hybrid_en`, `{"na`) is HELD
 * until the next chunk decides it, and `flush()` releases or classifies the
 * remainder at round end. Prose brackets — `[see note]`, a markdown link, an
 * unknown `[name(…)]` — are released the moment they stop matching.
 */

import { createHarmonyTextFilter, heldMarkerPrefix } from '@/lib/ai/harmony';

/** A tool call the model wrote as TEXT instead of making it. */
export interface EchoedToolCall {
  /** The tool it named, when that is a known tool; null otherwise. */
  name: string | null;
  /** Its arguments, best effort. */
  args: Record<string, unknown>;
  /** The scrubbed text, verbatim — for logs and tests, never the operator. */
  raw: string;
}

export interface VisibleTextSlice {
  text: string;
  reasoning: string;
  echoes: EchoedToolCall[];
}

export interface VisibleTextFilter {
  push: (chunk: string) => VisibleTextSlice;
  /** Release or classify whatever is held. Call once, at round end. */
  flush: () => VisibleTextSlice;
}

const THINK_OPEN = '<think>';
const THINK_CLOSE = '</think>';
const TOOL_CALL_OPEN = '<tool_call>';
const TOOL_CALL_CLOSE = '</tool_call>';
const PYTHON_TAG = '<|python_tag|>';
const PYTHON_TAG_ENDS = ['<|eom_id|>', '<|eot_id|>'] as const;
/** Every tag stage two acts on in running text. Stray closers are dropped. */
const TAGS = [THINK_OPEN, THINK_CLOSE, TOOL_CALL_OPEN, TOOL_CALL_CLOSE, PYTHON_TAG] as const;
/**
 * How much of a `{"…` object is held while undecided. A real call is a few
 * hundred bytes; prose that opens a brace and never closes it must not stall
 * the stream for the rest of the round.
 */
const MAX_HELD_OBJECT = 2000;

const TOOL_NAME_CHAR = /[A-Za-z0-9_-]/;

export function createVisibleTextFilter(options: { toolNames: ReadonlySet<string> }): VisibleTextFilter {
  const harmony = createHarmonyTextFilter();
  const scanner = createEchoScanner(options.toolNames);
  return {
    push(chunk) {
      const h = harmony.push(chunk);
      const s = scanner.push(h.text);
      return { text: s.text, reasoning: h.reasoning + s.reasoning, echoes: s.echoes };
    },
    flush() {
      const h = harmony.flush();
      const a = scanner.push(h.text);
      const b = scanner.flush();
      return {
        text: a.text + b.text,
        reasoning: h.reasoning + a.reasoning + b.reasoning,
        echoes: [...a.echoes, ...b.echoes],
      };
    },
  };
}

// ─── Stage two ───────────────────────────────────────────────────────────────

type Construct =
  | { kind: 'wait' }
  | { kind: 'tag'; tag: (typeof TAGS)[number] }
  | { kind: 'echo'; length: number; echoes: EchoedToolCall[] };

function createEchoScanner(toolNames: ReadonlySet<string>): VisibleTextFilter {
  let pending = '';
  let mode: 'text' | 'think' | 'tool_call' | 'python_tag' = 'text';
  /** Body of an open `<tool_call>` / `<|python_tag|>` block. */
  let block = '';

  const drain = (final: boolean): VisibleTextSlice => {
    const out: VisibleTextSlice = { text: '', reasoning: '', echoes: [] };
    for (;;) {
      if (mode === 'think') {
        const close = pending.indexOf(THINK_CLOSE);
        if (close !== -1) {
          out.reasoning += pending.slice(0, close);
          pending = pending.slice(close + THINK_CLOSE.length);
          mode = 'text';
          continue;
        }
        const hold = final ? 0 : heldMarkerPrefix(pending, [THINK_CLOSE]);
        out.reasoning += pending.slice(0, pending.length - hold);
        pending = pending.slice(pending.length - hold);
        return out;
      }

      if (mode === 'tool_call' || mode === 'python_tag') {
        const ends = mode === 'tool_call' ? [TOOL_CALL_CLOSE] : PYTHON_TAG_ENDS;
        const hit = earliest(pending, ends);
        if (hit) {
          block += pending.slice(0, hit.at);
          pending = pending.slice(hit.at + hit.marker.length);
          out.echoes.push(parseBlockEcho(block, toolNames));
          block = '';
          mode = 'text';
          continue;
        }
        const hold = final ? 0 : heldMarkerPrefix(pending, ends);
        block += pending.slice(0, pending.length - hold);
        pending = pending.slice(pending.length - hold);
        if (final) {
          // An unterminated block is still a call, not prose.
          out.echoes.push(parseBlockEcho(block, toolNames));
          block = '';
          mode = 'text';
        }
        return out;
      }

      const found = findConstruct(pending, toolNames, final);
      if (!found) {
        out.text += pending;
        pending = '';
        return out;
      }
      out.text += pending.slice(0, found.at);
      pending = pending.slice(found.at);
      const c = found.construct;
      if (c.kind === 'wait') return out;
      if (c.kind === 'echo') {
        out.echoes.push(...c.echoes);
        pending = pending.slice(c.length);
        continue;
      }
      pending = pending.slice(c.tag.length);
      if (c.tag === THINK_OPEN) mode = 'think';
      else if (c.tag === TOOL_CALL_OPEN) mode = 'tool_call';
      else if (c.tag === PYTHON_TAG) mode = 'python_tag';
      // A stray closer is markup with nothing to close: dropped.
    }
  };

  return {
    push(chunk) {
      pending += chunk;
      return drain(false);
    },
    flush() {
      return drain(true);
    },
  };
}

function earliest(s: string, markers: readonly string[]): { at: number; marker: string } | null {
  let best: { at: number; marker: string } | null = null;
  for (const marker of markers) {
    const at = s.indexOf(marker);
    if (at !== -1 && (!best || at < best.at)) best = { at, marker };
  }
  return best;
}

/** The first position in `s` that opens (or may yet open) a construct. */
function findConstruct(
  s: string,
  toolNames: ReadonlySet<string>,
  final: boolean,
): { at: number; construct: Construct } | null {
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    const construct =
      ch === '<'
        ? classifyTag(s, i, final)
        : ch === '['
          ? classifyBracketCall(s, i, toolNames, final)
          : ch === '{'
            ? classifyJsonCall(s, i, toolNames, final)
            : null;
    if (construct) return { at: i, construct };
  }
  return null;
}

function classifyTag(s: string, i: number, final: boolean): Construct | null {
  const rest = s.slice(i);
  for (const tag of TAGS) if (rest.startsWith(tag)) return { kind: 'tag', tag };
  if (!final && TAGS.some((tag) => tag.startsWith(rest))) return { kind: 'wait' };
  return null;
}

/**
 * `[name(args), name(args)]` — Llama's pythonic tool-call list. The FIRST name
 * must be a known tool and must be followed by `(`; anything else is prose.
 */
function classifyBracketCall(
  s: string,
  i: number,
  toolNames: ReadonlySet<string>,
  final: boolean,
): Construct | null {
  const calls: Array<{ name: string; args: string }> = [];
  const settle = (end: number): Construct => ({
    kind: 'echo',
    length: end - i,
    echoes: calls.map((c) => ({
      name: toolNames.has(c.name) ? c.name : null,
      args: parsePythonArgs(c.args),
      raw: s.slice(i, end),
    })),
  });
  let j = skipWs(s, i + 1);
  /** Just past the last complete `name(…)`. */
  let end = i;
  for (;;) {
    const nameStart = j;
    while (j < s.length && TOOL_NAME_CHAR.test(s[j])) j += 1;
    const name = s.slice(nameStart, j);
    const open = skipWs(s, j);
    if (open >= s.length) {
      // The buffer ends inside a name or before its paren: hold only what can
      // still become a known tool's call.
      if (final) return calls.length > 0 ? settle(end) : null;
      const couldBe = calls.length > 0 || [...toolNames].some((t) => t.startsWith(name));
      return couldBe ? { kind: 'wait' } : null;
    }
    if (calls.length === 0 && (!toolNames.has(name) || s[open] !== '(')) return null;
    if (s[open] !== '(' || name === '') return settle(s[open] === ']' ? open + 1 : end);
    const close = matchClose(s, open);
    if (close === -1) {
      if (!final) return { kind: 'wait' };
      calls.push({ name, args: s.slice(open + 1) });
      return settle(s.length);
    }
    calls.push({ name, args: s.slice(open + 1, close) });
    end = close + 1;
    const after = skipWs(s, end);
    if (after >= s.length) return final ? settle(end) : { kind: 'wait' };
    if (s[after] === ']') return settle(after + 1);
    if (s[after] !== ',') return settle(end);
    j = skipWs(s, after + 1);
  }
}

/** `{"name": "<known tool>", …}` — usually with `parameters` / `arguments` — as bare prose. */
function classifyJsonCall(
  s: string,
  i: number,
  toolNames: ReadonlySet<string>,
  final: boolean,
): Construct | null {
  const key = skipWs(s, i + 1);
  if (key >= s.length) return final ? null : { kind: 'wait' };
  if (s[key] !== '"') return null;
  const close = matchClose(s, i);
  const body = close === -1 ? s.slice(i) : s.slice(i, close + 1);
  const named = /"name"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(body)?.[1];
  // Decided early: a named object whose name is not a tool is data, not a call.
  if (named !== undefined && !toolNames.has(named)) return null;
  const echo = (length: number, args: unknown, name: string | null): Construct => ({
    kind: 'echo',
    length,
    echoes: [{ name, args: asArgs(args), raw: s.slice(i, i + length) }],
  });
  if (close === -1) {
    if (!final) return body.length > MAX_HELD_OBJECT ? null : { kind: 'wait' };
    return named !== undefined ? echo(body.length, {}, named) : null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    // Balanced, named after a known tool, but not quite JSON: still a call.
    return named !== undefined ? echo(body.length, {}, named) : null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.name !== 'string' || !toolNames.has(obj.name)) return null;
  // `parameters` / `arguments` is the usual shape, but a bare `{"name": tool}`
  // is still a call the loop's salvage will run — and still not prose.
  return echo(body.length, obj.parameters ?? obj.arguments, obj.name);
}

/** A `<tool_call>` / `<|python_tag|>` body: JSON first, then pythonic. */
function parseBlockEcho(block: string, toolNames: ReadonlySet<string>): EchoedToolCall {
  const raw = block;
  const text = block.trim();
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const name = typeof parsed.name === 'string' && toolNames.has(parsed.name) ? parsed.name : null;
      return { name, args: asArgs(parsed.parameters ?? parsed.arguments), raw };
    }
  } catch {
    /* not JSON — try the pythonic form */
  }
  const call = /^\[?\s*([A-Za-z0-9_.-]+)\s*\(([\s\S]*)\)\s*\]?\s*;?$/.exec(text);
  if (call) {
    const name = call[1].replace(/\.call$/, '');
    return { name: toolNames.has(name) ? name : null, args: parsePythonArgs(call[2]), raw };
  }
  return { name: null, args: {}, raw };
}

/** JSON-string arguments are common on the OpenAI wire; objects pass through. */
function asArgs(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      return asArgs(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function skipWs(s: string, j: number): number {
  while (j < s.length && /\s/.test(s[j])) j += 1;
  return j;
}

/**
 * Index of the bracket that closes the one at `open`, or -1 while it is still
 * open. String-aware (single and double quotes, backslash escapes), so a `)`
 * inside a quoted value never ends a call early.
 */
function matchClose(s: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let k = open; k < s.length; k += 1) {
    const ch = s[k];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth -= 1;
      if (depth === 0) return k;
    }
  }
  return -1;
}

/** `query="SKU X", limit=12, exact=True` → `{ query: 'SKU X', limit: 12, exact: true }`. */
function parsePythonArgs(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let positional = 0;
  for (const part of splitTopLevel(text)) {
    const eq = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]*)$/.exec(part);
    const key = eq ? eq[1] : `arg${(positional += 1)}`;
    out[key] = pythonValue((eq ? eq[2] : part).trim());
  }
  return out;
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  let start = 0;
  for (let k = 0; k < text.length; k += 1) {
    const ch = text[k];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, k));
      start = k + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.filter((p) => p.trim().length > 0);
}

function pythonValue(v: string): unknown {
  const quoted = /^(['"])([\s\S]*)\1$/.exec(v);
  if (quoted) return quoted[2].replace(/\\(.)/g, '$1');
  if (v === 'True' || v === 'true') return true;
  if (v === 'False' || v === 'false') return false;
  if (v === 'None' || v === 'null') return null;
  if (/^-?\d+(?:\.\d+)?$/.test(v)) return Number(v);
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}
