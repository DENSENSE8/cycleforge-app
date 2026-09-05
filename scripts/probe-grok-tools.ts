/**
 * SuperGrok proxy wire probe — PR 0 of docs/todo/ask-org-scoped-chat-PLAN.md (§23.B).
 *
 * Question: does cli-chat-proxy.grok.com honour `tools` for grok-4.6, on which
 * endpoint, streaming or buffered, and how does a tool call arrive on the
 * wire? One advertised tool (get_order_lookup, through openai-schema.ts), one
 * prompt that can only be answered by calling it, four wire variants, and for
 * each variant that produced a call the follow-up round that echoes a tool
 * result back and asks for the final sentence.
 *
 *   P1  POST /chat/completions  stream:true
 *   P2  POST /chat/completions  stream:false
 *   P3  POST /responses         stream:true
 *   P4  POST /responses         stream:false
 *
 * Run (talks to the proxy directly; never touches :3050):
 *   npx tsx --env-file=.env --import ./scripts/register-server-only-shim.cjs scripts/probe-grok-tools.ts
 * Flags:
 *   --org <uuid>       org whose SuperGrok session to use (default: QA org)
 *   --only P1,P3       run a subset of variants
 *   --effort low       send reasoning effort (chat: reasoning_effort, responses: reasoning.effort)
 *   --both-efforts     run every variant twice: proxy default effort, then low
 *   --strict-false     add `strict:false` to the function tool (if a 400 names strict mode)
 *   --no-followup      skip the tool-result echo round
 *   --json <path>      also write every result (headers/tokens excluded) as JSON
 *
 * The bearer never prints. Status codes, timings, event shapes and text do.
 */

import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { QA_ORG_ID, type OrgId } from '@/lib/tenancy/constants';
import { ensureGrokChatConfig } from '@/lib/integrations/grok/oauth';
import { aiRequestHeaders } from '@/lib/ai/provider';
import { ASSISTANT_TOOLS } from '@/lib/assistant/tools';
import { toOpenAiFunctionTool, toResponsesFunctionTool, wireBytes } from '@/lib/assistant/tools/openai-schema';

// ─── CLI ─────────────────────────────────────────────────────────────────────

type Endpoint = '/chat/completions' | '/responses';
type VariantId = 'P1' | 'P2' | 'P3' | 'P4';
type Effort = 'default' | 'low';

interface Variant {
  id: VariantId;
  endpoint: Endpoint;
  stream: boolean;
}

const VARIANTS: Variant[] = [
  { id: 'P1', endpoint: '/chat/completions', stream: true },
  { id: 'P2', endpoint: '/chat/completions', stream: false },
  { id: 'P3', endpoint: '/responses', stream: true },
  { id: 'P4', endpoint: '/responses', stream: false },
];

function flag(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return null;
  return process.argv[i + 1] ?? '';
}
const has = (name: string) => process.argv.includes(`--${name}`);

const ORG = (flag('org') || QA_ORG_ID) as OrgId;
const ONLY = (flag('only') || '').split(',').map((s) => s.trim()).filter(Boolean) as VariantId[];
const EFFORTS: Effort[] = has('both-efforts') ? ['default', 'low'] : flag('effort') === 'low' ? ['low'] : ['default'];
const STRICT_FALSE = has('strict-false');
const FOLLOWUP = !has('no-followup');
const JSON_OUT = flag('json');
const REQUEST_TIMEOUT_MS = 90_000;

// ─── Prompt + tool ───────────────────────────────────────────────────────────

const SYSTEM =
  'You are the operations assistant for a used-electronics warehouse. You answer from live data only: when the operator names an order or tracking number you MUST call get_order_lookup before answering. Never invent identifiers.';
const USER = 'Look up tracking 1Z999AA10123456784 using the tool.';
const TRACKING = '1Z999AA10123456784';

/** What the tool would have returned — a fixture, so no DB round trip. */
const TOOL_RESULT = {
  found: true,
  block: `=== SHIPPED ORDERS ===\nOrder 55012 · UPS ${TRACKING} · shipped 2026-09-01 · Bose QuietComfort 45 · delivered 2026-09-03`,
};

// ─── SSE reader ──────────────────────────────────────────────────────────────

interface SseEvent {
  event: string | null;
  data: string;
  atMs: number;
}

async function* sseEvents(
  body: ReadableStream<Uint8Array>,
  onFirstByte: (atMs: number) => void,
): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let first = true;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (first) {
      first = false;
      onFirstByte(performance.now());
    }
    buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let idx: number;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event: string | null = null;
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      if (data.length) yield { event, data: data.join('\n'), atMs: performance.now() };
    }
  }
}

// ─── Result shape ────────────────────────────────────────────────────────────

interface ToolCallSeen {
  id: string;
  name: string;
  arguments: string;
  /** How many wire fragments carried the arguments (1 = arrived whole). */
  fragments: number;
  /** Chat Completions: the first `index` seen (relays have started at 1). */
  firstIndex: number | null;
  /** Responses: which event delivered the whole call. */
  via: string | null;
}

interface RoundResult {
  status: number;
  firstByteMs: number | null;
  firstTextMs: number | null;
  firstToolMs: number | null;
  totalMs: number;
  text: string;
  reasoningChars: number;
  toolCalls: ToolCallSeen[];
  finishReason: string | null;
  completed: boolean;
  eventTypes: Record<string, number>;
  error: string | null;
  bodyPreview: string | null;
}

interface ProbeResult extends RoundResult {
  id: VariantId;
  endpoint: Endpoint;
  stream: boolean;
  effort: Effort;
  requestBytes: number;
  followup: RoundResult | null;
}

function emptyRound(): RoundResult {
  return {
    status: 0,
    firstByteMs: null,
    firstTextMs: null,
    firstToolMs: null,
    totalMs: 0,
    text: '',
    reasoningChars: 0,
    toolCalls: [],
    finishReason: null,
    completed: false,
    eventTypes: {},
    error: null,
    bodyPreview: null,
  };
}

function bump(r: RoundResult, key: string) {
  r.eventTypes[key] = (r.eventTypes[key] ?? 0) + 1;
}

// ─── Request bodies ──────────────────────────────────────────────────────────

type Json = Record<string, unknown>;

function effortField(endpoint: Endpoint, effort: Effort): Json {
  if (effort === 'default') return {};
  return endpoint === '/chat/completions' ? { reasoning_effort: 'low' } : { reasoning: { effort: 'low' } };
}

function chatTools() {
  const tool = toOpenAiFunctionTool(ASSISTANT_TOOLS.get('get_order_lookup')!);
  return [STRICT_FALSE ? { ...tool, function: { ...tool.function, strict: false } } : tool];
}

function responsesTools() {
  const tool = toResponsesFunctionTool(ASSISTANT_TOOLS.get('get_order_lookup')!);
  return [STRICT_FALSE ? { ...tool, strict: false } : tool];
}

function firstRoundBody(model: string, v: Variant, effort: Effort): Json {
  if (v.endpoint === '/chat/completions') {
    return {
      model,
      stream: v.stream,
      tool_choice: 'auto',
      parallel_tool_calls: true,
      ...effortField(v.endpoint, effort),
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: USER },
      ],
      tools: chatTools(),
    };
  }
  return {
    model,
    stream: v.stream,
    store: false,
    tool_choice: 'auto',
    parallel_tool_calls: true,
    ...effortField(v.endpoint, effort),
    input: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: USER },
    ],
    tools: responsesTools(),
  };
}

function followupBody(model: string, v: Variant, effort: Effort, first: RoundResult): Json {
  if (v.endpoint === '/chat/completions') {
    return {
      model,
      stream: v.stream,
      tool_choice: 'auto',
      parallel_tool_calls: true,
      ...effortField(v.endpoint, effort),
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: USER },
        {
          role: 'assistant',
          content: first.text || null,
          tool_calls: first.toolCalls.map((c) => ({
            id: c.id,
            type: 'function',
            function: { name: c.name, arguments: c.arguments },
          })),
        },
        ...first.toolCalls.map((c) => ({
          role: 'tool',
          tool_call_id: c.id,
          content: JSON.stringify(TOOL_RESULT),
        })),
      ],
      tools: chatTools(),
    };
  }
  return {
    model,
    stream: v.stream,
    store: false,
    tool_choice: 'auto',
    parallel_tool_calls: true,
    ...effortField(v.endpoint, effort),
    input: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: USER },
      ...first.toolCalls.map((c) => ({
        type: 'function_call',
        call_id: c.id,
        name: c.name,
        arguments: c.arguments,
      })),
      ...first.toolCalls.map((c) => ({
        type: 'function_call_output',
        call_id: c.id,
        output: JSON.stringify(TOOL_RESULT),
      })),
    ],
    tools: responsesTools(),
  };
}

// ─── Parsers ─────────────────────────────────────────────────────────────────

interface ChatChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }>;
    };
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
    };
    finish_reason?: string | null;
  }>;
  error?: { message?: string } | string;
}

function chatToolAccumulator(r: RoundResult, startMs: number) {
  const byIndex = new Map<number, ToolCallSeen>();
  return {
    add(tc: { index?: number; id?: string; function?: { name?: string; arguments?: string } }, atMs: number) {
      const index = tc.index ?? 0;
      let entry = byIndex.get(index);
      if (!entry) {
        entry = { id: tc.id ?? '', name: tc.function?.name ?? '', arguments: '', fragments: 0, firstIndex: index, via: 'delta.tool_calls' };
        byIndex.set(index, entry);
        if (r.firstToolMs === null) r.firstToolMs = atMs - startMs;
      }
      if (tc.id && !entry.id) entry.id = tc.id;
      if (tc.function?.name && !entry.name) entry.name = tc.function.name;
      if (typeof tc.function?.arguments === 'string') {
        entry.arguments += tc.function.arguments;
        entry.fragments += 1;
      }
    },
    finish() {
      r.toolCalls = [...byIndex.values()];
    },
  };
}

async function readChatStream(res: Response, r: RoundResult, startMs: number) {
  const acc = chatToolAccumulator(r, startMs);
  for await (const ev of sseEvents(res.body!, (at) => (r.firstByteMs = at - startMs))) {
    if (ev.data === '[DONE]') {
      bump(r, '[DONE]');
      continue;
    }
    let json: ChatChunk;
    try {
      json = JSON.parse(ev.data) as ChatChunk;
    } catch {
      bump(r, 'unparseable');
      continue;
    }
    if (json.error) {
      r.error = typeof json.error === 'string' ? json.error : json.error.message ?? 'error chunk';
      bump(r, 'error');
      continue;
    }
    const choice = json.choices?.[0];
    if (!choice) {
      bump(r, 'no-choice');
      continue;
    }
    const delta = choice.delta ?? {};
    if (delta.content) {
      if (r.firstTextMs === null) r.firstTextMs = ev.atMs - startMs;
      r.text += delta.content;
      bump(r, 'delta.content');
    }
    if (delta.reasoning_content) {
      r.reasoningChars += delta.reasoning_content.length;
      bump(r, 'delta.reasoning_content');
    }
    for (const tc of delta.tool_calls ?? []) {
      acc.add(tc, ev.atMs);
      bump(r, 'delta.tool_calls');
    }
    if (choice.finish_reason) {
      r.finishReason = choice.finish_reason;
      bump(r, `finish:${choice.finish_reason}`);
    }
  }
  acc.finish();
  r.completed = r.finishReason !== null;
}

async function readChatBuffered(res: Response, r: RoundResult, startMs: number) {
  const text = await res.text();
  r.firstByteMs = performance.now() - startMs;
  let json: ChatChunk;
  try {
    json = JSON.parse(text) as ChatChunk;
  } catch {
    r.error = 'non-JSON body';
    r.bodyPreview = text.slice(0, 300);
    return;
  }
  const choice = json.choices?.[0];
  const msg = choice?.message ?? {};
  r.text = msg.content ?? '';
  if (r.text) r.firstTextMs = r.firstByteMs;
  r.reasoningChars = msg.reasoning_content?.length ?? 0;
  r.toolCalls = (msg.tool_calls ?? []).map((tc) => ({
    id: tc.id ?? '',
    name: tc.function?.name ?? '',
    arguments: tc.function?.arguments ?? '',
    fragments: 1,
    firstIndex: null,
    via: 'message.tool_calls',
  }));
  if (r.toolCalls.length) r.firstToolMs = r.firstByteMs;
  r.finishReason = choice?.finish_reason ?? null;
  r.completed = true;
  bump(r, 'message');
}

interface ResponsesItem {
  type?: string;
  id?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  status?: string;
  content?: Array<{ type?: string; text?: string }>;
}

interface ResponsesEvent {
  type?: string;
  delta?: string;
  item_id?: string;
  item?: ResponsesItem;
  arguments?: string;
  response?: { status?: string; output?: ResponsesItem[]; error?: { message?: string } | null };
  error?: { message?: string } | string;
  message?: string;
}

async function readResponsesStream(res: Response, r: RoundResult, startMs: number) {
  const argFragments = new Map<string, number>();
  const argsById = new Map<string, string>();
  for await (const ev of sseEvents(res.body!, (at) => (r.firstByteMs = at - startMs))) {
    let json: ResponsesEvent;
    try {
      json = JSON.parse(ev.data) as ResponsesEvent;
    } catch {
      bump(r, 'unparseable');
      continue;
    }
    const type = json.type ?? ev.event ?? 'unknown';
    bump(r, type);
    switch (type) {
      case 'response.output_text.delta':
        if (json.delta) {
          if (r.firstTextMs === null) r.firstTextMs = ev.atMs - startMs;
          r.text += json.delta;
        }
        break;
      case 'response.reasoning_summary_text.delta':
      case 'response.reasoning_text.delta':
        r.reasoningChars += json.delta?.length ?? 0;
        break;
      case 'response.output_item.added':
        if (json.item?.type === 'function_call' && r.firstToolMs === null) r.firstToolMs = ev.atMs - startMs;
        break;
      case 'response.function_call_arguments.delta': {
        const id = json.item_id ?? '';
        argFragments.set(id, (argFragments.get(id) ?? 0) + 1);
        argsById.set(id, (argsById.get(id) ?? '') + (json.delta ?? ''));
        if (r.firstToolMs === null) r.firstToolMs = ev.atMs - startMs;
        break;
      }
      case 'response.output_item.done':
        if (json.item?.type === 'function_call') {
          const item = json.item;
          const fragments = argFragments.get(item.id ?? '') ?? 0;
          r.toolCalls.push({
            id: item.call_id ?? '',
            name: item.name ?? '',
            arguments: item.arguments ?? argsById.get(item.id ?? '') ?? '',
            fragments: fragments > 0 ? fragments : 1,
            firstIndex: null,
            via: fragments > 0 ? 'arguments.delta + output_item.done' : 'output_item.done (whole)',
          });
          if (r.firstToolMs === null) r.firstToolMs = ev.atMs - startMs;
        }
        break;
      case 'response.completed':
        r.completed = true;
        r.finishReason = json.response?.status ?? 'completed';
        break;
      case 'response.failed':
      case 'response.incomplete':
        r.finishReason = type;
        r.error = json.response?.error?.message ?? type;
        break;
      case 'error':
        r.error = typeof json.error === 'string' ? json.error : json.error?.message ?? json.message ?? 'error event';
        break;
      default:
        break;
    }
  }
}

async function readResponsesBuffered(res: Response, r: RoundResult, startMs: number) {
  const text = await res.text();
  r.firstByteMs = performance.now() - startMs;
  let json: { output?: ResponsesItem[]; status?: string; error?: { message?: string } | null };
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    r.error = 'non-JSON body';
    r.bodyPreview = text.slice(0, 300);
    return;
  }
  for (const item of json.output ?? []) {
    bump(r, `output:${item.type ?? 'unknown'}`);
    if (item.type === 'function_call') {
      r.toolCalls.push({
        id: item.call_id ?? '',
        name: item.name ?? '',
        arguments: item.arguments ?? '',
        fragments: 1,
        firstIndex: null,
        via: 'output[] function_call',
      });
      if (r.firstToolMs === null) r.firstToolMs = r.firstByteMs;
    } else if (item.type === 'message') {
      const t = (item.content ?? []).map((c) => c.text ?? '').join('');
      if (t && r.firstTextMs === null) r.firstTextMs = r.firstByteMs;
      r.text += t;
    }
  }
  r.finishReason = json.status ?? null;
  r.completed = json.status === 'completed';
  if (json.error?.message) r.error = json.error.message;
}

// ─── One round ───────────────────────────────────────────────────────────────

async function runRound(
  baseURL: string,
  headers: Record<string, string>,
  v: Variant,
  body: Json,
): Promise<RoundResult> {
  const r = emptyRound();
  const startMs = performance.now();
  let res: Response;
  try {
    res = await fetch(`${baseURL}${v.endpoint}`, {
      method: 'POST',
      headers: { ...headers, Accept: v.stream ? 'text/event-stream' : 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    r.error = err instanceof Error ? err.message : String(err);
    r.totalMs = performance.now() - startMs;
    return r;
  }
  r.status = res.status;
  r.firstByteMs = performance.now() - startMs; // headers; the stream reader tightens this
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    r.error = `HTTP ${res.status}`;
    r.bodyPreview = text.slice(0, 400);
    r.totalMs = performance.now() - startMs;
    return r;
  }
  try {
    if (v.endpoint === '/chat/completions') {
      if (v.stream) await readChatStream(res, r, startMs);
      else await readChatBuffered(res, r, startMs);
    } else if (v.stream) await readResponsesStream(res, r, startMs);
    else await readResponsesBuffered(res, r, startMs);
  } catch (err) {
    r.error = r.error ?? (err instanceof Error ? err.message : String(err));
  }
  r.totalMs = performance.now() - startMs;
  return r;
}

// ─── Report ──────────────────────────────────────────────────────────────────

const ms = (n: number | null) => (n === null ? '—' : `${Math.round(n)} ms`);

function shape(r: RoundResult): string {
  if (!r.toolCalls.length) return 'no call';
  return r.toolCalls
    .map((c) => {
      const idx = c.firstIndex === null ? '' : ` idx${c.firstIndex}`;
      return `${c.name}(${c.arguments.length}B) ×${c.fragments}${idx} via ${c.via}`;
    })
    .join('; ');
}

function argsLookRight(r: RoundResult): string {
  const c = r.toolCalls[0];
  if (!c) return '—';
  try {
    const parsed = JSON.parse(c.arguments) as Record<string, unknown>;
    return parsed.trackingNumber === TRACKING ? 'trackingNumber ✓' : `keys ${Object.keys(parsed).join(',')}`;
  } catch {
    return 'args not JSON';
  }
}

function printTable(results: ProbeResult[]) {
  const header =
    '| id | endpoint | stream | effort | status | first byte | first tool | first text | total | tool call shape | args | finish | reasoning | text (first round) | follow-up |';
  const sep = '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|';
  const rows = results.map((r) => {
    const follow = r.followup
      ? r.followup.error
        ? `HTTP ${r.followup.status} ${r.followup.error}`
        : `HTTP ${r.followup.status}, first text ${ms(r.followup.firstTextMs)}, total ${ms(r.followup.totalMs)}, "${r.followup.text.slice(0, 80).replace(/\n/g, ' ')}"`
      : '—';
    return `| ${r.id} | ${r.endpoint} | ${r.stream} | ${r.effort} | ${r.status}${r.error ? ` ${r.error}` : ''} | ${ms(r.firstByteMs)} | ${ms(r.firstToolMs)} | ${ms(r.firstTextMs)} | ${ms(r.totalMs)} | ${shape(r)} | ${argsLookRight(r)} | ${r.finishReason ?? '—'}${r.completed ? '' : ' (no end)'} | ${r.reasoningChars} chars | "${r.text.slice(0, 60).replace(/\n/g, ' ')}" | ${follow} |`;
  });
  console.log([header, sep, ...rows].join('\n'));
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const config = await ensureGrokChatConfig(ORG);
  if (!config) {
    console.error(`No live SuperGrok session for org ${ORG}. Connect Grok in Settings → Integrations, then rerun.`);
    process.exit(2);
  }
  const headers = aiRequestHeaders(config, { 'X-Source': 'assistant-probe' });
  const variants = VARIANTS.filter((v) => ONLY.length === 0 || ONLY.includes(v.id));
  console.log(
    `proxy ${config.baseURL} · model ${config.model} · variants ${variants.map((v) => v.id).join(',')} · efforts ${EFFORTS.join(',')} · strict:false=${STRICT_FALSE} · followup=${FOLLOWUP}`,
  );
  console.log(`advertised tool: get_order_lookup — chat envelope ${wireBytes(chatTools())} B, responses envelope ${wireBytes(responsesTools())} B`);

  const results: ProbeResult[] = [];
  for (const effort of EFFORTS) {
    for (const v of variants) {
      const body = firstRoundBody(config.model, v, effort);
      process.stdout.write(`\n▶ ${v.id} ${v.endpoint} stream=${v.stream} effort=${effort} … `);
      const first = await runRound(config.baseURL, headers, v, body);
      const result: ProbeResult = {
        id: v.id,
        endpoint: v.endpoint,
        stream: v.stream,
        effort,
        requestBytes: Buffer.byteLength(JSON.stringify(body)),
        followup: null,
        ...first,
      };
      console.log(
        `HTTP ${first.status} · first byte ${ms(first.firstByteMs)} · ${shape(first)} · finish ${first.finishReason ?? '—'} · ${first.error ?? 'ok'}`,
      );
      if (first.bodyPreview) console.log(`   body: ${first.bodyPreview}`);
      if (Object.keys(first.eventTypes).length) console.log(`   events: ${JSON.stringify(first.eventTypes)}`);
      if (first.text) console.log(`   text: ${first.text.slice(0, 200).replace(/\n/g, ' ')}`);
      if (first.toolCalls[0]) console.log(`   args: ${first.toolCalls[0].arguments.slice(0, 200)}`);

      if (FOLLOWUP && first.toolCalls.length > 0 && first.toolCalls.every((c) => c.name)) {
        process.stdout.write(`   ↳ follow-up with tool result … `);
        const follow = await runRound(config.baseURL, headers, v, followupBody(config.model, v, effort, first));
        result.followup = follow;
        console.log(
          `HTTP ${follow.status} · first text ${ms(follow.firstTextMs)} · total ${ms(follow.totalMs)} · ${follow.toolCalls.length ? `re-called ${shape(follow)}` : 'no re-call'} · ${follow.error ?? 'ok'}`,
        );
        if (follow.bodyPreview) console.log(`   body: ${follow.bodyPreview}`);
        if (follow.text) console.log(`   text: ${follow.text.slice(0, 300).replace(/\n/g, ' ')}`);
      }
      results.push(result);
    }
  }

  console.log('\n');
  printTable(results);

  if (JSON_OUT) {
    await writeFile(JSON_OUT, JSON.stringify({ ranAt: new Date().toISOString(), org: ORG, model: config.model, baseURL: config.baseURL, results }, null, 2));
    console.log(`\nwrote ${JSON_OUT}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('probe failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
