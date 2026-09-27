/**
 * The round's visible-text filter: tool calls a model WRITES as text and its
 * reasoning must never reach `delta`, however the stream is chunked, while
 * ordinary prose brackets pass through untouched.
 * Run: npx tsx --test src/lib/ai/visible-text.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVisibleTextFilter, type EchoedToolCall } from './visible-text';

const TOOLS = new Set(['hybrid_entity_search', 'get_packing_kpi', 'search_notes']);

interface Collected {
  text: string;
  reasoning: string;
  echoes: EchoedToolCall[];
  /** The published text after every push — what the operator saw mid-stream. */
  prefixes: string[];
}

function run(chunks: string[]): Collected {
  const filter = createVisibleTextFilter({ toolNames: TOOLS });
  const out: Collected = { text: '', reasoning: '', echoes: [], prefixes: [] };
  for (const chunk of [...chunks, null]) {
    const slice = chunk === null ? filter.flush() : filter.push(chunk);
    out.text += slice.text;
    out.reasoning += slice.reasoning;
    out.echoes.push(...slice.echoes);
    out.prefixes.push(out.text);
  }
  return out;
}

/** Whole, one character at a time, and in 3-char chunks: all must agree. */
function everyChunking(raw: string): Collected[] {
  return [[raw], [...raw], raw.match(/[^]{1,3}/g) ?? []].map(run);
}

test('a bracketed pythonic call is scrubbed to an echo, split anywhere', () => {
  const raw = '[hybrid_entity_search(query="SKU X00ABC123", limit="12")] Let\'s see where SKU X00ABC123 is.';
  for (const r of everyChunking(raw)) {
    assert.equal(r.text.trim(), "Let's see where SKU X00ABC123 is.");
    assert.deepEqual(
      r.echoes.map((e) => [e.name, e.args]),
      [['hybrid_entity_search', { query: 'SKU X00ABC123', limit: '12' }]],
    );
    // Never published, not even a partial marker, at any point mid-stream.
    for (const seen of r.prefixes) {
      assert.ok(!seen.includes('hybrid'), `leaked mid-stream: ${JSON.stringify(seen)}`);
      assert.ok(!seen.includes('['), `leaked bracket mid-stream: ${JSON.stringify(seen)}`);
    }
  }
});

test('a pythonic call list scrubs every call in it', () => {
  const [r] = everyChunking('[get_packing_kpi(day="today"), search_notes(q=\'late, "rush"\', n=3)]ok');
  assert.equal(r.text, 'ok');
  assert.deepEqual(
    r.echoes.map((e) => [e.name, e.args]),
    [
      ['get_packing_kpi', { day: 'today' }],
      ['search_notes', { q: 'late, "rush"', n: 3 }],
    ],
  );
});

test('a bare JSON call object is scrubbed; a JSON object naming a non-tool is data', () => {
  for (const r of everyChunking('Checking. {"name": "get_packing_kpi", "parameters": {"day": "today"}} Done.')) {
    assert.equal(r.text, 'Checking.  Done.');
    assert.deepEqual(r.echoes.map((e) => [e.name, e.args]), [['get_packing_kpi', { day: 'today' }]]);
  }
  for (const r of everyChunking('Customer {"name": "Bob", "arguments": 2} ok')) {
    assert.equal(r.text, 'Customer {"name": "Bob", "arguments": 2} ok');
    assert.deepEqual(r.echoes, []);
  }
});

test('<tool_call> and <|python_tag|> blocks are scrubbed, split anywhere', () => {
  for (const r of everyChunking('A<tool_call>{"name":"get_packing_kpi","arguments":"{\\"day\\":\\"today\\"}"}</tool_call>B')) {
    assert.equal(r.text, 'AB');
    assert.deepEqual(r.echoes.map((e) => [e.name, e.args]), [['get_packing_kpi', { day: 'today' }]]);
    for (const seen of r.prefixes) assert.ok(!seen.includes('<'), `leaked tag: ${JSON.stringify(seen)}`);
  }
  for (const r of everyChunking('<|python_tag|>{"name": "hybrid_entity_search", "parameters": {"query": "tote 7"}}<|eom_id|>')) {
    assert.equal(r.text, '');
    assert.deepEqual(r.echoes.map((e) => [e.name, e.args]), [['hybrid_entity_search', { query: 'tote 7' }]]);
  }
});

test('<think> blocks become reasoning, never answer text', () => {
  for (const r of everyChunking('<think>They want the pace; I should read the KPI.</think>Packing is at 42/hr.')) {
    assert.equal(r.text, 'Packing is at 42/hr.');
    assert.equal(r.reasoning, 'They want the pace; I should read the KPI.');
    for (const seen of r.prefixes) assert.ok(!seen.includes('<'), `leaked tag: ${JSON.stringify(seen)}`);
  }
  // A round that ends mid-thought: the tail is reasoning, not text.
  const [cut] = everyChunking('<think>still going');
  assert.deepEqual([cut.text, cut.reasoning], ['', 'still going']);
});

test('Harmony analysis streams as reasoning, final as text', () => {
  for (const r of everyChunking(
    '<|channel|>analysis<|message|>Need the tool.<|end|><|start|>assistant<|channel|>final<|message|>Here it is.<|return|>',
  )) {
    assert.equal(r.text, 'Here it is.');
    assert.equal(r.reasoning, 'Need the tool.');
  }
});

test('prose brackets and braces pass through untouched', () => {
  const prose =
    'See [see note], the [search_notes] tab, [a link](https://x.test), x[1] = {y}, [unknown_tool(a=1)] and a < b.';
  for (const r of everyChunking(prose)) {
    assert.equal(r.text, prose);
    assert.equal(r.reasoning, '');
    assert.deepEqual(r.echoes, []);
  }
});

test('a call cut off by the end of the round is still scrubbed', () => {
  for (const r of everyChunking('Looking. [hybrid_entity_search(query="SKU')) {
    assert.equal(r.text, 'Looking. ');
    assert.deepEqual(r.echoes.map((e) => e.name), ['hybrid_entity_search']);
  }
});
