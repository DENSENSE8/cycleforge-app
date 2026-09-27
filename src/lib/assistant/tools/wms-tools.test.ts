/**
 * DB-free tests for the WMS location tools: identifier classification and the
 * server-carried artifact (bins go to the screen AND into the model summary).
 * Run: npx tsx --test src/lib/assistant/tools/wms-tools.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAssistantTool } from './index';
import { classifyLocateQuery } from './wms-tools';
import { splitToolArtifact } from '@/lib/assistant/tool-artifact';
import type { AssistantToolCtx, AssistantToolDeps } from './types';

const ORG = '11111111-2222-3333-4444-555555555555';
const ctx: AssistantToolCtx = { organizationId: ORG, staffId: 7, permissions: new Set(['sku_stock.view']) };

test('classifyLocateQuery strips the label word the model or operator typed', () => {
  assert.deepEqual(classifyLocateQuery('SKU 00066-P-2'), { value: '00066-P-2', route: 'identifier' });
  assert.deepEqual(classifyLocateQuery('sku: 00066-P-2?'), { value: '00066-P-2', route: 'identifier' });
  assert.deepEqual(classifyLocateQuery('"fnsku x002mly7r3"'), { value: 'X002MLY7R3', route: 'identifier' });
  // A value that merely starts with a label word is not stripped.
  assert.deepEqual(classifyLocateQuery('BIN-0042'), { value: 'BIN-0042', route: 'identifier' });
});

test('classifyLocateQuery routes LPNs, names and explicit kinds', () => {
  assert.deepEqual(classifyLocateQuery('h-1204'), { value: 'H-1204', route: 'lpn' });
  assert.deepEqual(classifyLocateQuery('Bose Wave radio'), { value: 'Bose Wave radio', route: 'title' });
  assert.deepEqual(classifyLocateQuery('b00007aj8b'), { value: 'B00007AJ8B', route: 'identifier' });
  assert.deepEqual(classifyLocateQuery('SN12 AB', 'serial'), { value: 'SN12 AB', route: 'serial' });
  // A multi-token identifier without words stays an identifier.
  assert.equal(classifyLocateQuery('00066 P 2').route, 'identifier');
});

function scripted(byMarker: Array<[RegExp, Array<Record<string, unknown>>]>) {
  const calls: Array<{ orgId: string; text: string; params: ReadonlyArray<unknown> }> = [];
  const deps: AssistantToolDeps = {
    query: async (orgId, text, params = []) => {
      calls.push({ orgId, text, params });
      const hit = byMarker.find(([re]) => re.test(text));
      return { rows: hit ? hit[1] : [] };
    },
  };
  return { deps, calls };
}

test('locate_product: stocked SKU → table with a product header, bins and qty in the model summary', async () => {
  const { deps, calls } = scripted([
    [/WITH q AS/, [
      { sku: '00066-P-2', via: 'sku', catalog_id: 812, zoho_item_title: 'Bose Wave III Remote', catalog_product_title: 'marketplace title', fnsku: 'X00ABC1234', location_id: 338, location: 'C-03-12-3', room: 'Zone 3', qty: 41 },
      { sku: '00066-P-2', via: 'sku', zoho_item_title: 'Bose Wave III Remote', fnsku: 'X00ABC1234', location_id: 402, location: 'C-03-16-3', room: 'Zone 3', qty: 1 },
    ]],
  ]);
  const res = await runAssistantTool('locate_product', { query: 'SKU 00066-P-2' }, ctx, deps);
  assert.equal(res.ok, true);
  const carried = splitToolArtifact(res.ok ? res.data : null);
  assert.ok(carried, 'the location table rides to the screen without render_artifact');
  assert.equal(carried.tool, 'locate_product');
  assert.equal(carried.artifact.kind, 'table');
  assert.equal(carried.artifact.kind === 'table' && carried.artifact.rows.length, 2);
  // One SKU: it and its title (the Zoho item governs the marketplace title) head the table; rows are bins.
  assert.equal(carried.artifact.title, 'Where is 00066-P-2 · Bose Wave III Remote');
  assert.deepEqual(carried.artifact.kind === 'table' && carried.artifact.columns, ['Bin', 'Room', 'Qty']);
  // The chat's header comes from the tool's data: the identity title, the ids
  // the operator copies, and the product's record on /search.
  assert.deepEqual(carried.artifact.kind === 'table' && carried.artifact.identity, {
    title: 'Bose Wave III Remote',
    ids: [
      { label: 'SKU', value: '00066-P-2' },
      { label: 'FNSKU', value: 'X00ABC1234' },
      { label: 'Bin', value: 'C-03-12-3' },
      { label: 'Bin', value: 'C-03-16-3' },
    ],
    href: '/search?sel=sku:812',
  });
  assert.doesNotMatch(carried.modelData.summary, /panel/i);
  assert.match(carried.modelData.summary, /42 units in 2 bins/);
  assert.match(carried.modelData.summary, /C-03-12-3: 41, C-03-16-3: 1/);
  // Cleaned value bound; org is always the first parameter and the ctx org.
  assert.deepEqual(calls[0].params.slice(0, 2), [ORG, '00066-P-2']);
});

test('locate_product: identifier known but no stock → the product card, zero stated, no bin invented', async () => {
  const { deps } = scripted([
    [/WITH q AS/, [{ sku: '8K-PJTL-U9GG', via: 'fnsku', catalog_id: 77, listing_title: 'Bose 151 pair', fnsku: 'X002MLY7R3', location: null, qty: null }]],
  ]);
  const res = await runAssistantTool('locate_product', { query: 'X002MLY7R3' }, ctx, deps);
  assert.equal(res.ok, true);
  const carried = splitToolArtifact(res.ok ? res.data : null);
  assert.ok(carried);
  assert.equal(carried.artifact.kind, 'record');
  assert.deepEqual(carried.artifact.kind === 'record' && carried.artifact.identity, {
    title: 'Bose 151 pair',
    ids: [
      { label: 'SKU', value: '8K-PJTL-U9GG' },
      { label: 'FNSKU', value: 'X002MLY7R3' },
    ],
    href: '/search?sel=sku:77',
  });
  assert.match(carried.modelData.summary, /FNSKU X002MLY7R3 belongs to SKU 8K-PJTL-U9GG/);
  assert.match(carried.modelData.summary, /0 units on hand/);
});

test('locate_product: unknown value → tries serial, then found=false naming what was searched', async () => {
  const { deps, calls } = scripted([]);
  const res = await runAssistantTool('locate_product', { query: 'ZZ-NOPE-000' }, ctx, deps);
  assert.equal(res.ok, true);
  const data = res.ok ? (res.data as { found: boolean; searched: string[] }) : null;
  assert.equal(splitToolArtifact(data), null);
  assert.equal(data?.found, false);
  assert.ok(data?.searched.includes('FNSKU') && data.searched.includes('serial number'));
  assert.equal(calls.length, 2, 'identifier statement, then the serial fallback');
  assert.match(calls[1].text, /FROM serial_units su/);
});

test('list_location_contents: two locations match → ambiguity, never a guess', async () => {
  const { deps } = scripted([
    [/FROM locations l\s+WHERE/, [{ id: 1, name: 'A1', location: 'A1', barcode: 'X1' }, { id: 2, name: 'A1b', location: 'A1', barcode: 'X2' }]],
  ]);
  const res = await runAssistantTool('list_location_contents', { location: 'A1' }, ctx, deps);
  const data = res.ok ? (res.data as { found: boolean; ambiguous: boolean }) : null;
  assert.equal(data?.found, false);
  assert.equal(data?.ambiguous, true);
  assert.equal(splitToolArtifact(data), null);
});
