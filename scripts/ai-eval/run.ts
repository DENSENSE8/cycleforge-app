/**
 * `pnpm ai:eval` — the assistant's permanent golden eval (plan §C.2).
 *
 * POSTs each golden to `/api/assistant/chat` on the dev origin (:3050 —
 * AGENTS.md §1) as a minted staffer, parses the SSE turn (including
 * `done.usage` and `suggestions`), and scores it against live fixtures.
 *
 * PROVIDER SWITCH, without touching `.env` (the eval pins the route's chain
 * per request via `x-ai-eval-provider`, honoured outside production only):
 *   pnpm ai:eval                                   # local model (CYCLEFORGE_LOCAL_MLX=1 in .env)
 *   CYCLEFORGE_LOCAL_MLX=0 pnpm ai:eval            # the gateway's AI_CHAT_MODEL
 *   CYCLEFORGE_LOCAL_MLX=0 pnpm ai:eval --model llama-4-scout,glm-4.7-flash,qwen3-30b-a3b-fp8
 * `node --env-file` never overrides a variable already set in the shell, so
 * the inline `CYCLEFORGE_LOCAL_MLX=0` wins over `.env`.
 *
 * Flags: --model a,b  --only id,id  --min-pass 0..1 (default 1)  --label x
 *        --harvest (print 👎 turns as golden candidates and exit)
 * Env:   LH_BASE_URL (http://localhost:3050), LH_TENANT_SLUG (usav), LH_STAFF_NAME.
 *
 * Output: a table on stdout and `evals/assistant/<iso>-<model>.json`
 * (gitignored). Exit 1 when the pass ratio is below --min-pass. Its own chat
 * sessions are soft-deleted afterwards.
 */

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadFixtures, loadThumbsDown } from './fixtures';
import { buildGoldens, commonChecks, type TurnResult } from './goldens';

const BASE = process.env.LH_BASE_URL || 'http://localhost:3050';
const TENANT = process.env.LH_TENANT_SLUG || 'usav';
const OUT_DIR = join(process.cwd(), 'evals', 'assistant');

/** Short names for the Workers AI models this eval compares. */
const MODEL_ALIASES: Record<string, string> = {
  'llama-4-scout': 'workers-ai/@cf/meta/llama-4-scout-17b-16e-instruct',
  'glm-4.7-flash': 'workers-ai/@cf/zai-org/glm-4.7-flash',
  'qwen3-30b-a3b-fp8': 'workers-ai/@cf/qwen/qwen3-30b-a3b-fp8',
};

function flag(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? '') : null;
}

function mintCookie(): string {
  const out = execFileSync('node', ['scripts/lighthouse-mint-session.mjs'], {
    encoding: 'utf8',
    env: { ...process.env, LH_BASE_URL: BASE, LH_TENANT_SLUG: TENANT },
  });
  return out.trim().replace(/^LH_COOKIE=/, '');
}

interface EvalRow {
  id: string;
  question: string;
  pass: boolean;
  fails: string[];
  ms: number;
  firstDeltaMs: number | null;
  provider: string | null;
  mode: string | null;
  usage: NonNullable<TurnResult['done']>['usage'] | null;
  tools: string[];
  artifacts: TurnResult['artifacts'];
  suggestions: string[];
  errors: TurnResult['errors'];
  text: string;
}

type Usage = NonNullable<EvalRow['usage']>;

interface Pin {
  provider: 'local' | 'gateway';
  model: string | null;
}

async function ask(cookie: string, pin: Pin, sessionId: string, message: string): Promise<TurnResult & { httpError?: string }> {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/assistant/chat`, {
    method: 'POST',
    headers: {
      cookie,
      'content-type': 'application/json',
      'x-tenant-slug': TENANT,
      'x-ai-eval-provider': pin.provider,
      ...(pin.model ? { 'x-ai-eval-model': pin.model } : {}),
    },
    body: JSON.stringify({
      sessionId,
      message,
      context: { page: '/ai-chat' },
      turnIds: { user: `m-${randomUUID()}`, assistant: `m-${randomUUID()}` },
    }),
  });
  const out: TurnResult & { httpError?: string } = {
    providers: [],
    text: '',
    reasoning: '',
    tools: [],
    artifacts: [],
    done: null,
    errors: [],
    suggestions: [],
    firstDeltaMs: null,
    ms: 0,
  };
  if (!res.ok || !res.body) {
    out.httpError = `HTTP ${res.status} ${await res.text()}`;
    out.ms = Date.now() - t0;
    return out;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const ev = /^event: (.*)$/m.exec(block)?.[1];
      const line = /^data: (.*)$/m.exec(block)?.[1];
      if (!ev || !line) continue;
      const d = JSON.parse(line);
      if (ev === 'meta') out.providers.push(d.provider);
      else if (ev === 'delta') {
        out.text += d.text;
        if (out.firstDeltaMs === null) out.firstDeltaMs = Date.now() - t0;
      } else if (ev === 'reasoning') out.reasoning += d.text;
      else if (ev === 'tool' && d.status === 'start') out.tools.push({ name: d.name, input: d.input });
      else if (ev === 'tool' && d.status === 'end') {
        const t = [...out.tools].reverse().find((x) => x.name === d.name && x.ok === undefined);
        if (t) t.ok = d.ok;
      } else if (ev === 'ui_tool' && d.name === 'render_artifact') {
        out.artifacts.push({
          producedBy: d.input?.producedBy ?? 'model',
          kind: d.input?.artifact?.kind,
          title: d.input?.artifact?.title,
          rows: d.input?.artifact?.rows?.length ?? 0,
          documents: (d.input?.artifact?.documents ?? []).map((doc: { docType?: string }) => doc.docType ?? ''),
        });
      } else if (ev === 'done') {
        out.done = d;
        // `done` ends the turn (K4); latency is measured here, not at close.
        out.ms = Date.now() - t0;
      } else if (ev === 'suggestions') out.suggestions = d.items ?? [];
      else if (ev === 'error') out.errors.push({ message: d.message, code: d.code });
    }
  }
  if (!out.done) out.ms = Date.now() - t0;
  return out;
}

const pct = (sorted: number[], p: number) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] : 0;

async function runModel(cookie: string, pin: Pin, only: string[], label: string) {
  const fixtures = await loadFixtures(TENANT);
  const goldens = buildGoldens(fixtures).filter((g) => only.length === 0 || only.includes(g.id));
  const runId = `${Date.now().toString(36)}${randomUUID().slice(0, 4)}`;
  const sessions = new Set<string>();
  const results: EvalRow[] = [];
  const modelName = pin.provider === 'local' ? 'local_mlx' : (pin.model ?? process.env.AI_CHAT_MODEL ?? 'gateway');
  console.log(`\n▶ ${label} · ${pin.provider} · ${modelName} · ${goldens.length} goldens`);

  for (const g of goldens) {
    const sessionId = `eval-${runId}-${g.thread ?? g.id}`;
    sessions.add(sessionId);
    const r = await ask(cookie, pin, sessionId, g.question);
    const checks = r.httpError ? [[r.httpError, false] as const] : [...g.check(r), ...commonChecks(r, g.bins)];
    const fails = checks.filter(([, ok]) => !ok).map(([name]) => name);
    const usage = r.done?.usage ?? null;
    const row: EvalRow = {
      id: g.id,
      question: g.question,
      pass: fails.length === 0,
      fails,
      ms: r.ms,
      firstDeltaMs: r.firstDeltaMs,
      provider: r.providers.at(-1) ?? null,
      mode: r.done?.mode ?? null,
      usage,
      tools: r.tools.map((t) => `${t.name}(${JSON.stringify(t.input)})${t.ok === false ? '!' : ''}`),
      artifacts: r.artifacts,
      suggestions: r.suggestions,
      errors: r.errors,
      text: r.text,
    };
    results.push(row);
    const tok = usage ? `${usage.inputTokens ?? '?'}→${usage.outputTokens ?? '?'} tok` : 'no usage';
    console.log(
      `${row.pass ? 'PASS' : 'FAIL'} ${g.id.padEnd(15)} ${String(r.ms).padStart(6)}ms ${tok.padEnd(16)} ${row.provider ?? '-'} ${row.tools.join(' ')}${fails.length ? `\n     FAILS: ${fails.join('; ')}` : ''}${r.errors.length ? `\n     ERROR: ${r.errors.map((e) => `[${e.code ?? '-'}] ${e.message}`).join(' | ').slice(0, 600)}` : ''}\n     > ${r.text.replace(/\n/g, ' ⏎ ').slice(0, 240)}`,
    );
  }

  // Soft-delete this run's threads (they belong to the minted staffer).
  for (const id of sessions) {
    await fetch(`${BASE}/api/ai/chat-sessions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { cookie, 'x-tenant-slug': TENANT },
    }).catch(() => null);
  }

  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  const passed = results.filter((r) => r.pass).length;
  const sum = (pick: (u: Usage) => number | null) =>
    results.reduce((s, r) => s + (r.usage ? (pick(r.usage) ?? 0) : 0), 0);
  const summary = {
    label,
    provider: pin.provider,
    model: modelName,
    passed,
    total: results.length,
    p50Ms: pct(ms, 0.5),
    p95Ms: pct(ms, 0.95),
    inputTokens: sum((u) => u.inputTokens),
    outputTokens: sum((u) => u.outputTokens),
    costMicrocents: sum((u) => u.costMicrocents),
    usageReported: results.filter((r) => r.usage?.inputTokens != null).length,
    fixtures,
  };
  console.log(
    `\n${label} · ${modelName}: ${passed}/${results.length} pass · p50 ${summary.p50Ms}ms · p95 ${summary.p95Ms}ms · tokens ${summary.inputTokens} in / ${summary.outputTokens} out (${summary.usageReported}/${results.length} turns reported) · cost ${summary.costMicrocents} µ¢`,
  );
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(
    OUT_DIR,
    `${new Date().toISOString().replace(/[:.]/g, '-')}-${modelName.replace(/[^A-Za-z0-9.-]+/g, '_')}.json`,
  );
  writeFileSync(file, JSON.stringify({ ...summary, results }, null, 2));
  console.log(`   → ${file}`);
  return summary;
}

async function main() {
  if (process.argv.includes('--harvest')) {
    const rows = await loadThumbsDown(TENANT);
    if (rows.length === 0) console.log('No 👎 turns yet.');
    for (const r of rows) {
      console.log(`${r.at}  ${r.sessionId}\n  Q: ${r.question ?? '(none)'}\n  A: ${r.answer.slice(0, 200).replace(/\n/g, ' ⏎ ')}${r.note ? `\n  note: ${r.note}` : ''}`);
    }
    return;
  }

  const local = !/^(0|off|false)$/i.test(process.env.CYCLEFORGE_LOCAL_MLX ?? '1');
  const models = (flag('model') ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
    .map((m) => MODEL_ALIASES[m] ?? m);
  const only = (flag('only') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const minPass = Number(flag('min-pass') ?? '1');
  const label = flag('label') ?? 'ai-eval';
  const pins: Pin[] = local
    ? [{ provider: 'local', model: null }]
    : (models.length ? models : [null]).map((model) => ({ provider: 'gateway' as const, model }));

  const cookie = mintCookie();
  const summaries = [];
  for (const pin of pins) summaries.push(await runModel(cookie, pin, only, label));

  if (summaries.length > 1) {
    console.log('\nmodel'.padEnd(60), 'pass', 'p95ms', 'tokens in/out');
    for (const s of summaries) {
      console.log(s.model.padEnd(59), `${s.passed}/${s.total}`.padEnd(4), String(s.p95Ms).padEnd(5), `${s.inputTokens}/${s.outputTokens}`);
    }
  }
  const worst = Math.min(...summaries.map((s) => (s.total ? s.passed / s.total : 0)));
  if (worst < minPass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
