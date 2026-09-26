/** DB-free unit tests for AI-assisted order-import column mapping. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeColumnMapping } from './ai-column-mapping';
import { autoMapCsvOrderHeaders } from './csv-order-import';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = 'org-import' as OrgId;

/** Fake tool call returning whatever mappings the test wants. */
function toolCallReturning(
  mappings: Array<{ field?: string; header?: string; confidence?: string; reason?: string }>,
) {
  const seen: { userText: string; orgId: string }[] = [];
  const toolCall = (async (input: { orgId: string; userText: string }) => {
    seen.push({ userText: input.userText, orgId: input.orgId });
    return { args: { mappings }, model: 'test-model', source: 'ollama', usage: undefined };
  }) as unknown as typeof import('@/lib/ai/hermes-tool-call').hermesToolCall;
  return { toolCall, seen };
}

test('proposes only for fields the deterministic alias map left unclaimed', async () => {
  const headers = ['Order #', 'Buyer Ref', 'Despatch By'];
  const deterministic = autoMapCsvOrderHeaders(headers);
  // Sanity: the alias map claims the order number and nothing else here.
  assert.equal(deterministic.order_number, 'Order #');

  const { toolCall, seen } = toolCallReturning([
    { field: 'customer_name', header: 'Buyer Ref', confidence: 'medium', reason: 'Buyer identity' },
  ]);

  const out = await proposeColumnMapping(
    ORG,
    { headers, sampleRows: [], deterministicMapping: deterministic },
    { toolCall },
  );

  assert.deepEqual(out.suggestions.map((s) => s.field), ['customer_name']);
  // The already-claimed column is not even offered to the model.
  assert.ok(!seen[0]!.userText.includes('- Order #'));
});

test('a suggestion naming a column NOT in the file is dropped and reported', async () => {
  // The single most likely failure mode: a plausible column that does not exist.
  const { toolCall } = toolCallReturning([
    { field: 'tracking_number', header: 'Tracking Code', confidence: 'high', reason: 'invented' },
  ]);

  const out = await proposeColumnMapping(
    ORG,
    { headers: ['Order #', 'Buyer Ref'], sampleRows: [], deterministicMapping: {} },
    { toolCall },
  );

  assert.equal(out.suggestions.length, 0);
  assert.deepEqual(out.rejectedHallucinations, ['Tracking Code']);
  assert.ok(out.stillUnmapped.includes('tracking_number'));
});

test('never overrides a deterministic mapping, even when the model insists', async () => {
  const headers = ['Order Number', 'SKU'];
  const deterministic = autoMapCsvOrderHeaders(headers);
  assert.equal(deterministic.order_number, 'Order Number');

  const { toolCall } = toolCallReturning([
    { field: 'order_number', header: 'SKU', confidence: 'high', reason: 'model is wrong' },
  ]);

  const out = await proposeColumnMapping(
    ORG,
    { headers, sampleRows: [], deterministicMapping: deterministic },
    { toolCall },
  );

  assert.equal(
    out.suggestions.find((s) => s.field === 'order_number'),
    undefined,
    'a field the aliases already resolved must never be re-proposed',
  );
});

test('one column maps to at most one field', async () => {
  const { toolCall } = toolCallReturning([
    { field: 'customer_name', header: 'Ref', confidence: 'high', reason: 'a' },
    { field: 'note', header: 'Ref', confidence: 'high', reason: 'b' },
  ]);

  const out = await proposeColumnMapping(
    ORG,
    { headers: ['Ref'], sampleRows: [], deterministicMapping: {} },
    { toolCall },
  );

  assert.equal(out.suggestions.length, 1);
});

test('one field takes at most one column', async () => {
  const { toolCall } = toolCallReturning([
    { field: 'note', header: 'A', confidence: 'high', reason: 'a' },
    { field: 'note', header: 'B', confidence: 'high', reason: 'b' },
  ]);

  const out = await proposeColumnMapping(
    ORG,
    { headers: ['A', 'B'], sampleRows: [], deterministicMapping: {} },
    { toolCall },
  );

  assert.equal(out.suggestions.length, 1);
  assert.equal(out.suggestions[0]!.header, 'A');
});

test('an unknown field key from the model is ignored', async () => {
  const { toolCall } = toolCallReturning([
    { field: 'totally_made_up', header: 'A', confidence: 'high', reason: 'x' },
  ]);

  const out = await proposeColumnMapping(
    ORG,
    { headers: ['A'], sampleRows: [], deterministicMapping: {} },
    { toolCall },
  );

  assert.equal(out.suggestions.length, 0);
});

test('a garbage confidence degrades to low rather than being trusted', async () => {
  const { toolCall } = toolCallReturning([
    { field: 'note', header: 'A', confidence: 'CERTAIN', reason: 'x' },
  ]);

  const out = await proposeColumnMapping(
    ORG,
    { headers: ['A'], sampleRows: [], deterministicMapping: {} },
    { toolCall },
  );

  assert.equal(out.suggestions[0]!.confidence, 'low');
});

test('no model call is spent when every field is already mapped', async () => {
  let called = false;
  const toolCall = (async () => {
    called = true;
    throw new Error('must not be called');
  }) as unknown as typeof import('@/lib/ai/hermes-tool-call').hermesToolCall;

  const headers = ['Order Number'];
  const everything = Object.fromEntries(
    // Pretend the alias map claimed every canonical field.
    (await import('./csv-order-import')).CSV_ORDER_CANONICAL_FIELDS.map((f) => [f.key, 'Order Number']),
  );

  const out = await proposeColumnMapping(
    ORG,
    { headers, sampleRows: [], deterministicMapping: everything },
    { toolCall },
  );

  assert.equal(called, false);
  assert.equal(out.suggestions.length, 0);
  assert.equal(out.model, 'none');
});

test('no model call is spent when no columns are left to offer', async () => {
  let called = false;
  const toolCall = (async () => {
    called = true;
    throw new Error('must not be called');
  }) as unknown as typeof import('@/lib/ai/hermes-tool-call').hermesToolCall;

  const out = await proposeColumnMapping(
    ORG,
    { headers: ['Only'], sampleRows: [], deterministicMapping: { order_number: 'Only' } },
    { toolCall },
  );

  assert.equal(called, false);
  assert.equal(out.suggestions.length, 0);
});

test('stillUnmapped states what was NOT solved — never implied by omission', async () => {
  const { toolCall } = toolCallReturning([
    { field: 'note', header: 'Comments', confidence: 'high', reason: 'notes column' },
  ]);

  const out = await proposeColumnMapping(
    ORG,
    { headers: ['Comments', 'Mystery'], sampleRows: [], deterministicMapping: {} },
    { toolCall },
  );

  assert.ok(out.stillUnmapped.includes('order_number'), 'required field still unmapped is stated');
  assert.ok(!out.stillUnmapped.includes('note'));
});

test('sample rows are sent so values can disambiguate ambiguous header names', async () => {
  const { toolCall, seen } = toolCallReturning([]);

  await proposeColumnMapping(
    ORG,
    {
      headers: ['Ref'],
      sampleRows: [{ Ref: '1Z999AA10123456784' }],
      deterministicMapping: {},
    },
    { toolCall },
  );

  assert.match(seen[0]!.userText, /1Z999AA10123456784/);
});
