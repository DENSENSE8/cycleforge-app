/**
 * DB-free unit tests for the assistant read-tool registry (plan §3.1).
 * Fake `deps.query` captures every SQL + params; asserts org threading,
 * permission gating, Zod validation, and graceful tool-error surfacing.
 * Search/ticket tools use injectable deps (no SQL).
 *
 * As of 2026-08-22 the registry is no longer read-only: the four tool-forge
 * gateway tools live in the same map, because that map is what MCP's
 * tools/list and tools/call are built from. They are swept by the composition
 * and permission assertions below like everything else, and skipped by the
 * SQL-threading sweep for the same reason the domain adapters are — they reach
 * their own injectable collaborators rather than deps.query. Their behaviour
 * (denial, org handling, fail-closed) is proven in
 * src/lib/tool-forge/gateway-denial.test.ts.
 * Run: npm run test:assistant
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASSISTANT_TOOLS, listAssistantTools, runAssistantTool } from './index';
import type { AssistantToolCtx, AssistantToolDeps } from './types';

const ORG = '11111111-2222-3333-4444-555555555555';

function ctxWith(perms: string[]): AssistantToolCtx {
  return { organizationId: ORG, staffId: 7, permissions: new Set(perms) };
}
const FULL_CTX = ctxWith(['dashboard.view', 'studio.view', 'assistant.chat']);

const SEARCH_TOOL_NAMES = new Set([
  'hybrid_entity_search',
  'exact_id_serial_search',
  'resolve_support_ticket',
]);

/** Domain adapters inject their own deps — skip the SQL-threading sweep. */
const DOMAIN_TOOL_NAMES = new Set([
  'get_operations_journey',
  'get_order_lookup',
  'lookup_serial',
  'lookup_warranty_coverage',
  'list_warranty_claims',
  'get_assignments',
  'get_my_tech_queue',
  'list_support_followups',
  'search_photos',
  'get_receiving_by_tracking',
  'get_ticket_entities',
  'get_packing_kpi',
  // Reach domain query modules (receiving_line / listReceivingPhotos) rather
  // than the injectable tenantQuery dep, same as every entry above.
  'resolve_receiving_line_for_order',
  'list_receiving_line_photos',
  // Pilot session verb: reaches getSupportTicket (injectable) + the org LLM
  // provider — never deps.query, same skip rationale as the entries above.
  'draft_ticket_reply',
  // Order-import triage: reaches the house CSV parser + classifier directly —
  // never deps.query, same skip rationale as the entries above.
  'triage_orders_csv',
  // The three demoted home modes — each wraps an injected domain helper
  // (loadDailyCheckReport / aggregateMyDayFeed / listTasksForInbox), never
  // deps.query, so the SQL sweep has nothing to see.
  'get_daily_checks',
  'get_my_day',
  'get_project_tasks',
]);

/**
 * Tool-forge gateway tools. Skipped by the SQL-threading sweep because they
 * reach toolForgeDedupe / toolForgeDecide / toolForgeValidate / toolForgeHandoff
 * rather than deps.query — the same reason DOMAIN_TOOL_NAMES are skipped. They
 * are NOT skipped by the composition or permission assertions.
 */
const GATEWAY_TOOL_NAMES = new Set([
  'search_tool_registry',
  'submit_approval_decision',
  'execute_build_sandbox',
  'commit_to_git',
]);

const ALLOWED_TOOL_PERMISSIONS = new Set([
  'dashboard.view',
  'studio.view',
  'assistant.chat',
  'operations.view',
  'operations.plans.view',
  'warranty.view',
  'work_orders.view',
  'photos.view',
  'receiving.view',
  // Support pilot verb — mirrors the permission the hands-on support console
  // routes require (mirror-the-UI rule, surfaces/registry.ts header).
  'integrations.zendesk',
  // Tool forge — one permission per gateway tool, deliberately NOT assistant.chat
  // (see the header of src/lib/mcp/tool-server.ts for why that distinction is
  // what keeps a write-capable gateway safe behind a read-scoped route gate).
  'tool_forge.search',
  'tool_forge.decide',
  'tool_forge.build',
  'tool_forge.commit',
]);

interface CapturedQuery {
  orgId: string;
  text: string;
  params: ReadonlyArray<unknown>;
}

function fakes(rowsFor?: (text: string) => Array<Record<string, unknown>>) {
  const cap: CapturedQuery[] = [];
  const deps: AssistantToolDeps = {
    query: async (orgId, text, params = []) => {
      cap.push({ orgId, text, params });
      return { rows: rowsFor ? rowsFor(text) : [] };
    },
    hybridEntitySearch: async (orgId, args) => {
      cap.push({ orgId, text: 'hybridEntitySearch', params: [args.query] });
      return { hits: [], usedSemantic: false };
    },
    exactIdSerialSearch: async (orgId, args) => {
      cap.push({ orgId, text: 'exactIdSerialSearch', params: [args.query] });
      return [];
    },
    resolveSupportTicket: async (orgId, scanValue) => {
      cap.push({ orgId, text: 'resolveSupportTicket', params: [scanValue] });
      return null;
    },
    getSupportTicket: async () => null,
  };
  return { deps, cap };
}

test('registry: 39 tools (35 read + 4 gateway), unique names, model-grade descriptions, valid permissions', () => {
  assert.equal(ASSISTANT_TOOLS.size, 39);
  const expected = [
    'get_signals_by_node', 'get_top_reasons', 'get_unit_journey', 'get_feed_state',
    'get_graph', 'get_node_detail', 'get_benchmarks', 'get_kpis',
    'search_notes', 'get_mutation_history', 'get_chat_history',
    'hybrid_entity_search', 'exact_id_serial_search', 'resolve_support_ticket',
    'get_operations_journey', 'get_order_lookup', 'lookup_serial',
    'lookup_warranty_coverage', 'list_warranty_claims',
    'get_assignments', 'get_my_tech_queue', 'list_support_followups',
    'search_photos', 'get_receiving_by_tracking', 'get_ticket_entities',
    'get_packing_kpi',
    'resolve_receiving_line_for_order', 'list_receiving_line_photos',
    // "Create a rule for this product" on the To-ship desk.
    'resolve_item_number', 'list_staff',
    // Pilot session verb — drafts a support reply; the human sends it.
    'draft_ticket_reply',
    // Order-import triage — parses a pasted CSV through the house import lane.
    'triage_orders_csv',
    // Home page is the assistant: the old `daily` / `today` / `tasks` modes.
    'get_daily_checks', 'get_my_day', 'get_project_tasks',
    // The tool-forge gateway — exactly four, per the pipeline spec.
    'search_tool_registry', 'submit_approval_decision',
    'execute_build_sandbox', 'commit_to_git',
  ];
  assert.deepEqual([...ASSISTANT_TOOLS.keys()].sort(), [...expected].sort());
  for (const t of ASSISTANT_TOOLS.values()) {
    assert.ok(t.description.length > 60, `${t.name} needs a real model-facing description`);
    assert.ok(
      ALLOWED_TOOL_PERMISSIONS.has(t.permission),
      `${t.name} unexpected permission ${t.permission}`,
    );
  }
});

test('every SQL tool threads ctx.organizationId as $1 into every query (never model input)', async () => {
  const inputs: Record<string, unknown> = {
    get_unit_journey: { serialUnitId: 5 },
    get_node_detail: { nodeId: 'n-abc' },
    search_notes: { query: 'no audio' },
    get_feed_state: { feedKey: 'receiving_triage' },
    resolve_item_number: { reference: 'Bose Wave Music System III' },
    list_staff: { nameLike: 'Tu' },
  };
  for (const name of ASSISTANT_TOOLS.keys()) {
    if (SEARCH_TOOL_NAMES.has(name) || DOMAIN_TOOL_NAMES.has(name) || GATEWAY_TOOL_NAMES.has(name)) continue;
    const { deps, cap } = fakes((text) =>
      // give resolveDefinition/get_unit_journey a row so dependent queries run
      text.includes('FROM workflow_definitions') || text.includes('FROM serial_units')
        ? [{ id: 3, name: 'Ops', version: 2, is_active: true }]
        : [],
    );
    const out = await runAssistantTool(name, inputs[name] ?? {}, FULL_CTX, deps);
    assert.equal(out.ok, true, `${name}: ${JSON.stringify(out)}`);
    assert.ok(cap.length > 0, `${name} ran no query`);
    for (const q of cap) {
      assert.equal(q.orgId, ORG, `${name} query used wrong org`);
      // graph-table queries scope via the pre-verified definition id instead
      const graphScoped = q.text.includes('FROM workflow_nodes') || q.text.includes('FROM workflow_edges');
      if (!graphScoped) {
        assert.equal(q.params[0], ORG, `${name} did not lead params with orgId: ${q.text}`);
      }
      // Regression: inventory_events has occurred_at, NOT created_at — the
      // phantom column shipped once and passed the fakes (skeptic finding).
      if (q.text.includes('FROM inventory_events')) {
        assert.ok(!q.text.includes('created_at'), `${name} references phantom inventory_events.created_at`);
        assert.ok(q.text.includes('occurred_at'), `${name} must use inventory_events.occurred_at`);
      }
    }
  }
});

test('search tools thread orgId into injected deps (no SQL)', async () => {
  const { deps, cap } = fakes();
  const hybrid = await runAssistantTool(
    'hybrid_entity_search',
    { query: 'order 12345' },
    FULL_CTX,
    deps,
  );
  assert.equal(hybrid.ok, true);
  assert.equal(cap[0]?.orgId, ORG);
  assert.equal(cap[0]?.text, 'hybridEntitySearch');

  cap.length = 0;
  const exact = await runAssistantTool(
    'exact_id_serial_search',
    { query: 'ABC123' },
    FULL_CTX,
    deps,
  );
  assert.equal(exact.ok, true);
  assert.equal(cap[0]?.orgId, ORG);

  cap.length = 0;
  const ticket = await runAssistantTool(
    'resolve_support_ticket',
    { scanValue: '#4821' },
    FULL_CTX,
    deps,
  );
  assert.equal(ticket.ok, true);
  assert.deepEqual(ticket.ok ? ticket.data : null, { found: false, scanValue: '#4821' });
  assert.equal(cap[0]?.orgId, ORG);
  assert.equal(cap[0]?.params[0], '#4821');
});

test('resolve_support_ticket: found path returns receiving href', async () => {
  const deps: AssistantToolDeps = {
    query: async () => ({ rows: [] }),
    resolveSupportTicket: async () => ({
      receivingId: 99,
      lineId: 7,
      supportTicketId: 4821,
    }),
    getSupportTicket: async () => ({
      id: 4821,
      provider: 'zendesk',
      externalTicketId: '9395',
      subjectCache: 'Damaged carton',
      statusCache: 'open',
    }),
  };
  const out = await runAssistantTool(
    'resolve_support_ticket',
    { scanValue: '4821' },
    FULL_CTX,
    deps,
  );
  assert.equal(out.ok, true);
  if (!out.ok) return;
  const data = out.data as {
    found: boolean;
    href: string;
    receivingId: number;
    label: string;
  };
  assert.equal(data.found, true);
  assert.equal(data.receivingId, 99);
  assert.equal(data.label, '#4821');
  assert.equal(data.href, '/search?sel=receiving:99');
});

test('permission gating: studio tools refused without studio.view; search needs assistant.chat', async () => {
  const viewer = ctxWith(['dashboard.view']);
  const { deps, cap } = fakes();
  const out = await runAssistantTool('get_graph', {}, viewer, deps);
  assert.deepEqual(out, { ok: false, code: 'forbidden', error: 'Missing permission studio.view for get_graph' });
  assert.equal(cap.length, 0);
  const names = listAssistantTools(viewer).map((t) => t.name);
  assert.ok(!names.includes('get_graph') && !names.includes('get_node_detail'));
  assert.ok(!names.includes('hybrid_entity_search'));
  assert.ok(!names.includes('get_operations_journey'));
  assert.ok(!names.includes('lookup_warranty_coverage'));
  // dashboard.view core (9) + order/serial/queue domain tools (4)
  // + the To-ship item-rule reads (resolve_item_number, list_staff) (2)
  // + the two home reads a viewer owns (get_daily_checks, get_my_day) (2).
  // get_project_tasks is NOT here — it rides operations.plans.view.
  assert.equal(names.length, 17);
  assert.ok(names.includes('get_daily_checks'));
  assert.ok(names.includes('get_my_day'));
  assert.ok(!names.includes('get_project_tasks'));
  assert.ok(names.includes('resolve_item_number'));
  assert.ok(names.includes('list_staff'));
  assert.ok(names.includes('get_order_lookup'));
  assert.ok(names.includes('lookup_serial'));
  assert.ok(names.includes('get_my_tech_queue'));
  assert.ok(names.includes('list_support_followups'));

  const searchDenied = await runAssistantTool(
    'hybrid_entity_search',
    { query: 'x' },
    viewer,
    deps,
  );
  assert.equal(searchDenied.ok, false);
  assert.equal((searchDenied as { code: string }).code, 'forbidden');
});

test('unknown tool and invalid input are typed failures, no queries run', async () => {
  const { deps, cap } = fakes();
  const unknown = await runAssistantTool('drop_tables', {}, FULL_CTX, deps);
  assert.equal(unknown.ok, false);
  assert.equal((unknown as { code: string }).code, 'unknown_tool');

  const invalid = await runAssistantTool('get_top_reasons', { rangeDays: -5 }, FULL_CTX, deps);
  assert.equal(invalid.ok, false);
  assert.equal((invalid as { code: string }).code, 'invalid_input');

  const missingLookup = await runAssistantTool('get_unit_journey', {}, FULL_CTX, deps);
  assert.equal(missingLookup.ok, false);
  assert.equal((missingLookup as { code: string }).code, 'invalid_input');

  assert.equal(cap.length, 0);
});

test('a throwing query surfaces as tool_error (never rejects)', async () => {
  const deps: AssistantToolDeps = {
    query: async () => {
      throw new Error('relation does not exist');
    },
  };
  const out = await runAssistantTool('get_kpis', {}, FULL_CTX, deps);
  assert.deepEqual(out, {
    ok: false,
    code: 'tool_error',
    error: 'get_kpis failed: relation does not exist',
  });
});

test('get_unit_journey: serial is normalized before lookup; not-found short-circuits', async () => {
  const { deps, cap } = fakes(() => []);
  const out = await runAssistantTool('get_unit_journey', { serial: ' ab-12 cd ' }, FULL_CTX, deps);
  assert.deepEqual(out, { ok: true, data: { found: false } });
  assert.equal(cap.length, 1); // events/engine/signals queries never ran
  assert.equal(cap[0].params[2], 'AB12CD');
});

test('get_feed_state: exclusions anti-join only when staffId + station given', async () => {
  const { deps, cap } = fakes();
  await runAssistantTool('get_feed_state', { feedKey: 'receiving_triage', staffId: 4, station: 'RECEIVING' }, FULL_CTX, deps);
  assert.ok(cap[0].text.includes('staff_rail_exclusions'));
  assert.deepEqual(cap[0].params.slice(3), [4, 'RECEIVING']);

  cap.length = 0;
  await runAssistantTool('get_feed_state', { feedKey: 'receiving_triage' }, FULL_CTX, deps);
  assert.ok(!cap[0].text.includes('staff_rail_exclusions'));
});

test('get_benchmarks: reads global (NULL-org) + own rows — the one sanctioned org-predicate variation', async () => {
  const { deps, cap } = fakes();
  await runAssistantTool('get_benchmarks', {}, FULL_CTX, deps);
  assert.ok(cap[0].text.includes('organization_id = $1 OR organization_id IS NULL'));
});

/**
 * The three demoted home modes (`daily` / `today` / `tasks`). Home is now the
 * assistant, so these are the reads behind "did the team run their checks",
 * "what's on my day", "what are my project tasks" — and the model SHOWS the
 * rows with render_artifact. Two properties matter enough to pin:
 *
 *   1. Identity comes from the SESSION. orgId and staffId are threaded into the
 *      injected domain helper; nothing in the model's input can widen either.
 *   2. Every returned cell is a scalar. A table artifact has nowhere to put a
 *      Date, a nested `source` union, or a numeric-string from pg.
 */
const HOME_CTX: AssistantToolCtx = {
  organizationId: ORG,
  staffId: 7,
  permissions: new Set(['dashboard.view', 'operations.plans.view', 'work_orders.view']),
};

const SCALAR = new Set(['string', 'number', 'boolean']);

function assertScalarCells(rows: ReadonlyArray<Record<string, unknown>>, label: string) {
  assert.ok(rows.length > 0, `${label}: no rows to check`);
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      assert.ok(
        value === null || SCALAR.has(typeof value),
        `${label}.${key} is not string|number|boolean|null: ${typeof value}`,
      );
    }
  }
}

function homeDeps(extra: Record<string, unknown>): AssistantToolDeps {
  return { query: async () => ({ rows: [] }), ...extra } as AssistantToolDeps;
}

test('get_daily_checks: session org + viewer staff id reach the report; date defaults to the PST civil day', async () => {
  const seen: Array<{ orgId: string; dateKey: string; viewerStaffId: number | null }> = [];
  const deps = homeDeps({
    dailyChecks: {
      todayKey: () => '2026-09-05',
      loadReport: async (args: { orgId: string; dateKey: string; viewerStaffId: number | null }) => {
        seen.push(args);
        return {
          dateKey: args.dateKey,
          items: [{ id: 3, title: 'Sweep the pack bench', sortOrder: 1 }],
          staff: [
            { staffId: 7, name: 'Tuan', doneItemIds: [3], doneCount: 1, total: 1, lastMarkedAt: '2026-09-05T16:00:00.000Z' },
            { staffId: 9, name: 'Thuy', doneItemIds: [], doneCount: 0, total: 1, lastMarkedAt: null },
          ],
          mine: { staffId: 7, name: 'Tuan', doneItemIds: [3], doneCount: 1, total: 1, lastMarkedAt: '2026-09-05T16:00:00.000Z' },
          totalDone: 1,
          totalPossible: 2,
        };
      },
    },
  });

  const out = await runAssistantTool('get_daily_checks', {}, HOME_CTX, deps);
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.deepEqual(seen, [{ orgId: ORG, dateKey: '2026-09-05', viewerStaffId: 7 }]);

  const data = (out.ok ? out.data : {}) as {
    dateKey: string;
    totalDone: number;
    totalPossible: number;
    items: Array<Record<string, unknown>>;
    mine: Record<string, unknown>;
    staff: Array<Record<string, unknown>>;
  };
  assert.deepEqual(Object.keys(data), [
    'dateKey', 'totalDone', 'totalPossible', 'items', 'mine', 'staff',
  ]);
  // The staffer who checked NOTHING is exactly who the report is read to find.
  assert.deepEqual(data.staff[1], { name: 'Thuy', doneCount: 0, total: 1, lastMarkedAt: null });
  assertScalarCells(data.staff, 'get_daily_checks.staff');
  assertScalarCells(data.items, 'get_daily_checks.items');
  assertScalarCells([data.mine], 'get_daily_checks.mine');

  // An explicit day wins over "today" — a lead can read a past report.
  seen.length = 0;
  await runAssistantTool('get_daily_checks', { date: '2026-08-01' }, HOME_CTX, deps);
  assert.equal(seen[0]?.dateKey, '2026-08-01');
});

test('get_my_day: org + staff id + permission set reach the aggregator; rows come back flat', async () => {
  const seen: Array<{ organizationId: string; staffId: number; permissions: Set<string> }> = [];
  const workOrder = {
    id: 'REPAIR:3',
    title: 'Test the amplifier',
    subtitle: 'Bench',
    queueLabel: 'Testing',
    recordLabel: null,
    orderId: '112-33',
    status: 'pending',
    deadlineAt: '2026-09-05T18:00:00.000Z',
    updatedAt: null,
    assignedAt: null,
  };
  const deps = homeDeps({
    myDay: {
      aggregate: async (args: { organizationId: string; staffId: number; permissions: Set<string> }) => {
        seen.push(args);
        return {
          doNext: workOrder,
          assigned: [workOrder],
          interrupts: [],
          queueCards: [{ key: 'orders', label: 'To ship', count: 4, href: '/orders', permission: 'dashboard.view' }],
          counts: { assigned: 1, interrupts: 0, unassigned: 0 },
        };
      },
    },
  });

  const out = await runAssistantTool('get_my_day', {}, HOME_CTX, deps);
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(seen[0]?.organizationId, ORG);
  assert.equal(seen[0]?.staffId, 7);
  assert.ok(seen[0]?.permissions.has('work_orders.view'), 'permission set must be threaded through');

  const data = (out.ok ? out.data : {}) as {
    counts: Record<string, number>;
    tasks: Array<Record<string, unknown>>;
    queueCards: Array<Record<string, unknown>>;
  };
  assert.deepEqual(Object.keys(data), ['counts', 'tasks', 'queueCards']);
  // doNext is a POINTER into assigned — the shared flattener dedupes it.
  assert.equal(data.tasks.length, 1);
  assert.equal(data.tasks[0].lane, 'do_next');
  assert.deepEqual(Object.keys(data.tasks[0]), [
    'id', 'lane', 'title', 'subtitle', 'queueLabel', 'recordLabel', 'status', 'deadlineAt',
  ]);
  assertScalarCells(data.tasks, 'get_my_day.tasks');
  assert.deepEqual(data.queueCards, [{ label: 'To ship', count: 4 }]);
});

test('get_my_day: a session with no staff identity reports it instead of throwing', async () => {
  let called = false;
  const deps = homeDeps({
    myDay: {
      aggregate: async () => {
        called = true;
        throw new Error('must not run without a staff identity');
      },
    },
  });
  const out = await runAssistantTool(
    'get_my_day',
    {},
    { organizationId: ORG, staffId: null, permissions: HOME_CTX.permissions },
    deps,
  );
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.deepEqual(out.ok ? out.data : null, {
    error: 'no staff identity on this session',
    counts: { assigned: 0, interrupts: 0, unassigned: 0 },
    tasks: [],
    queueCards: [],
  });
  assert.equal(called, false);
});

test('get_project_tasks: scope defaults to the session staffer; `all` clears it, never a model-named id', async () => {
  const seen: Array<{ orgId: string; filters: Record<string, unknown> }> = [];
  const deps = homeDeps({
    projectTasks: {
      listTasks: async (orgId: string, filters: Record<string, unknown>) => {
        seen.push({ orgId, filters });
        return [
          {
            id: 'task-1', phaseId: 'ph-1', planId: 'pl-1', planTitle: 'Receiving overhaul',
            station: 'RECEIVING', title: 'Label the bins', assigneeStaffId: 7, assigneeName: 'Tuan',
            status: 'open', dueAt: '2026-09-06T00:00:00.000Z', startedAt: null, completedAt: null,
            completedByStaffId: null, notes: null, sortOrder: 1,
            createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
          },
        ];
      },
    },
  });

  const mine = await runAssistantTool('get_project_tasks', {}, HOME_CTX, deps);
  assert.equal(mine.ok, true, JSON.stringify(mine));
  assert.equal(seen[0].orgId, ORG);
  assert.deepEqual(seen[0].filters, { planId: null, staffId: 7, status: 'open' });

  const data = (mine.ok ? mine.data : {}) as { tasks: Array<Record<string, unknown>> };
  assert.deepEqual(Object.keys(data), ['tasks']);
  assert.deepEqual(Object.keys(data.tasks[0]), [
    'id', 'title', 'status', 'station', 'planTitle', 'assigneeName', 'dueAt',
  ]);
  assertScalarCells(data.tasks, 'get_project_tasks.tasks');

  seen.length = 0;
  await runAssistantTool(
    'get_project_tasks',
    { scope: 'all', status: 'done', planId: 'pl-9' },
    HOME_CTX,
    deps,
  );
  assert.deepEqual(seen[0].filters, { planId: 'pl-9', staffId: null, status: 'done' });
});

test('get_project_tasks: needs operations.plans.view — dashboard.view alone is refused', async () => {
  const out = await runAssistantTool(
    'get_project_tasks',
    {},
    ctxWith(['dashboard.view']),
    homeDeps({ projectTasks: { listTasks: async () => [] } }),
  );
  assert.deepEqual(out, {
    ok: false,
    code: 'forbidden',
    error: 'Missing permission operations.plans.view for get_project_tasks',
  });
});
