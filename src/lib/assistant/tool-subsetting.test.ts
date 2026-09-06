/**
 * Deterministic tool-advertisement subsetting for self-hosted runtimes
 * (train handoff §3). The same selection shapes production prompts, eval
 * goldens and the training set — these tests pin the contract all three
 * depend on: always-on core, alias routing, UI keyword gating, cap math,
 * and byte-for-byte determinism.
 * Run: npm run test:assistant
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SELF_HOSTED_TOOL_CAP_DEFAULT,
  subsetAdvertisedTools,
  type ToolSubsetQueryContext,
} from './tool-subsetting';
import type { OpenAiFunctionTool } from '@/lib/assistant/tools/openai-schema';

const mk = (name: string, description = `demo ${name.replace(/_/g, ' ')} tool`): OpenAiFunctionTool => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties: {} } },
});

const FULL = [
  'hybrid_entity_search',
  'exact_id_serial_search',
  'get_kpis',
  'get_top_reasons',
  'lookup_serial',
  'lookup_warranty_coverage',
  'list_warranty_claims',
  'get_packing_kpi',
  'search_photos',
  'get_graph',
  'get_roi_gaps',
  'render_artifact',
  'navigate',
  'highlight',
  'print_handling_unit_labels',
  'request_connection',
  'propose_mutation',
  'revert_mutation',
].map(mk);

test('zero-signal turn still advertises the core: finders, render_artifact, write chokepoint', () => {
  const r = subsetAdvertisedTools('hello', null, FULL);
  assert.deepEqual(r.mandatoryNames.sort(), ['exact_id_serial_search', 'hybrid_entity_search', 'propose_mutation', 'render_artifact']);
  assert.deepEqual(r.rankedNames, []);
  assert.equal(r.tools.length, 4);
});

test('a warranty question ranks the warranty verbs and keeps the core', () => {
  const r = subsetAdvertisedTools('is serial SN-9012 under warranty and are there open claims?', null, FULL);
  assert.ok(r.rankedNames.includes('lookup_warranty_coverage'));
  assert.ok(r.rankedNames.includes('list_warranty_claims'));
  const names = r.tools.map((t) => t.function.name);
  assert.ok(names.includes('hybrid_entity_search'));
  assert.ok(!names.includes('get_graph'), 'unrelated verbs stay off the wire');
});

test('UI verbs ride on their triggers only', () => {
  const withPrint = subsetAdvertisedTools('print labels for these handling units', null, FULL);
  assert.ok(withPrint.rankedNames.includes('print_handling_unit_labels'));

  const withNav = subsetAdvertisedTools('open the shipping desk', null, FULL);
  assert.ok(withNav.rankedNames.includes('navigate'));

  const plain = subsetAdvertisedTools('what are the top return reasons', null, FULL);
  const names = plain.tools.map((t) => t.function.name);
  assert.ok(!names.includes('print_handling_unit_labels'));
  assert.ok(!names.includes('navigate'));
  assert.ok(!names.includes('highlight'));
});

test('cap bounds the advertisement; score-0 verbs never waste slots', () => {
  const many = ['get_kpis', 'get_top_reasons', 'lookup_serial', 'lookup_warranty_coverage', 'list_warranty_claims', 'get_packing_kpi', 'search_photos', 'get_graph', 'get_roi_gaps'].map(mk);
  const all = [...FULL.slice(0, 2), ...FULL.slice(10), ...many];
  // "warranty" fires exactly two aliases; the rest stay score-0.
  const r = subsetAdvertisedTools('warranty', null, all, 6);
  assert.equal(r.tools.length, 4 + 2, 'core (4) + the two matched verbs = 6 = cap');
  assert.ok(r.tools.length <= SELF_HOSTED_TOOL_CAP_DEFAULT + 0);
});

test('page context contributes routing signal', () => {
  const r = subsetAdvertisedTools('what is the state here', { page: '/analytics', mode: 'kpis' }, FULL);
  assert.ok(r.rankedNames.includes('get_kpis'), 'mode "kpis" routes without naming the tool');
});

test('identical inputs produce identical advertisements, byte for byte', () => {
  const ctx: ToolSubsetQueryContext = { page: '/warranty' };
  const a = subsetAdvertisedTools('open warranty claims', ctx, FULL);
  const b = subsetAdvertisedTools('open warranty claims', ctx, FULL);
  assert.equal(JSON.stringify(a.tools), JSON.stringify(b.tools));
});

test('ties break alphabetically so the wire is stable', () => {
  const tools = [mk('zzz_tool', 'alpha beta'), mk('aaa_tool', 'alpha beta')];
  const r = subsetAdvertisedTools('alpha beta', null, tools, 10);
  assert.deepEqual(r.rankedNames, ['aaa_tool', 'zzz_tool']);
});
