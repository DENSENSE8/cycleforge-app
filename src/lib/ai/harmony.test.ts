/**
 * Harmony bridge. Every fixture below is VERBATIM output measured from
 * `mlx_lm.server` on the Mac (model id `default_model` =
 * gpt-oss-20b-MXFP4-Q8 + cycleforge-gpt-oss-v1-promoted), 2026-09-06 through
 * http://127.0.0.1:8080/v1/chat/completions. Do not "tidy" the spacing: the
 * space before `<|constrain|>` and the one after the tool name are what the
 * model actually emits.
 * Run: npm run test:assistant
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createHarmonyTextFilter,
  looksLikeHarmony,
  parseHarmonyToolCalls,
  stripHarmony,
} from './harmony';

/** Measured: the wf1-unpaired golden through the promoted adapter. */
const TOOL_ROUND =
  '<|channel|>analysis<|message|>We need to answer: "Which orders are not paired to a catalog item?" ' +
  'We need to call find_unpaired_order_exceptions. We need to call the tool.<|end|>' +
  '<|start|>assistant<|channel|>commentary to=functions.find_unpaired_order_exceptions ' +
  '<|constrain|>json<|message|>{"limit":25}';

/** Measured: the same model answering with a tool this app really advertises. */
const APP_TOOL_ROUND =
  '<|channel|>analysis<|message|>We need to call get_packing_kpi with dateKey. ' +
  'The date is 2026-09-06. We should call the tool.<|end|>' +
  '<|start|>assistant<|channel|>commentary to=functions.get_packing_kpi ' +
  '<|constrain|>json<|message|>{"dateKey":"2026-09-06"}';

const ADVERTISED = new Set(['get_packing_kpi', 'get_roi_gaps', 'render_artifact']);

test('a Harmony tool round yields the call the model meant', () => {
  const calls = parseHarmonyToolCalls(APP_TOOL_ROUND, ADVERTISED);
  assert.deepEqual(calls, [{ name: 'get_packing_kpi', arguments: '{"dateKey":"2026-09-06"}' }]);
});

test('a tool the registry does not advertise is dropped, never dispatched', () => {
  // The promoted adapter was trained on a 12-tool vocabulary; 9 of those names
  // do not exist in this app. Its trained first choice must not become a call.
  assert.deepEqual(parseHarmonyToolCalls(TOOL_ROUND, ADVERTISED), []);
  assert.deepEqual(
    parseHarmonyToolCalls(TOOL_ROUND, new Set(['find_unpaired_order_exceptions'])),
    [{ name: 'find_unpaired_order_exceptions', arguments: '{"limit":25}' }],
  );
});

test('two calls in one message come back in order', () => {
  const text =
    '<|channel|>commentary to=functions.get_roi_gaps <|constrain|>json<|message|>{"limit":5}<|end|>' +
    '<|start|>assistant<|channel|>commentary to=functions.get_packing_kpi <|constrain|>json<|message|>{}';
  assert.deepEqual(
    parseHarmonyToolCalls(text, ADVERTISED).map((c) => c.name),
    ['get_roi_gaps', 'get_packing_kpi'],
  );
});

test('a truncated argument object rides as {}, never as invalid JSON on the wire', () => {
  // Measured failure mode: the salvaged call is echoed back inside
  // assistant.tool_calls[].function.arguments, mlx_lm.server json.loads() it
  // while rendering the template, and a max_tokens cut killed the whole turn —
  // `404 {"error": "Expecting ',' delimiter: line 1 column 917"}`.
  const cut =
    '<|channel|>commentary to=functions.get_packing_kpi <|constrain|>json<|message|>{"dayPst":"2026-09-06","packer":"Ana Rey';
  const [call] = parseHarmonyToolCalls(cut, ADVERTISED);
  assert.equal(call.name, 'get_packing_kpi');
  assert.doesNotThrow(() => JSON.parse(call.arguments), 'arguments must always parse');
  assert.deepEqual(JSON.parse(call.arguments), {});

  // A complete object with a narration tail keeps its data.
  const tail =
    '<|channel|>commentary to=functions.get_packing_kpi <|constrain|>json<|message|>{"dayPst":"2026-09-06"} and then we render.';
  const [kept] = parseHarmonyToolCalls(tail, ADVERTISED);
  assert.deepEqual(JSON.parse(kept.arguments), { dayPst: '2026-09-06' });
});

test('the private analysis channel never reaches the operator', () => {
  const shown = stripHarmony(TOOL_ROUND);
  assert.equal(shown, '', 'a pure tool round shows nothing in the bubble');
  assert.doesNotMatch(shown, /We need to call/);

  const answered =
    '<|channel|>analysis<|message|>The tool returned three packers.<|end|>' +
    '<|start|>assistant<|channel|>final<|message|>Ana Reyes is leading at 41 cartons.';
  assert.equal(stripHarmony(answered), 'Ana Reyes is leading at 41 cartons.');
});

test('plain text passes through untouched (Grok/Qwen are not Harmony)', () => {
  const plain = 'Ana Reyes is leading at 41 cartons (12.4 units/hr).';
  assert.equal(looksLikeHarmony(plain), false);
  assert.equal(stripHarmony(plain), plain);
  const filter = createHarmonyTextFilter();
  assert.equal(filter.push(plain) + filter.flush(), plain, 'nothing added, nothing lost');
});

test('streaming filter: analysis is suppressed, final is emitted whole, markers never leak', () => {
  const source =
    '<|channel|>analysis<|message|>Deliberating about tools.<|end|>' +
    '<|start|>assistant<|channel|>final<|message|>Three packers, Ana leads.';
  // Chunked at every 7 chars, so control tokens split across boundaries.
  const filter = createHarmonyTextFilter();
  let shown = '';
  for (let i = 0; i < source.length; i += 7) shown += filter.push(source.slice(i, i + 7));
  shown += filter.flush();
  assert.doesNotMatch(shown, /Deliberating/, 'the analysis channel must not stream');
  assert.doesNotMatch(shown, /<\|/, 'no control token may reach the bubble');
  assert.equal(shown, 'Three packers, Ana leads.', 'the final channel arrives complete');
});

test('streaming filter: a tool-only round streams nothing at all', () => {
  const filter = createHarmonyTextFilter();
  let shown = '';
  for (let i = 0; i < APP_TOOL_ROUND.length; i += 11) {
    shown += filter.push(APP_TOOL_ROUND.slice(i, i + 11));
  }
  shown += filter.flush();
  assert.equal(shown.trim(), '', 'the operator sees the phase line, not the channels');
});
