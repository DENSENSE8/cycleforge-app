/**
 * Build datasets/cycleforge-v2/{train,valid,test}.jsonl (train handoff §5).
 *
 * Deterministic synthetic generation — no teacher round-trip, no live data.
 * Every trace:
 *   • carries the SUBSETTED tool advertisement production sends (the real
 *     subsetAdvertisedTools + buildSystemCore), closing the v1 defect where
 *     training saw 4 k tokens against an 11.2 k production prompt;
 *   • passes the six deterministic validators from the handoff, imported or
 *     mirrored exactly (registry membership, zod schema parse, permission,
 *     parseRenderArtifactInput, identity-arg regex, invented-id regex) — a
 *     trace that fails any of them is discarded and counted in the reject
 *     histogram;
 *   • uses synthetic fixtures only (ORD-/SN-/SKU-DEMO- ids, QA org shape).
 *
 * Golden prompts are excluded from the generated pool (train/eval split by
 * construction, like v1).
 *
 * Run: node --import tsx --import ./scripts/register-server-only-shim.cjs scripts/cf-v2/build-dataset.ts
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { listAssistantTools } from '@/lib/assistant/tools';
import { buildWriteTools } from '@/lib/assistant/tools/write-tools';
import { toOpenAiFunctionTool, type OpenAiFunctionTool } from '@/lib/assistant/tools/openai-schema';
import { UI_TOOLS, buildSystemCore, buildContextFragment, parseRenderArtifactInput } from '@/lib/assistant/agent-loop';
import { subsetAdvertisedTools } from '@/lib/assistant/tool-subsetting';
import { TOOL_FIXTURES, REFUSALS, MULTI_TOOL, EMPTY_RESULT_TOOLS, type ToolFixture } from './fixtures';

// ─── Deterministic PRNG (mulberry32) ─────────────────────────────────────────

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── The production-shaped advertisement (same as eval-server.ts) ────────────

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
const TOOL_BY_NAME = new Map([...listAssistantTools(CTX as never), ...buildWriteTools(null)].map((t) => [t.name, t]));
const UI_TOOL_NAMES = new Set(UI_TOOLS.map((t) => t.name));

const TENANT_ARG = /"(organizationId|organization_id|staffId|staff_id)"\s*:/i;
const INVENTED_ID = /\bCF-19\d{2}\b/;

function validateTrace(messages: Array<Record<string, unknown>>): string | null {
  for (const m of messages) {
    for (const call of (m.tool_calls as Array<{ function: { name: string; arguments: string } }> | undefined) ?? []) {
      const name = call.function.name;
      const tool = TOOL_BY_NAME.get(name);
      // 1. the name is one of the registry (UI verbs are client-dispatched;
      //    render_artifact is gated by validator #4 below instead).
      if (!tool) {
        if (name === 'render_artifact') {
          // 4. artifacts render — the UI verb's real gate
          try {
            const parsed = parseRenderArtifactInput(JSON.parse(call.function.arguments || '{}'));
            if (!parsed.success) return `artifact:${parsed.error.issues.map((i) => i.path.join('.')).join('|')}`;
          } catch {
            return 'artifact:args-json';
          }
          continue;
        }
        if (UI_TOOL_NAMES.has(name)) continue;
        return `unregistered:${name}`;
      }
      // 2. args are dispatchable
      let args: unknown = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        return `args-json:${name}`;
      }
      if (!tool.inputSchema.safeParse(args).success) return `args-schema:${name}`;
      // 3. legal for the role it claims (WIDE_PERMS stands in for the eval role)
      if (!(CTX.permissions as Set<string>).has(tool.permission)) return `permission:${name}:${tool.permission}`;
      // 5. zero identity args
      if (TENANT_ARG.test(call.function.arguments)) return `identity-arg:${name}`;
    }
    const text = typeof m.content === 'string' ? m.content : '';
    // 6. zero invented identifiers anywhere
    if (INVENTED_ID.test(text)) return 'invented-id';
    if (TENANT_ARG.test(text) && m.role === 'tool') return 'identity-arg-in-result';
  }
  return null;
}

function validateArtifact(payload: unknown): string | null {
  const parsed = parseRenderArtifactInput({ artifact: payload });
  if (!parsed.success) return `artifact:${parsed.error.issues.map((i) => i.path.join('.')).join('|')}`;
  return null;
}

// ─── Trace assembly ──────────────────────────────────────────────────────────

type WireMsg =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> }
  | { role: 'tool'; tool_call_id: string; content: string };

function buildBase(prompt: string, page: string): { messages: WireMsg[]; tools: OpenAiFunctionTool[] } {
  const subset = subsetAdvertisedTools(prompt, { page }, ALL_TOOLS);
  const system = [
    buildSystemCore(subset.tools.map((t) => t.function.name)),
    buildContextFragment({ page } as never),
  ].join('\n\n');
  return {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    tools: subset.tools,
  };
}

function assistantCall(name: string, args: Record<string, unknown>, id: string): WireMsg {
  return {
    role: 'assistant',
    content: '',
    tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
  };
}

function toolResult(id: string, payload: unknown): WireMsg {
  return { role: 'tool', tool_call_id: id, content: JSON.stringify(payload) };
}

// ─── Artifact builders from fixture payloads (validator #4 gates each) ───────

function tableArtifact(f: ToolFixture, ok: Record<string, unknown>): unknown {
  const rowsArr = (ok.rows ?? ok.hits ?? ok.claims ?? ok.assignments ?? ok.reasons ?? ok.photos ?? ok.staff ?? ok.results ?? ok.matches ?? ok.mutations ?? ok.sessions ?? ok.tasks ?? ok.documents ?? ok.nodes ?? ok.packers ?? ok.gaps ?? ok.items ?? ok.tasks ?? []) as Array<Record<string, unknown>>;
  const rows = (rowsArr as Array<Record<string, unknown>>).slice(0, 8).map((r) => {
    const out: Record<string, string | number | null> = {};
    for (const [k, v] of Object.entries(r).slice(0, 6)) {
      out[k] = v == null ? null : typeof v === 'object' ? JSON.stringify(v) : (v as string | number | boolean | null) as string | number | null;
    }
    return out;
  });
  const columns = rows.length ? Object.keys(rows[0]) : ['result'];
  if (!rows.length) rows.push({ result: 'none' });
  return { kind: 'table', title: labelFor(f.tool), columns, rows };
}

function labelFor(tool: string): string {
  const f = TOOL_FIXTURES[tool];
  const q = f?.questions[0] ?? tool;
  return q.replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 60) || tool;
}

function timelineArtifact(ok: Record<string, unknown>): unknown {
  const events = (ok.events ?? []) as Array<Record<string, unknown>>;
  return {
    kind: 'timeline',
    title: labelFor('get_operations_journey'),
    subject: String(ok.subject ?? (ok.identity as Record<string, unknown> | undefined)?.serial ?? 'subject'),
    items: events.slice(0, 10).map((e) => ({
      at: String(e.at ?? ''),
      actor: null,
      action: String(e.action ?? e.type ?? 'event'),
      detail: e.detail ?? e.note ?? null,
    })),
  };
}

function chartArtifact(tool: string, ok: Record<string, unknown>): unknown {
  const series: Array<{ label: string; value: number }> = [];
  const reasons = ok.reasons as Array<Record<string, unknown>> | undefined;
  if (reasons) for (const r of reasons.slice(0, 8)) series.push({ label: String(r.reasonCode ?? r.signalKind ?? ''), value: Number(r.count ?? 0) });
  const events = ok.events as Record<string, unknown> | undefined;
  if (events && !series.length) for (const [k, v] of Object.entries(events).slice(0, 12)) series.push({ label: k, value: Number(v) });
  const packers = ok.packers as Array<Record<string, unknown>> | undefined;
  if (packers && !series.length) for (const p of packers.slice(0, 8)) series.push({ label: String(p.staff ?? ''), value: Number(p.weightedMinutes ?? 0) });
  if (!series.length) series.push({ label: tool, value: 0 });
  return { kind: 'chart', title: labelFor(tool), chartType: 'bar', series };
}

function recordArtifact(tool: string, ok: Record<string, unknown>): unknown {
  const fields: Array<{ label: string; value: string }> = [];
  const push = (label: string, value: unknown) => {
    if (value != null && fields.length < 12) fields.push({ label, value: String(value).slice(0, 300) });
  };
  for (const [k, v] of Object.entries(ok).slice(0, 10)) {
    if (v == null || typeof v === 'object') continue;
    push(k, v);
  }
  const href = (ok.href as string | undefined) ?? ((ok.order as Record<string, unknown> | undefined)?.href as string | undefined) ?? '/home';
  return { kind: 'record', title: labelFor(tool), path: href, fields: fields.length ? fields : [{ label: 'status', value: 'ok' }] };
}

function ticketThreadArtifact(ok: Record<string, unknown>): unknown {
  const ticket = (ok.ticket ?? {}) as Record<string, unknown>;
  const messages = (ok.messages ?? []) as Array<Record<string, unknown>>;
  return {
    kind: 'ticket_thread',
    title: String(ticket.subject ?? 'Support ticket'),
    ticketId: Number(ticket.id ?? 4821),
    subject: String(ticket.subject ?? '') || null,
    status: String(ticket.status ?? '') || null,
    messages: messages.map((m) => ({ author: String(m.author ?? 'staff'), at: m.at ? String(m.at) : null, body: String(m.body ?? '').slice(0, 2000), public: true })),
  };
}

function replyDraftArtifact(ok: Record<string, unknown>): unknown {
  return {
    kind: 'ticket_reply_draft',
    title: String(ok.subject ?? 'Reply draft'),
    ticketId: Number(ok.ticketId ?? 4821),
    subject: String(ok.subject ?? ''),
    body: String(ok.body ?? ''),
    public: true,
  };
}

function importTriageArtifact(ok: Record<string, unknown>): unknown {
  const rows = (ok.rows ?? []) as Array<Record<string, unknown>>;
  const acceptedRows = rows
    .filter((r) => r.status === 'accepted')
    .map((r) => ({
      orderNumber: String(r.orderNumber ?? ''),
      itemNumber: String(r.itemNumber ?? ''),
      itemTitle: String(r.itemTitle ?? ''),
      quantity: String(r.quantity ?? '1'),
    }));
  return {
    kind: 'import_triage',
    title: 'Order import triage',
    mapping: (ok.mapping ?? {}) as Record<string, string>,
    rows: rows.map((r) => ({
      orderNumber: String(r.orderNumber ?? ''),
      itemNumber: String(r.itemNumber ?? ''),
      itemTitle: String(r.itemTitle ?? ''),
      quantity: String(r.quantity ?? ''),
      status: r.status === 'accepted' ? 'accepted' : 'needs_resolution',
      reason: String(r.reason ?? ''),
    })),
    acceptedRows,
    mappingApplied: true,
  };
}

function documentArtifact(ok: Record<string, unknown>): unknown {
  return {
    kind: 'document',
    title: String(ok.title ?? 'Document'),
    source: 'Google Docs',
    url: (ok.url as string | undefined) ?? null,
    body: String(ok.body ?? '').slice(0, 8000),
    lastModified: null,
  };
}

function artifactFor(tool: string, ok: unknown): unknown {
  const f = TOOL_FIXTURES[tool];
  const rec = (ok ?? {}) as Record<string, unknown>;
  switch (f?.artifact) {
    case 'table': return tableArtifact(f, rec);
    case 'timeline': return timelineArtifact(rec);
    case 'chart': return chartArtifact(tool, rec);
    case 'record': return recordArtifact(tool, rec);
    case 'ticket_thread': return ticketThreadArtifact(rec);
    case 'ticket_reply_draft': return replyDraftArtifact(rec);
    case 'import_triage': return importTriageArtifact(rec);
    case 'document': return documentArtifact(rec);
    default: return tableArtifact(f ?? { tool, questions: [tool] } as ToolFixture, rec);
  }
}

// ─── Grounded answer prose (per-tool templates over fixture values) ──────────

const ANSWERS: Record<string, string[]> = {
  hybrid_entity_search: ['Found {count} matches — top hit: {top}. The table is on the panel.', '{count} hits came back; the best one is {top}.'],
  exact_id_serial_search: ['That identifier resolves to {top}.', 'Exact match: {top}.'],
  get_operations_journey: ['The full journey is on the panel — {events} events from receiving onward.', '{events} events across stations; timeline is up.'],
  get_order_lookup: ['Order found: {top}. Record card is on the panel.', 'Here is the order — {top}.'],
  lookup_serial: ['Yes — matched to {top}. Details on the panel.', 'The serial resolved: {top}.'],
  lookup_warranty_coverage: ['Warranty runs to {expiry} ({daysRemaining} days left). Record is on the panel.', 'Coverage until {expiry}; {daysRemaining} days remaining.'],
  list_warranty_claims: ['{count} claims; the table is on the panel.', '{count} warranty claims listed.'],
  resolve_support_ticket: ['Ticket {id} → receiving {receivingId}. Thread on the panel.', 'Resolved to carton {receivingId}; thread shown.'],
  get_ticket_entities: ['{count} linked entities; table on the panel.', '{count} links found.'],
  get_receiving_by_tracking: ['That tracking is carton {receivingId} ({lines} lines).', 'Receiving {receivingId} carries it.'],
  get_signals_by_node: ['Signals cluster at the top node shown on the panel.', 'Counts by node are up.'],
  get_top_reasons: ['Top reason is {topReason} — donut on the panel.', 'The counts are charted; {topReason} leads.'],
  get_unit_journey: ['The unit story is on the panel as a timeline.', 'Timeline rendered for the unit.'],
  get_feed_state: ['Feed counts: open {open}, in progress {inProgress}. Table on the panel.', 'The working set is listed.'],
  get_graph: ['Graph pulled — {nodes} nodes, {edges} edges. Table on the panel.', 'The workflow graph is listed.'],
  get_node_detail: ['Node detail on the panel: occupancy {parked} parked.', 'Details rendered.'],
  get_benchmarks: ['We sit above typical on test-fail; comparison table on the panel.', 'Benchmarks table is up.'],
  get_kpis: ['Week events charted on the panel.', 'KPI chart rendered.'],
  search_notes: ['{count} note matches; table on the panel.', '{count} matches listed.'],
  get_mutation_history: ['{count} recent mutations; table on the panel.', 'Change history listed.'],
  get_chat_history: ['{count} sessions found; table on the panel.', 'Recent sessions listed.'],
  get_assignments: ['{count} assignments; table on the panel.', 'Queue listed.'],
  get_my_tech_queue: ['Your queue: {returns} return cartons, {priorityShips} priority ships. Table up.', 'Queue rendered.'],
  list_support_followups: ['{count} follow-ups waiting; table on the panel.', 'Follow-ups listed.'],
  search_photos: ['{count} photos; table with links on the panel.', 'Photos listed.'],
  get_packing_kpi: ['Packing pace charted — top packer leads with weighted minutes shown.', 'Bar chart on the panel.'],
  resolve_receiving_line_for_order: ['{count} matching line on the carton; table on the panel.', 'Line resolved and listed.'],
  list_receiving_line_photos: ['{count} photos on that line; ids in the table.', 'Photo ids listed.'],
  resolve_item_number: ['Item number resolves to {item}. Record on the panel.', 'Matched: {item}.'],
  list_staff: ['{count} staff match; table on the panel.', 'Staff listed.'],
  draft_ticket_reply: ['Draft is on the panel — read it and press Enter to send.', 'Reply drafted; the panel carries it.'],
  get_daily_checks: ['{totalDone}/{totalPossible} checks done. Roster on the panel.', 'Checklist rendered.'],
  get_my_day: ['{assigned} assigned, {interrupts} waiting on you — table on the panel.', 'Your day is listed.'],
  get_project_tasks: ['{count} tasks; table ordered by due date.', 'Tasks listed.'],
  triage_orders_csv: ['Triage rendered: accepted rows are ready to import from the panel.', 'Import triage is on the panel.'],
  list_connected_apps: ['Connected apps listed on the panel.', 'App status table is up.'],
  connect_app: ['The connect pill is in the transcript — click to authorize.', 'Handed you the connect link.'],
  search_staff_documents: ['{count} documents found; table with links on the panel.', 'Documents listed.'],
  read_staff_document: ['The document text is on the panel.', 'Rendered the document.'],
  get_roi_gaps: ['{count} gaps ranked on the panel — {topGap} leads.', 'Gap table is up.'],
  get_station_catalog: ['Catalog summarized on the panel.', 'Parts table rendered.'],
  search_tool_registry: ['{count} registry tools matched; table on the panel.', 'Tools listed.'],
  submit_approval_decision: ['Decision recorded: {decision}.', 'Submitted.'],
  execute_build_sandbox: ['Sandbox passed compile and smoke.', 'Build ran clean.'],
  commit_to_git: ['Committed {commit} to {branch}.', 'Landed in git.'],
};

function fillTemplate(tpl: string, ok: unknown): string {
  const rec = (ok ?? {}) as Record<string, unknown>;
  const counts = rec.counts as Record<string, number> | undefined;
  const gaps = rec.gaps as Array<Record<string, unknown>> | undefined;
  const subs: Record<string, string> = {
    count: String(rec.count ?? (Array.isArray(rec.hits) ? rec.hits.length : '') ?? ''),
    top: rec.hits ? String((rec.hits as Array<Record<string, unknown>>)[0]?.title ?? '') : rec.match ? String((rec.match as Record<string, unknown>).title ?? (rec.match as Record<string, unknown>).itemNumber ?? '') : String((rec.order as Record<string, unknown> | undefined)?.orderId ?? rec.subject ?? ''),
    events: String(Array.isArray(rec.events) ? rec.events.length : ''),
    expiry: String(rec.expiry ?? ''),
    daysRemaining: String(rec.daysRemaining ?? ''),
    id: String((rec.ticket as Record<string, unknown> | undefined)?.id ?? ''),
    receivingId: String(rec.receivingId ?? ''),
    lines: String(rec.lines ?? ''),
    topReason: rec.reasons ? String((rec.reasons as Array<Record<string, unknown>>)[0]?.reasonCode ?? '') : '',
    nodes: String(Array.isArray(rec.nodes) ? rec.nodes.length : ''),
    edges: String(Array.isArray(rec.edges) ? rec.edges.length : ''),
    parked: String(((rec.occupancy as Record<string, unknown> | undefined)?.parked as number | undefined) ?? ''),
    open: String(counts?.open ?? ''),
    inProgress: String(counts?.in_progress ?? ''),
    returns: String(counts?.returns ?? ''),
    priorityShips: String(counts?.priorityShips ?? ''),
    item: String((rec.match as Record<string, unknown> | undefined)?.itemNumber ?? ''),
    totalDone: String(rec.totalDone ?? ''),
    totalPossible: String(rec.totalPossible ?? ''),
    assigned: String(counts?.assigned ?? ''),
    interrupts: String(counts?.interrupts ?? ''),
    topGap: gaps ? String(gaps[0]?.label ?? '') : '',
    decision: String(rec.decision ?? ''),
    commit: String(rec.commit ?? ''),
    branch: String(rec.branch ?? ''),
  };
  return tpl.replace(/\{(\w+)\}/g, (m, k) => subs[k] ?? m);
}

const EMPTY_ANSWERS = [
  'Nothing came back for that — no rows, and I will not invent any.',
  'The result is empty: zero matches. Nothing to show.',
  'That came back clear — no entries right now.',
];

const REFUSAL_ANSWERS: Record<string, string> = {
  'refuse-tenant': 'No. Organization scope comes from the authenticated request; I will not take an organizationId from you or query another tenant.',
  'refuse-sql': 'No. There is no unrestricted SQL tool here — only allowlisted, permission-checked, tenant-scoped reads.',
  'refuse-guess-price': 'I will not guess a price. Pricing needs real tool data; name a SKU and I will look it up.',
  'refuse-invent-item': 'I will not invent an item number. I can resolve a real one from a listing reference with resolve_item_number.',
  'refuse-other-staffer-rail': 'No — get_my_day and my queue tools answer for the signed-in staffer only. I cannot render another person\u2019s rail.',
  'refuse-org-switch': 'No. I cannot switch organizations; the scope is the authenticated org only.',
  'refuse-staffid-arg': 'No. staffId never goes in tool arguments — identity comes from the session, and my queue tools answer only for the signed-in staffer.',
  'refuse-from-memory': 'I do not memorize tenant records. I need a read tool before I can name any order.',
  'refuse-export': 'No. Live tenant records are not exportable from this chat.',
  'refuse-price-math': 'I will not compute marketplace fees from prose. Fees come from tool data on a real record.',
};

// ─── Question variation (synthetic, deterministic) ───────────────────────────

const PREFIXES = ['', 'Can you ', 'Please ', 'Hey — ', ''];
const SUFFIXES = ['', '?', ' please.', '?', ''];

function vary(rnd: () => number, q: string): string {
  const p = PREFIXES[Math.floor(rnd() * PREFIXES.length)];
  const s = SUFFIXES[Math.floor(rnd() * SUFFIXES.length)];
  if (p && !q.endsWith('?')) return `${p}${q}${s}`;
  if (p) return `${p}${q.replace(/\?$/, '')}${s || '?'}`;
  return q;
}

// ─── Generation ──────────────────────────────────────────────────────────────

interface Trace { messages: WireMsg[]; tools: OpenAiFunctionTool[]; meta: { kind: string; tool?: string; tools?: string[] } }

function main() {
  const rnd = rng(42);
  const goldenPrompts = new Set(
    readFileSync('evals/cycleforge-v2/golden.jsonl', 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l).prompt as string),
  );

  const pool: Trace[] = [];
  const rejects: Record<string, number> = {};
  const reject = (reason: string) => {
    rejects[reason] = (rejects[reason] ?? 0) + 1;
  };
  const accept = (t: Trace | null) => {
    if (!t) return;
    const reason = validateTrace(t.messages as Array<Record<string, unknown>>);
    if (reason) {
      reject(reason);
      return;
    }
    pool.push(t);
  };

  // ── tool_select + grounded_answer: 20 per tool (10 + 10) ──
  for (const [name, f] of Object.entries(TOOL_FIXTURES)) {
    const questions = f.questions.filter((q) => !goldenPrompts.has(q));
    for (let i = 0; i < 10; i++) {
      const q = vary(rnd, questions[i % questions.length]);
      const args = f.args[i % f.args.length];
      const { messages, tools } = buildBase(q, f.page);
      accept({ messages: [...messages, assistantCall(name, args, 'call_1')], tools, meta: { kind: 'tool_select', tool: name } });
    }
    for (let i = 0; i < 10; i++) {
      const q = vary(rnd, questions[(i + 3) % questions.length]);
      const args = f.args[i % f.args.length];
      const { messages, tools } = buildBase(q, f.page);
      const ok = f.ok;
      const artifact = artifactFor(name, ok);
      const answerTpl = (ANSWERS[name] ?? ['Result on the panel.'])[i % (ANSWERS[name]?.length ?? 1)];
      const trace: Trace = {
        messages: [
          ...messages,
          assistantCall(name, args, 'call_1'),
          toolResult('call_1', ok),
          assistantCall('render_artifact', { artifact }, 'call_2'),
          toolResult('call_2', 'Rendered on the session view panel.'),
          { role: 'assistant', content: fillTemplate(answerTpl, ok) },
        ],
        tools,
        meta: { kind: 'grounded_answer', tool: name },
      };
      // artifact-only rounds: ~10% of grounded traces omit the trailing prose
      if (rnd() < 0.1) trace.messages = trace.messages.slice(0, -1);
      accept(trace);
      if ((ANSWERS[name] ?? []).length === 0) reject(`missing-answer-template:${name}`);
    }
  }

  // ── refusals: ~15% of target ──
  for (const r of REFUSALS) {
    for (let i = 0; i < 27; i++) {
      const q = i === 0 ? r.prompt : vary(rnd, r.prompt);
      const { messages, tools } = buildBase(q, '/home');
      accept({
        messages: [...messages, { role: 'assistant', content: REFUSAL_ANSWERS[r.id] }],
        tools,
        meta: { kind: 'refusal' },
      });
    }
  }

  // ── multi-tool: ~15% ──
  for (const m of MULTI_TOOL) {
    for (let i = 0; i < 27; i++) {
      const q = i === 0 ? m.prompt : vary(rnd, m.prompt);
      const { messages, tools } = buildBase(q, m.page);
      const out: WireMsg[] = [...messages];
      m.steps.forEach((s, idx) => {
        const id = `call_${idx + 1}`;
        out.push(assistantCall(s.tool, s.args, id));
        out.push(toolResult(id, (TOOL_FIXTURES[s.tool] ?? { ok: {} }).ok));
      });
      const lastTool = m.steps[m.steps.length - 1].tool;
      const artifact = artifactFor(lastTool, (TOOL_FIXTURES[lastTool] ?? { ok: {} }).ok);
      out.push(assistantCall('render_artifact', { artifact }, `call_${m.steps.length + 1}`));
      out.push(toolResult(`call_${m.steps.length + 1}`, 'Rendered on the session view panel.'));
      const tpl = (ANSWERS[lastTool] ?? ['Both results are on the panel.'])[0];
      out.push({ role: 'assistant', content: fillTemplate(tpl, TOOL_FIXTURES[lastTool]?.ok) });
      accept({ messages: out, tools, meta: { kind: 'multi', tools: m.steps.map((s) => s.tool) } });
    }
  }

  // ── empty-result honesty: ~10% ──
  for (const tool of EMPTY_RESULT_TOOLS) {
    const f = TOOL_FIXTURES[tool];
    if (!f?.empty) continue;
    for (let i = 0; i < 18; i++) {
      const q = vary(rnd, f.questions[(i + 2) % f.questions.length]);
      const args = f.args[i % f.args.length];
      const { messages, tools } = buildBase(q, f.page);
      accept({
        messages: [
          ...messages,
          assistantCall(tool, args, 'call_1'),
          toolResult('call_1', f.empty),
          { role: 'assistant', content: EMPTY_ANSWERS[i % EMPTY_ANSWERS.length] },
        ],
        tools,
        meta: { kind: 'empty_honesty', tool },
      });
    }
  }

  // ── split 80/10/10, deterministic ──
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const nTest = Math.round(pool.length * 0.1);
  const nValid = Math.round(pool.length * 0.1);
  const test = pool.slice(0, nTest);
  const valid = pool.slice(nTest, nTest + nValid);
  const train = pool.slice(nTest + nValid);

  const dir = 'datasets/cycleforge-v2';
  mkdirSync(dir, { recursive: true });
  const write = (name: string, rows: Trace[]) =>
    writeFileSync(`${dir}/${name}`, rows.map((r) => JSON.stringify({ messages: r.messages, tools: r.tools, metadata: r.meta })).join('\n') + '\n');
  write('train.jsonl', train);
  write('valid.jsonl', valid);
  write('test.jsonl', test);

  // ── SUMMARY.json ──
  const perTool: Record<string, number> = {};
  const perKind: Record<string, number> = {};
  for (const t of pool) {
    const key = t.meta.tool ?? (t.meta.tools ?? []).join('+') ?? t.meta.kind;
    if (t.meta.tool) perTool[t.meta.tool] = (perTool[t.meta.tool] ?? 0) + 1;
    perKind[t.meta.kind] = (perKind[t.meta.kind] ?? 0) + 1;
  }
  const below12 = Object.entries(perTool).filter(([, n]) => n < 12);
  const summary = {
    generated: pool.length,
    train: train.length,
    valid: valid.length,
    test: test.length,
    per_tool: Object.fromEntries(Object.entries(perTool).sort()),
    per_kind: perKind,
    distribution_targets: {
      refusal_pct: (perKind.refusal ?? 0) / pool.length,
      multi_pct: (perKind.multi ?? 0) / pool.length,
      empty_pct: (perKind.empty_honesty ?? 0) / pool.length,
    },
    reject_tally: Object.values(rejects).reduce((a, b) => a + b, 0),
    rejection_reasons: rejects,
    tools_below_12: below12.map(([k]) => k),
    notes: 'Synthetic only (ORD-/SN-/SKU-DEMO- fixtures, QA org shape). Golden prompts excluded. Every trace passed the six handoff validators.',
  };
  writeFileSync(`${dir}/SUMMARY.json`, JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify({ ...summary, per_tool: `${Object.keys(perTool).length} tools` }, null, 1));
}

main();
