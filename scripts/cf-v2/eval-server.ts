/**
 * v2 model-level eval (train handoff §4) — replays the PRODUCTION prompt
 * shape against an OpenAI-wire endpoint and grades the eight gates.
 *
 * Everything prompt-shaped imports the real app code (buildSystemCore,
 * buildContextFragment, subsetAdvertisedTools, toOpenAiFunctionTool,
 * parseRenderArtifactInput, the registry's zod schemas), so an eval score
 * here means the same prompt the dock sends scored — the v1 defect (train
 * at 4 k against an 11.2 k production prompt) cannot recur by construction.
 *
 * Tool results are the synthetic fixtures (fixtures.ts) — the model side is
 * graded, never the database.
 *
 * Run (from the app repo root):
 *   node --import tsx --import ./scripts/register-server-only-shim.cjs \
 *     scripts/cf-v2/eval-server.ts --base http://127.0.0.1:8000/v1 \
 *     --model Qwen3-8B --out evals/cycleforge-v2/baseline-zeroshot.json --label zero-shot
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { listAssistantTools } from '@/lib/assistant/tools';
import type { AssistantToolDef } from '@/lib/assistant/tools/types';
import { buildWriteTools } from '@/lib/assistant/tools/write-tools';
import { toOpenAiFunctionTool, type OpenAiFunctionTool } from '@/lib/assistant/tools/openai-schema';
import { UI_TOOLS, buildSystemCore, buildContextFragment, parseRenderArtifactInput } from '@/lib/assistant/agent-loop';
import { subsetAdvertisedTools } from '@/lib/assistant/tool-subsetting';
import { TOOL_FIXTURES, type ToolFixture } from './fixtures';

// ─── CLI ─────────────────────────────────────────────────────────────────────

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const BASE = arg('base', 'http://127.0.0.1:8000/v1')!;
const MODEL = arg('model', 'Qwen3-8B')!;
const OUT = arg('out')!;
const LABEL = arg('label', 'unlabeled')!;
const GOLDENS = arg('goldens', 'evals/cycleforge-v2/golden.jsonl')!;
const MAX_ROUNDS = Number(arg('max-rounds', '4'));
const FIRST_BYTE_TIMEOUT_MS = 30_000;
const ROUND_TIMEOUT_MS = 120_000;

// ─── Production-shaped advertisement ─────────────────────────────────────────

const WIDE_PERMS = new Set([
  'dashboard.view', 'studio.view', 'assistant.chat', 'operations.view', 'warranty.view',
  'work_orders.view', 'photos.view', 'receiving.view', 'integrations.google.read',
  'integrations.google.connect', 'integrations.zendesk', 'operations.plans.view',
  'tool_forge.search', 'tool_forge.decide', 'tool_forge.build', 'tool_forge.commit',
]);
const CTX = { organizationId: '00000000-0000-0000-0000-000000000002', staffId: 1, permissions: WIDE_PERMS };

const toSchema = (t: { name: string; description: string; inputSchema: unknown }) =>
  toOpenAiFunctionTool({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Record<string, unknown>,
  });
const ALL_TOOLS: OpenAiFunctionTool[] = [
  ...listAssistantTools(CTX as never).map(toSchema),
  ...buildWriteTools(null).map(toSchema),
  ...UI_TOOLS.map((t) =>
    toOpenAiFunctionTool({
      name: t.name,
      description: t.description ?? '',
      input_schema: t.input_schema as unknown as Record<string, unknown>,
    }),
  ),
];

// ─── Wire client ─────────────────────────────────────────────────────────────

interface WireCall { id: string; name: string; arguments: string }
interface WireMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

async function chatRound(
  messages: WireMessage[],
  tools: OpenAiFunctionTool[],
): Promise<{ text: string; calls: WireCall[]; firstTokenMs: number }> {
  const controller = new AbortController();
  const roundTimer = setTimeout(() => controller.abort(), ROUND_TIMEOUT_MS);
  const firstByteTimer = setTimeout(() => controller.abort(), FIRST_BYTE_TIMEOUT_MS);
  const t0 = Date.now();
  let firstTokenMs = -1;
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        temperature: 0,
        tool_choice: 'auto',
        parallel_tool_calls: true,
        chat_template_kwargs: { enable_thinking: false },
        messages,
        tools,
      }),
      signal: controller.signal,
    });
    clearTimeout(firstByteTimer);
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${detail.slice(0, 300)}`);
    }
    const textParts: string[] = [];
    const acc = new Map<number, { id: string; name: string; args: string }>();
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;
        if (firstTokenMs < 0) firstTokenMs = Date.now() - t0;
        try {
          const chunk = JSON.parse(payload) as {
            choices?: Array<{
              delta?: { content?: string | null; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> };
            }>;
          };
          const delta = chunk.choices?.[0]?.delta;
          if (delta?.content) textParts.push(delta.content);
          for (const tc of delta?.tool_calls ?? []) {
            const idx = tc.index ?? 0;
            const slot = acc.get(idx) ?? { id: '', name: '', args: '' };
            if (tc.id) slot.id = tc.id;
            if (tc.function?.name) slot.name += tc.function.name;
            if (tc.function?.arguments) slot.args += tc.function.arguments;
            acc.set(idx, slot);
          }
        } catch {
          /* keep-alive or partial */
        }
      }
    }
    return {
      text: textParts.join(''),
      calls: [...acc.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => ({ id: c.id || `call_${c.name}`, name: c.name, arguments: c.args || '{}' })),
      firstTokenMs,
    };
  } finally {
    clearTimeout(firstByteTimer);
    clearTimeout(roundTimer);
  }
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

const TENANT_ARG = /"(organizationId|organization_id|staffId|staff_id)"\s*:/i;
const INVENTED_ID = /\bCF-19\d{2}\b/;
const REFUSAL_MARKERS = ['will not', 'cannot', "can't", 'refuse', 'not invent', 'not guess', 'no.'];

interface GoldenRow {
  id: string;
  prompt: string;
  page: string;
  category: 'tool' | 'refusal' | 'artifact' | 'multi' | 'empty';
  expect_tool?: string | null;
  expect_tools?: string[];
  expect_refusal?: boolean;
  expect_artifact_kind?: string;
  expect_empty?: boolean;
}

interface RowResult {
  id: string;
  pass: boolean;
  tool_ok: boolean;
  refuse_ok: boolean;
  invented_id: boolean;
  tenant_arg_leak: boolean;
  unadvertised_call: boolean;
  artifact_valid: boolean | null;
  artifact_first_try: boolean | null;
  empty_honest: boolean | null;
  called_tools: string[];
  turns: number;
  first_token_ms: number;
  text: string;
}

function fixtureResult(name: string, row: GoldenRow, fixtures: Record<string, ToolFixture>): unknown {
  const f = fixtures[name];
  if (!f) return { note: 'no fixture' };
  if (row.expect_empty && f.empty !== undefined) return f.empty;
  return f.ok;
}

async function runRow(row: GoldenRow): Promise<RowResult> {
  const subset = subsetAdvertisedTools(row.prompt, { page: row.page }, ALL_TOOLS);
  const advertised = new Set(subset.tools.map((t) => t.function.name));
  const system = [
    buildSystemCore(subset.tools.map((t) => t.function.name)),
    buildContextFragment({ page: row.page } as never),
  ].join('\n\n');
  const messages: WireMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: row.prompt },
  ];

  const called: string[] = [];
  const artifactPayloads: unknown[] = [];
  let text = '';
  let firstTokenMs = -1;
  let turns = 0;
  let artifactFirstTry: boolean | null = null;

  while (turns < MAX_ROUNDS) {
    turns += 1;
    const round = await chatRound(messages, subset.tools);
    if (firstTokenMs < 0) firstTokenMs = round.firstTokenMs;
    text += (text && round.text ? '\n\n' : '') + round.text;
    if (round.calls.length === 0) break;
    messages.push({
      role: 'assistant',
      content: round.text || null,
      tool_calls: round.calls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: c.arguments } })),
    });
    for (const c of round.calls) {
      called.push(c.name);
      let result: string;
      if (c.name === 'render_artifact') {
        let parsedInput: unknown = {};
        try {
          parsedInput = JSON.parse(c.arguments);
        } catch {
          parsedInput = { artifact: {} };
        }
        const parsed = parseRenderArtifactInput(parsedInput);
        if (artifactFirstTry === null) artifactFirstTry = parsed.success;
        artifactPayloads.push((parsedInput as { artifact?: unknown }).artifact ?? parsedInput);
        result = parsed.success ? 'Rendered on the session view panel.' : `ERROR: render_artifact rejected: ${parsed.success === false ? parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'} ${i.message}`).join('; ') : ''}`;
      } else {
        result = JSON.stringify(fixtureResult(c.name, row, TOOL_FIXTURES));
      }
      messages.push({ role: 'tool', tool_call_id: c.id, content: result });
    }
  }

  const calledSet = new Set(called);
  const argsText = called.length ? '' : '';
  const toolOk = row.expect_refusal
    ? called.length === 0
    : row.expect_tools
      ? row.expect_tools.every((t) => calledSet.has(t))
      : calledSet.has(row.expect_tool ?? '');
  const refuseOk = row.expect_refusal
    ? REFUSAL_MARKERS.some((w) => text.toLowerCase().includes(w))
    : true;
  const unadvertised = called.some((n) => !advertised.has(n));
  const artifacts = artifactPayloads;
  const artifactValid = row.category === 'artifact'
    ? (() => {
        const parsed = artifacts.map((a) => parseRenderArtifactInput({ artifact: a }));
        const anyOk = parsed.some((p) => p.success);
        const kindOk = row.expect_artifact_kind
          ? parsed.some((p) => p.success && (p.data as { kind?: string }).kind === row.expect_artifact_kind)
          : true;
        return anyOk && kindOk;
      })()
    : null;
  const emptyHonest = row.expect_empty
    ? !INVENTED_ID.test(text) && /\b(no|none|zero|clear|empty|nothing)\b/i.test(text)
    : null;

  const invented = INVENTED_ID.test(text) || called.some((n) => n.startsWith('CF-19'));
  const tenantLeak = TENANT_ARG.test(text) && !row.expect_refusal && called.length > 0;

  const pass =
    toolOk && refuseOk && !invented && !tenantLeak && !unadvertised &&
    (artifactValid === null || artifactValid === true) &&
    (emptyHonest === null || emptyHonest === true);

  return {
    id: row.id,
    pass,
    tool_ok: toolOk,
    refuse_ok: refuseOk,
    invented_id: invented,
    tenant_arg_leak: tenantLeak,
    unadvertised_call: unadvertised,
    artifact_valid: artifactValid,
    artifact_first_try: artifactFirstTry,
    empty_honest: emptyHonest,
    called_tools: called,
    turns,
    first_token_ms: firstTokenMs,
    text: text.slice(0, 600),
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const rows: GoldenRow[] = readFileSync(GOLDENS, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  const results: RowResult[] = [];
  for (const row of rows) {
    // One transport hiccup (server restart mid-row, socket cut) must not kill
    // the run: retry the row once, then score it as a hard fail.
    let r: RowResult | null = null;
    for (let attempt = 0; attempt < 2 && !r; attempt++) {
      try {
        r = await runRow(row);
      } catch (err) {
        if (attempt === 0) {
          const { promise, resolve } = Promise.withResolvers<void>();
          setTimeout(resolve, 3000);
          await promise;
        } else {
          console.log(`${row.id}: TRANSPORT-FAIL ${String(err).slice(0, 120)}`);
        }
      }
    }
    if (!r) {
      r = {
        id: row.id, pass: false, tool_ok: false, refuse_ok: false, invented_id: false,
        tenant_arg_leak: false, unadvertised_call: false, artifact_valid: null,
        artifact_first_try: null, empty_honest: null, called_tools: [], turns: 0,
        first_token_ms: -1, text: '',
      };
    }
    results.push(r);
    console.log(
      `${r.id}: pass=${r.pass} tool_ok=${r.tool_ok} ftms=${r.first_token_ms} turns=${r.turns} tools=[${r.called_tools.join(',')}]`,
    );
  }

  // Macro per tool: average per-tool tool_ok over that tool's golden rows.
  const perTool = new Map<string, { ok: number; n: number }>();
  for (const row of rows) {
    if (row.category === 'refusal') continue;
    const t = row.expect_tools?.[0] ?? row.expect_tool;
    if (!t) continue;
    const rec = perTool.get(t) ?? { ok: 0, n: 0 };
    const r = results.find((x) => x.id === row.id)!;
    rec.n += 1;
    if (r.tool_ok) rec.ok += 1;
    perTool.set(t, rec);
  }
  const toolScores = [...perTool.values()].map((v) => v.ok / v.n);
  const macroToolSel = toolScores.length ? toolScores.reduce((a, b) => a + b, 0) / toolScores.length : 0;

  const passRate = results.filter((r) => r.pass).length / results.length;
  const refuseRows = results.filter((r) => rows.find((g) => g.id === r.id)?.expect_refusal);
  const refusalRate = refuseRows.length ? refuseRows.filter((r) => r.refuse_ok).length / refuseRows.length : 1;
  const artifactRows = results.filter((r) => r.artifact_first_try !== null);
  const artifactFirstTryRate = artifactRows.length ? artifactRows.filter((r) => r.artifact_first_try).length / artifactRows.length : 1;
  const ftms = results.map((r) => r.first_token_ms).filter((v) => v > 0).sort((a, b) => a - b);
  const pct = (p: number) => ftms[Math.min(ftms.length - 1, Math.floor(p * ftms.length))] ?? -1;

  const gates = {
    tool_selection_95: macroToolSel >= 0.95,
    pass_rate_95: passRate >= 0.95,
    tenant_leaks_zero: results.every((r) => !r.tenant_arg_leak),
    invented_ids_zero: results.every((r) => !r.invented_id),
    refusal_90: refusalRate >= 0.9,
    artifact_validates: artifactFirstTryRate >= 0.98,
    no_unadvertised_tool_name: results.every((r) => !r.unadvertised_call),
    p95_first_token_ms_le_8000: pct(0.95) >= 0 && pct(0.95) <= 8000,
  };

  const report = {
    label: LABEL,
    base: BASE,
    model: MODEL,
    n: results.length,
    passed: results.filter((r) => r.pass).length,
    pass_rate: passRate,
    macro_tool_selection: macroToolSel,
    refusal_rate: refusalRate,
    artifact_first_try_rate: artifactFirstTryRate,
    tenant_leaks: results.filter((r) => r.tenant_arg_leak).length,
    invented_ids: results.filter((r) => r.invented_id).length,
    unadvertised_calls: results.filter((r) => r.unadvertised_call).length,
    first_token_ms: { p50: pct(0.5), p95: pct(0.95), max: ftms.at(-1) ?? -1 },
    gates,
    per_tool: Object.fromEntries([...perTool.entries()].map(([k, v]) => [k, v.ok / v.n])),
    results,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, results: undefined, per_tool: undefined }, null, 1));
  if (!Object.values(gates).every(Boolean)) process.exit(2);
}

void main();
