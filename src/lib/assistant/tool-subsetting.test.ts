/**
 * Self-hosted advertisement: a print ask reaches the print tool and NOT the
 * document viewer (the local model routes "packing slip for order N" to the
 * viewer when both ride); a show ask still reaches the viewer.
 * Run: node --import tsx --test src/lib/assistant/tool-subsetting.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subsetAdvertisedTools } from './tool-subsetting';
import type { OpenAiFunctionTool } from './tools/openai-schema';

const tool = (name: string, description: string) =>
  ({ type: 'function', function: { name, description, parameters: { type: 'object', properties: {} } } }) as OpenAiFunctionTool;

const TOOLS = [
  tool('find_records', 'Find records'),
  tool('get_order_documents', 'SHOW an order shipping label, packing slip and paperwork'),
  tool('print_order_paperwork', 'PRINT order paperwork: shipping label, packing slip'),
  tool('print_handling_unit_labels', 'Print tote labels'),
];

test('print ask: the print tool rides, the document viewer does not', () => {
  const { rankedNames } = subsetAdvertisedTools('Print the packing slip for order 79-05469-12449', null, TOOLS);
  assert.ok(rankedNames.includes('print_order_paperwork'));
  assert.ok(!rankedNames.includes('get_order_documents'));
});

test('show ask: the document viewer rides', () => {
  const { rankedNames } = subsetAdvertisedTools('Show me the packing slip for order 5080', null, TOOLS);
  assert.ok(rankedNames.includes('get_order_documents'));
});

test('tote print: not an order-paperwork print', () => {
  const { rankedNames } = subsetAdvertisedTools('Print 50 tote labels', null, TOOLS);
  assert.ok(rankedNames.includes('print_handling_unit_labels'));
  assert.ok(!rankedNames.includes('get_order_documents'));
});

test('a carrier tracking number is an order read, not the serial resolver — unless a serial is named too', () => {
  const tools = [...TOOLS, tool('get_order_lookup', 'Look up an order id or tracking number'), tool('lookup_serial', 'Resolve a serial: which order shipped this serial')];
  const tracking = subsetAdvertisedTools('Which order shipped with tracking 1ZJ22B100324366661?', null, tools).rankedNames;
  assert.ok(tracking.includes('get_order_lookup'));
  assert.ok(!tracking.includes('lookup_serial'));
  assert.ok(subsetAdvertisedTools('Which order shipped serial SN12345 on tracking 1ZJ22B100324366661?', null, tools).rankedNames.includes('lookup_serial'));
});
