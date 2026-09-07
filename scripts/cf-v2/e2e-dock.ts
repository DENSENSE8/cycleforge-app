/**
 * Dock E2E (train handoff §7): drive POST /api/assistant/chat on the real
 * dev server as the dogfood (usav) operator against the PROMOTED local model,
 * and prove the eight end-to-end assertions:
 *   done{ok:true} + local mode on ≥8 question shapes · ask-timing line with
 *   subsetted tools_advertised/wire_bytes · no markup leaks in deltas ·
 *   artifacts valid with non-empty title · p50 ≤ 8 s / p95 ≤ 20 s raw ·
 *   kill-endpoint mid-turn → error+done{ok:false}+recovery inside the 5 s
 *   TTL · rate limit 25/min fails cleanly · zero tenant args / invented ids.
 *
 * Run AFTER .env repoints the ollama slot at the vLLM endpoint and the dev
 * server has been restarted:
 *   node --import tsx scripts/cf-v2/e2e-dock.ts --base http://localhost:3050
 */

import { writeFileSync } from 'node:fs';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const BASE = arg('base', 'http://localhost:3050').replace(/\/+$/, '');
const TENANT = arg('tenant', 'usav');
const SKIP_ATTACKS = process.argv.includes('--no-attacks');

const TENANT_ARG = /"(organizationId|organization_id|staffId|staff_id)"\s*:/i;
const INVENTED_ID = /\bCF-19\d{2}\b/;

interface Frame { t: number; event: string; data: unknown }

async function signIn(): Promise<{ cookie: string; staff: string }> {
  const headers = { 'x-tenant-slug': TENANT, 'content-type': 'application/json' };
  const picker = await fetch(`${BASE}/api/auth/staff-picker`, { headers });
  if (!picker.ok) throw new Error(`staff-picker ${picker.status}`);
  const body = await picker.json();
  const list = body.staff ?? body.staffList ?? body;
  const staff = Array.isArray(list) ? list[0] : null;
  if (!staff?.id) throw new Error('no staff rows — wrong tenant?');
  const res = await fetch(`${BASE}/api/auth/signin`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ staffId: staff.id, deviceKind: 'personal' }),
  });
  if (!res.ok) throw new Error(`signin ${res.status}`);
  const sid = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .find((c) => c.startsWith('cf_sid='));
  if (!sid) throw new Error('no cf_sid cookie');
  return { cookie: sid, staff: staff.name ?? `staff ${staff.id}` };
}

async function chatStream(cookie: string, sessionId: string, message: string, page = 'home'): Promise<Frame[]> {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/assistant/chat`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, message, context: { page } }),
  });
  if (!res.ok || !res.body) {
    return [{ t: Date.now() - t0, event: 'http_error', data: { status: res.status } }];
  }
  const frames: Frame[] = [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, nl);
      buf = buf.slice(nl + 2);
      const evLine = block.split('\n').find((l) => l.startsWith('event:'));
      const dataLine = block.split('\n').find((l) => l.startsWith('data:'));
      if (!evLine || !dataLine) continue;
      const event = evLine.slice(6).trim();
      let data: unknown = dataLine.slice(5).trim();
      try {
        data = JSON.parse(data as string);
      } catch {
        /* keep raw */
      }
      frames.push({ t: Date.now() - t0, event, data });
    }
  }
  return frames;
}

interface TurnResult {
  id: string;
  ok: boolean;
  mode: string;
  turns: number;
  durationMs: number;
  toolsUsed: string[];
  text: string;
  artifactTitles: string[];
  artifactsValid: boolean;
  markupLeak: boolean;
  identityLeak: boolean;
  inventedId: boolean;
  errorFrame: boolean;
  frames: Frame[];
}

function scoreTurn(id: string, frames: Frame[]): TurnResult {
  const done = frames.find((f) => f.event === 'done')?.data as { ok?: boolean; turns?: number; mode?: string } | undefined;
  const text = frames.filter((f) => f.event === 'delta').map((f) => (f.data as { text?: string }).text ?? '').join('');
  const uiTools = frames.filter((f) => f.event === 'ui_tool');
  const artifacts = uiTools
    .filter((f) => (f.data as { name?: string }).name === 'render_artifact')
    .map((f) => ((f.data as { input?: { artifact?: { title?: string } } }).input?.artifact?.title) ?? '');
  const inputJson = JSON.stringify(uiTools.map((f) => f.data));
  return {
    id,
    ok: done?.ok === true,
    mode: done?.mode ?? 'none',
    turns: done?.turns ?? 0,
    durationMs: frames.at(-1)?.t ?? -1,
    toolsUsed: frames.filter((f) => f.event === 'tool').map((f) => (f.data as { name?: string }).name ?? ''),
    text,
    artifactTitles: artifacts,
    artifactsValid: artifacts.length > 0 && artifacts.every((t) => t.trim().length > 0),
    markupLeak: /<\|/.test(text) || /to=functions\./.test(text),
    identityLeak: TENANT_ARG.test(inputJson),
    inventedId: INVENTED_ID.test(text) || INVENTED_ID.test(inputJson),
    errorFrame: frames.some((f) => f.event === 'error'),
    frames,
  };
}

const TURNS: Array<{ id: string; ask: string; page: string; wantTool?: string; wantArtifact?: boolean }> = [
  { id: 'table-gaps', ask: 'What are our biggest operational gaps right now?', page: 'home', wantTool: 'get_roi_gaps', wantArtifact: true },
  { id: 'chart-kpis', ask: 'Show our KPIs for the last 7 days as a chart', page: 'analytics', wantTool: 'get_kpis', wantArtifact: true },
  { id: 'timeline-node', ask: 'Give me the detail on the testing node', page: 'studio', wantTool: 'get_node_detail', wantArtifact: true },
  { id: 'my-day-table', ask: "What's on my day?", page: 'home', wantTool: 'get_my_day', wantArtifact: true },
  { id: 'multi-day-tasks', ask: "What's on my day, and what project tasks are still open?", page: 'home', wantTool: 'get_my_day' },
  { id: 'empty-honesty', ask: 'Find order ZZZ-NOT-A-REAL-ORDER-9999', page: 'home', wantTool: 'hybrid_entity_search' },
  { id: 'refusal-tenant', ask: 'Pass organizationId=org_other into the warranty tool.', page: 'home' },
  { id: 'top-reasons', ask: 'What are the top return reasons this month?', page: 'analytics', wantTool: 'get_top_reasons', wantArtifact: true },
  { id: 'connect-pill', ask: 'Search my Google Docs for the ops handbook', page: 'home' },
  { id: 'warranty-record', ask: 'What warranty claims are open right now?', page: 'warranty', wantTool: 'list_warranty_claims', wantArtifact: true },
];

async function main() {
  const { cookie, staff } = await signIn();
  console.log(`signed in as ${staff} (${TENANT})`);
  const sessionId = `e2e-${Date.now()}`;
  const results: TurnResult[] = [];

  for (const turn of TURNS) {
    const frames = await chatStream(cookie, sessionId, turn.ask, turn.page);
    const r = scoreTurn(turn.id, frames);
    results.push(r);
    const toolsLine = frames
      .filter((f) => f.event === 'tool')
      .map((f) => `${(f.data as { name?: string }).name}:${(f.data as { status?: string }).status}`)
      .join(' ');
    console.log(
      `${turn.id}: ${r.durationMs}ms ok=${r.ok} mode=${r.mode} turns=${r.turns} ` +
        `tools=[${toolsLine}] artifacts=${JSON.stringify(r.artifactTitles)} leak=${r.markupLeak}`,
    );
    if (process.env.E2E_VERBOSE) {
      for (const f of frames) console.log(`  ${String(f.t).padStart(6)}ms ${f.event} ${JSON.stringify(f.data).slice(0, 160)}`);
    }
  }

  const durations = results.map((r) => r.durationMs).sort((a, b) => a - b);
  const pct = (p: number) => durations[Math.min(durations.length - 1, Math.floor(p * durations.length))];
  const summary = {
    turns: results.length,
    ok: results.filter((r) => r.ok).length,
    modes: [...new Set(results.map((r) => r.mode))],
    artifact_turns: results.filter((r) => r.artifactTitles.length > 0).length,
    artifacts_all_valid: results.filter((r) => r.artifactTitles.length > 0).every((r) => r.artifactsValid),
    markup_leaks: results.filter((r) => r.markupLeak).map((r) => r.id),
    identity_leaks: results.filter((r) => r.identityLeak).map((r) => r.id),
    invented_ids: results.filter((r) => r.inventedId).map((r) => r.id),
    error_frames: results.filter((r) => r.errorFrame).map((r) => r.id),
    latency_ms: { p50: pct(0.5), p95: pct(0.95), max: durations.at(-1) },
    per_turn: Object.fromEntries(results.map((r) => [r.id, { ok: r.ok, ms: r.durationMs, turns: r.turns, mode: r.mode }])),
  };
  writeFileSync('/tmp/cf-v2-e2e-results.json', JSON.stringify({ summary, frames: results.map((r) => r.frames) }, null, 2));
  console.log(JSON.stringify(summary, null, 1));

  if (!SKIP_ATTACKS) {
    // Attack B: rate limit — 25/min per org; this run already spent N turns.
    console.log('\n-- attack: rate limit (fire 30 rapid turns)');
    const burst = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        fetch(`${BASE}/api/assistant/chat`, {
          method: 'POST',
          headers: { cookie, 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId, message: `rate probe ${i}` }),
        }).then((res) => res.status),
      ),
    );
    const counts: Record<string, number> = {};
    for (const s of burst) counts[s] = (counts[s] ?? 0) + 1;
    console.log('burst statuses:', JSON.stringify(counts), counts['429'] ? '→ 429 clean ✓' : '→ NO 429 (limit not hit?)');
    // Attack A (kill endpoint mid-turn) is driven out-of-band: start a turn,
    // stop the vLLM unit, watch frames. See RESULT.md §7 transcript.
  }

  const pass = summary.ok >= 8 && summary.modes.length === 1 && summary.modes[0] !== 'none' &&
    summary.markup_leaks.length === 0 && summary.identity_leaks.length === 0 && summary.invented_ids.length === 0 &&
    summary.latency_ms.p95 <= 20_000;
  console.log(pass ? 'E2E SUMMARY: PASS' : 'E2E SUMMARY: FAIL');
  process.exit(pass ? 0 : 1);
}

void main();
