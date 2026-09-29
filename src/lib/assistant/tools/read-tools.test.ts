/** DB-free unit tests for the assistant read-tool registry (plan §3.1). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASSISTANT_TOOLS, listAssistantTools, runAssistantTool } from './index';
import { splitToolArtifact } from '@/lib/assistant/tool-artifact';
import type { AssistantToolCtx, AssistantToolDeps } from './types';

const ORG = '11111111-2222-3333-4444-555555555555';

function ctxWith(perms: string[]): AssistantToolCtx {
  return { organizationId: ORG, staffId: 7, permissions: new Set(perms) };
}
const FULL_CTX = ctxWith(['dashboard.view', 'studio.view', 'assistant.chat', 'sku_stock.view', 'orders.view', 'receiving.view', 'packing.complete_order', 'shipping.buy_label']);

const SEARCH_TOOL_NAMES = new Set([
  'find_records',
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
  // ChatReads: each folds existing domain reads (reconcile Check + identify,
  // customer book search, desk lists, packing / pomodoro / goals, shipments).
  'reconcile_refs',
  'get_customer',
  'get_worklist',
  'get_staff_report',
  'get_tracking_status',
  // SIMPLE-FIRST: reads through the capability store (org-scoped tenantQuery).
  'list_capabilities',
]);

/** Tool-forge gateway tools. */
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
  'warranty.view',
  'work_orders.view',
  'photos.view',
  'receiving.view',
  'sku_stock.view',
  'orders.view',
  // Device tool (print_order_paperwork): the same permission the station's print route checks.
  'packing.complete_order',
  // quote_label_rates: the same permission the desk's order-rates route checks.
  'shipping.buy_label',
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
    findRecords: async (input) => {
      cap.push({ orgId: input.orgId, text: `findRecords:${input.surface}`, params: [input.query] });
      return { payload: { rows: [], relaxed: false, effectiveQuery: input.query } };
    },
    resolveSupportTicket: async (orgId, scanValue) => {
      cap.push({ orgId, text: 'resolveSupportTicket', params: [scanValue] });
      return null;
    },
    getSupportTicket: async () => null,
  };
  return { deps, cap };
}

test('registry: 44 tools (39 read + 1 device + 4 gateway), unique names, model-grade descriptions, valid permissions', () => {
  assert.equal(ASSISTANT_TOOLS.size, 44);
  const expected = [
    'get_signals_by_node', 'get_top_reasons', 'get_unit_journey', 'get_feed_state',
    'get_graph', 'get_node_detail', 'get_benchmarks', 'get_kpis',
    'search_notes', 'get_mutation_history', 'get_chat_history',
    'find_records', 'resolve_support_ticket',
    'get_operations_journey', 'get_order_lookup', 'lookup_serial',
    'lookup_warranty_coverage', 'list_warranty_claims',
    'get_assignments', 'get_my_tech_queue', 'list_support_followups',
    'search_photos', 'get_receiving_by_tracking', 'get_ticket_entities',
    'get_packing_kpi',
    'resolve_receiving_line_for_order', 'list_receiving_line_photos',
    'locate_product', 'list_location_contents', 'get_order_documents',
    'draft_manual_order',
    'draft_po_import',
    'reconcile_refs', 'get_customer', 'get_worklist', 'get_staff_report', 'get_tracking_status',
    'quote_label_rates', 'list_capabilities',
    // Device tool: resolves a print the operator's browser sends to their station.
    'print_order_paperwork',
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
    locate_product: { query: '00066-P-2' },
    list_location_contents: { location: 'C-03-12-3' },
    get_order_documents: { order: '5083' },
    draft_manual_order: { customerName: 'Jane Doe', phone: '555-123-4567', items: [{ product: 'Bose 151 bracket' }] },
    draft_po_import: { poNumber: 'PO-1', vendor: 'Acme', items: [{ product: 'A-1', quantity: 2 }], trackingNumbers: ['1Z999AA10123456784'] },
    print_order_paperwork: { orders: ['5083'] },
    quote_label_rates: { order: '5083' },
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
  // The finder serves through the Search page's door, logged as the assistant.
  const found = await runAssistantTool('find_records', { query: 'order 12345' }, FULL_CTX, deps);
  assert.equal(found.ok, true);
  assert.equal(cap[0]?.orgId, ORG);
  assert.equal(cap[0]?.text, 'findRecords:assistant');
  assert.equal(found.ok && (found.data as { found: boolean }).found, false);

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
  assert.ok(!names.includes('find_records'));
  assert.ok(!names.includes('get_operations_journey'));
  assert.ok(!names.includes('lookup_warranty_coverage'));
  // dashboard.view core (9) + order/serial/queue domain tools (4)
  assert.equal(names.length, 13);
  assert.ok(names.includes('get_order_lookup'));
  assert.ok(names.includes('lookup_serial'));
  assert.ok(names.includes('get_my_tech_queue'));
  assert.ok(names.includes('list_support_followups'));

  const searchDenied = await runAssistantTool(
    'find_records',
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

test('get_unit_journey renders the Receiving projection and truthful pickup/ticket links', async () => {
  const { deps } = fakes((text) => {
    if (text.includes('FROM serial_units')) {
      return [{ id: 5, serial_number: 'SN-5', sku: 'BOSE-5', current_status: 'IN_TEST' }];
    }
    if (text.includes('FROM receiving_unit_stage_facts')) {
      return [{
        receiving_line_id: 21,
        receiving_id: 8,
        unit_uid: 'U-0005',
        triage_state: 'TRIAGED',
        label_state: 'PRINTED',
        qc_state: 'FAILED',
        tested_at: '2026-09-29T12:00:00.000Z',
        primary_support_ticket_id: 42,
        pickup_order_id: 9,
        pickup_identity: 'LCPU-TAN-092926',
        ticket_provider: 'zendesk',
        external_ticket_id: '9395',
        ticket_subject: 'No audio',
        ticket_status: 'open',
      }];
    }
    return [];
  });
  const out = await runAssistantTool('get_unit_journey', { serialUnitId: 5 }, FULL_CTX, deps);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  const carried = splitToolArtifact(out.data);
  assert.ok(carried);
  assert.equal(carried.artifact.kind, 'record');
  assert.equal(carried.artifact.path, '/pickup?lcpu=9');
  if (carried.artifact.kind !== 'record') return;
  assert.deepEqual(
    carried.artifact.fields.find((field) => field.label === 'Ticket'),
    { label: 'Ticket', value: '#42 · open · No audio', href: '/support?ticket=9395' },
  );
  assert.match(carried.modelData.summary, /QC failed · label printed · ticket #42/);
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
