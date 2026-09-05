#!/usr/bin/env node
/**
 * Ask SSE probe — PR 1 of docs/todo/ask-org-scoped-chat-PLAN.md (§23.A).
 *
 * Drives POST /api/assistant/chat against the RUNNING dev server as a signed-in
 * QA operator, and prints every SSE event with a timestamp so a turn's shape is
 * visible: which brain answered, when the first visible token landed, which
 * tools ran, and what the operator would have read.
 *
 * It never restarts a server. It signs in the way scripts/request-shape.mjs
 * does (pinless staff-picker + signin, AUTH_PINLESS_SIGNIN=true on :3050) and
 * reuses one cf_sid for every turn.
 *
 *   node scripts/probe-ask-sse.mjs                    # the four plan turns
 *   node scripts/probe-ask-sse.mjs --turn 3           # just turn 3
 *   node scripts/probe-ask-sse.mjs --ask "..." --page unbox --receiving 7114
 *   node scripts/probe-ask-sse.mjs --base http://localhost:3050 --tenant cycleforge-qa
 *   node scripts/probe-ask-sse.mjs --json out.json    # also write the transcript
 *
 * Exit code is 1 when any turn ends without a `done` event or with ok:false, so
 * this can gate a PR without a human reading the output.
 */

import { writeFile } from 'node:fs/promises';

// ── args ────────────────────────────────────────────────────────────────────

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (process.argv[i + 1] ?? '');
};
const has = (name) => process.argv.includes(`--${name}`);

const BASE = (arg('base', 'http://localhost:3050')).replace(/\/+$/, '');
const TENANT = arg('tenant', 'cycleforge-qa');
const STAFF = arg('staff', null);
const JSON_OUT = arg('json', null);
const ONLY = arg('turn', null);
const TIMEOUT_MS = Number(arg('timeout', '180')) * 1000;

/** The plan's §23.A turns. Turn 4's mutation lands with PR 4. */
const TURNS = [
  {
    id: 1,
    label: 'classified fact — packing count (must NOT enter the tool loop)',
    message: 'how many packages did this packer pack this week?',
    context: { page: 'unbox', selection: { kind: 'receiving', id: 7114 } },
    expect: {
      noTools: true,
      textMatches: /packages|packed|packer/i,
      // The carton's products must not bleed into a workspace count.
      textRejects: /bose|airpods|sony/i,
    },
  },
  {
    id: 2,
    label: 'carton brief — product names, no internal ids',
    message: 'tell me about this order',
    context: { page: 'unbox', selection: { kind: 'receiving', id: 7114 } },
    expect: { noTools: true },
  },
  {
    id: 3,
    label: 'tool turn — tracking lookup (PR 1: expect tool events)',
    message: 'look up tracking QA-MOCK-TRK-PO',
    context: { page: 'unbox' },
    expect: { wantsTools: true },
  },
  {
    id: 4,
    label: 'tool turn — order desk question with a write-verb skill mounted',
    message: 'who is assigned to pick and pack on the oldest unshipped order?',
    context: {
      page: 'shipping-orders',
      skill: 'Pick = the TEST work slot; Packed = the PACK work slot. Use propose_mutation for changes.',
    },
    expect: { wantsTools: true },
  },
];

// ── sign in ─────────────────────────────────────────────────────────────────

async function signIn() {
  const headers = { 'x-tenant-slug': TENANT, 'content-type': 'application/json' };
  const picker = await fetch(`${BASE}/api/auth/staff-picker`, { headers });
  if (!picker.ok) {
    throw new Error(`staff-picker ${picker.status} — is the server up at ${BASE}?`);
  }
  const body = await picker.json();
  const list = body.staff ?? body.staffList ?? body;
  const staff = Array.isArray(list)
    ? (STAFF ? list.find((s) => s.name === STAFF) : null) ?? list[0]
    : null;
  if (!staff?.id) throw new Error(`no staff found${STAFF ? ` (looked for "${STAFF}")` : ''} — wrong tenant slug?`);

  const res = await fetch(`${BASE}/api/auth/signin`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ staffId: staff.id, deviceKind: 'personal' }),
  });
  if (!res.ok) {
    throw new Error(`signin ${res.status} — is the server running with AUTH_PINLESS_SIGNIN=true?`);
  }
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie')];
  const sid = cookies.filter(Boolean).map((c) => c.split(';')[0]).find((c) => c.startsWith('cf_sid='));
  if (!sid) throw new Error('signin succeeded but no cf_sid cookie came back');
  return { cookie: sid, staff: staff.name ?? `staff ${staff.id}` };
}

// ── one turn ────────────────────────────────────────────────────────────────

async function runTurn(turn, cookie) {
  const sessionId = `probe-ask-${turn.id}-${Date.now()}`;
  const startedAt = Date.now();
  const at = () => `${String(Date.now() - startedAt).padStart(6)} ms`;

  const record = {
    id: turn.id,
    label: turn.label,
    message: turn.message,
    sessionId,
    provider: null,
    mode: null,
    events: [],
    tools: [],
    uiTools: [],
    text: '',
    firstTokenMs: null,
    totalMs: 0,
    done: null,
    errors: [],
    failures: [],
  };

  console.log(`\n▶ turn ${turn.id} — ${turn.label}`);
  console.log(`  "${turn.message}"  ctx=${JSON.stringify(turn.context)}`);

  let res;
  try {
    res = await fetch(`${BASE}/api/assistant/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, 'x-tenant-slug': TENANT },
      body: JSON.stringify({ sessionId, message: turn.message, context: turn.context }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    record.failures.push(`request failed: ${err.message}`);
    console.log(`  ✖ ${err.message}`);
    return record;
  }

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    record.failures.push(`HTTP ${res.status}: ${detail.slice(0, 300)}`);
    console.log(`  ✖ HTTP ${res.status} ${detail.slice(0, 300)}`);
    return record;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let event = null;

  const handle = (name, data) => {
    let payload;
    try {
      payload = JSON.parse(data);
    } catch {
      payload = { raw: data };
    }
    record.events.push({ atMs: Date.now() - startedAt, event: name, payload });
    switch (name) {
      case 'meta':
        record.provider = payload.provider ?? null;
        console.log(`  ${at()}  meta      provider=${payload.provider}`);
        break;
      case 'delta':
        if (record.firstTokenMs === null) {
          record.firstTokenMs = Date.now() - startedAt;
          console.log(`  ${at()}  delta     first token`);
        }
        record.text += payload.text ?? '';
        break;
      case 'tool':
        if (payload.status === 'start') {
          record.tools.push(payload.name);
          console.log(`  ${at()}  tool      ${payload.name} start`);
        } else {
          console.log(`  ${at()}  tool      ${payload.name} end ok=${payload.ok}`);
        }
        break;
      case 'ui_tool':
        record.uiTools.push(payload.name);
        console.log(`  ${at()}  ui_tool   ${payload.name} ${JSON.stringify(payload.input)}`);
        break;
      case 'error':
        record.errors.push(payload.message ?? String(data));
        console.log(`  ${at()}  error     ${payload.message}`);
        break;
      case 'done':
        record.done = payload;
        record.mode = payload.mode ?? null;
        console.log(`  ${at()}  done      ok=${payload.ok} turns=${payload.turns} mode=${payload.mode ?? '—'}`);
        break;
      default:
        console.log(`  ${at()}  ${name}`);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) {
        handle(event ?? 'message', line.slice(5).trim());
        event = null;
      }
    }
  }
  record.totalMs = Date.now() - startedAt;

  // ── expectations ──
  const e = turn.expect ?? {};
  if (!record.done) record.failures.push('stream ended with no done event');
  else if (record.done.ok === false) record.failures.push(`done.ok was false${record.errors.length ? `: ${record.errors[0]}` : ''}`);
  if (!record.text.trim()) record.failures.push('no visible text reached the operator');
  if (e.noTools && record.tools.length) {
    record.failures.push(`classified turn entered the tool loop: ${record.tools.join(', ')}`);
  }
  if (e.wantsTools && !record.tools.length) {
    record.failures.push('no tool ran — the loop answered from memory or the wire dropped the call');
  }
  if (e.textMatches && !e.textMatches.test(record.text)) {
    record.failures.push(`answer did not match ${e.textMatches}`);
  }
  if (e.textRejects && e.textRejects.test(record.text)) {
    record.failures.push(`answer leaked content it should not have (${e.textRejects})`);
  }

  console.log(`  text: ${record.text.trim().slice(0, 400).replace(/\n/g, ' ') || '(none)'}`);
  for (const f of record.failures) console.log(`  ✖ ${f}`);
  if (!record.failures.length) console.log('  ✓ turn looks right');
  return record;
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  const custom = arg('ask', null);
  const turns = custom
    ? [
        {
          id: 0,
          label: 'custom',
          message: custom,
          context: {
            page: arg('page', 'unbox'),
            ...(arg('receiving', null)
              ? { selection: { kind: 'receiving', id: Number(arg('receiving')) } }
              : {}),
          },
          expect: {},
        },
      ]
    : TURNS.filter((t) => !ONLY || String(t.id) === String(ONLY));

  const { cookie, staff } = await signIn();
  console.log(`signed in to ${BASE} as ${staff} (tenant ${TENANT}) · ${turns.length} turn(s)`);

  const records = [];
  for (const turn of turns) records.push(await runTurn(turn, cookie));

  console.log('\n| turn | provider | mode | first token | total | tools | failures |');
  console.log('|---|---|---|---|---|---|---|');
  for (const r of records) {
    console.log(
      `| ${r.id} | ${r.provider ?? '—'} | ${r.mode ?? '—'} | ${r.firstTokenMs ?? '—'} ms | ${r.totalMs} ms | ${r.tools.join(', ') || '—'} | ${r.failures.length || '—'} |`,
    );
  }

  if (JSON_OUT) {
    await writeFile(JSON_OUT, JSON.stringify({ ranAt: new Date().toISOString(), base: BASE, tenant: TENANT, records }, null, 2));
    console.log(`\nwrote ${JSON_OUT}`);
  }

  const failed = records.filter((r) => r.failures.length);
  if (failed.length) {
    console.log(`\n${failed.length} of ${records.length} turn(s) did not meet expectations.`);
    process.exit(1);
  }
  console.log(`\nall ${records.length} turn(s) met expectations.`);
}

main().catch((err) => {
  console.error('probe failed:', err.message);
  process.exit(1);
});
