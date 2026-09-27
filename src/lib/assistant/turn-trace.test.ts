/**
 * The turn reducer shared by the chat client and the route's persistence:
 * `content` must end up as the ANSWER only, with every tool round's narration
 * filed as a note step in order.
 * Run: npm run test:assistant
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTurnFrame,
  beginTurn,
  parseTurnTrace,
  settleTurn,
  summarizeToolResult,
  toPersistedTrace,
  type AssistantTurnDraft,
  type AssistantTurnFrame,
} from './turn-trace';

/** Fold frames at t = 1000, 1001, … so durations are exact. */
function fold(frames: AssistantTurnFrame[], start = 1000): AssistantTurnDraft {
  let d = beginTurn(start);
  frames.forEach((f, i) => {
    d = applyTurnFrame(d, f, start + i + 1);
  });
  return d;
}

test("a tool round's streamed text moves out of the answer into a note step", () => {
  const d = fold([
    { event: 'step', index: 1 },
    { event: 'delta', text: 'Let me search ' },
    { event: 'delta', text: 'for that SKU.' },
    { event: 'step_end', index: 1, toolRound: true },
    { event: 'tool', name: 'hybrid_entity_search', status: 'start', input: { query: 'SKU X00ABC123', limit: 12 } },
    { event: 'tool', name: 'hybrid_entity_search', status: 'end', ok: true },
    { event: 'step', index: 2 },
    { event: 'delta', text: 'It is in bin A-12.' }, // t = 1008
    { event: 'step_end', index: 2, toolRound: false },
  ]);
  assert.equal(d.content, 'It is in bin A-12.');
  assert.deepEqual(
    d.steps.map((s) => (s.kind === 'tool' ? [s.kind, s.name, s.status, s.input] : [s.kind, s.text])),
    [
      ['note', 'Let me search for that SKU.'],
      ['tool', 'hybrid_entity_search', 'ok', { query: 'SKU X00ABC123', limit: 12 }],
    ],
  );
  // Thinking ends where the answer's first text arrived, not at turn end.
  assert.equal(d.thinkingMs, 8);
  assert.deepEqual(d.toolsUsed, ['hybrid_entity_search']);
});

test('a tool round that said nothing leaves no empty note, and the answer never absorbs narration', () => {
  const d = fold([
    { event: 'step', index: 1 },
    { event: 'delta', text: '  \n' },
    { event: 'step_end', index: 1, toolRound: true },
    { event: 'step', index: 2 },
    { event: 'delta', text: 'Checking the other table.' },
    { event: 'step_end', index: 2, toolRound: true },
    { event: 'step', index: 3 },
    { event: 'delta', text: '\n\nDone.' },
    { event: 'step_end', index: 3, toolRound: false },
  ]);
  assert.equal(d.content, 'Done.');
  assert.deepEqual(d.steps, [{ kind: 'note', text: 'Checking the other table.' }]);
});

test('reasoning coalesces within a round and starts a new step in the next', () => {
  const d = fold([
    { event: 'step', index: 1 },
    { event: 'reasoning', text: 'Need the ' },
    { event: 'reasoning', text: 'KPI.' },
    { event: 'step_end', index: 1, toolRound: true },
    { event: 'step', index: 2 },
    { event: 'reasoning', text: 'Got it.' },
  ]);
  assert.deepEqual(d.steps, [
    { kind: 'reasoning', text: 'Need the KPI.' },
    { kind: 'reasoning', text: 'Got it.' },
  ]);
});

test('settling fails a tool that never reported back and charges the whole turn as thinking', () => {
  const d = settleTurn(
    fold([
      { event: 'step', index: 1 },
      { event: 'step_end', index: 1, toolRound: true },
      { event: 'tool', name: 'get_packing_kpi', status: 'start', input: {} },
      { event: 'tool', name: 'list_exceptions', status: 'start', input: {} },
      { event: 'tool', name: 'list_exceptions', status: 'end', ok: false },
    ]),
    1100,
  );
  assert.deepEqual(
    d.steps.map((s) => (s.kind === 'tool' ? [s.name, s.status, s.endedAt] : null)),
    [
      ['get_packing_kpi', 'error', 1100],
      ['list_exceptions', 'error', 1005],
    ],
  );
  assert.equal(d.thinkingMs, 100);
  assert.equal(d.content, '');
});

test('a deterministic reply has no thinking time; a tool-less model answer does', () => {
  const localOps = settleTurn(fold([{ event: 'delta', text: 'Packed 42 today.' }]), 1500);
  assert.deepEqual([localOps.content, localOps.steps, localOps.thinkingMs], ['Packed 42 today.', [], null]);
  const model = settleTurn(
    fold([
      { event: 'step', index: 1 },
      { event: 'delta', text: 'Hello.' }, // t = 1002
      { event: 'step_end', index: 1, toolRound: false },
    ]),
    1500,
  );
  assert.deepEqual([model.content, model.steps, model.thinkingMs], ['Hello.', [], 2]);
});

test('a tool row carries a short countable result through the stream and back from storage', () => {
  const d = settleTurn(
    fold([
      { event: 'tool', name: 'hybrid_entity_search', status: 'start' },
      { event: 'tool', name: 'hybrid_entity_search', status: 'end', ok: true, result: '3 results' },
      { event: 'tool', name: 'get_packing_kpi', status: 'start' },
      { event: 'tool', name: 'get_packing_kpi', status: 'end', ok: false },
    ]),
    100,
  );
  const [search, kpi] = d.steps as Array<Extract<(typeof d.steps)[number], { kind: 'tool' }>>;
  assert.equal(search.result, '3 results');
  assert.equal('result' in kpi, false, 'a failed read has no result to count');
  const reopened = parseTurnTrace(JSON.parse(JSON.stringify(toPersistedTrace(d))));
  assert.deepEqual(reopened?.steps, d.steps);
});

test('a tool result summarises to a count only when its shape is countable', () => {
  assert.equal(summarizeToolResult([1, 2, 3]), '3 results');
  assert.equal(summarizeToolResult({ matches: [{ id: 1 }] }), '1 result');
  assert.equal(summarizeToolResult({ note: 'x', rows: [] }), '0 results');
  assert.equal(summarizeToolResult({ total: 1200 }), '1,200 results');
  assert.equal(summarizeToolResult({ ok: true }), null);
  assert.equal(summarizeToolResult('done'), null);
});

test('a persisted trace reads back; legacy analysis on the same column does not', () => {
  const d = settleTurn(
    fold([
      { event: 'step', index: 1 },
      { event: 'delta', text: 'Looking.' },
      { event: 'step_end', index: 1, toolRound: true },
      { event: 'tool', name: 'hybrid_entity_search', status: 'start', input: { query: 'x', nested: { a: 1 } } },
      { event: 'tool', name: 'hybrid_entity_search', status: 'end', ok: true },
    ]),
    2000,
  );
  const stored = JSON.parse(JSON.stringify(toPersistedTrace(d))) as unknown;
  assert.deepEqual(parseTurnTrace(stored), { steps: d.steps, thinkingMs: d.thinkingMs });
  assert.equal(parseTurnTrace({ kind: 'shipping_summary', title: 'Packed', summary: '…' }), null);
  assert.equal(parseTurnTrace(null), null);
});
