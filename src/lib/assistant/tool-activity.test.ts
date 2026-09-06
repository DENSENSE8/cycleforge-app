/**
 * Tripwire for the active-tool loading copy.
 *
 * The contract an operator observes: while a turn runs, the chat pane names
 * the work in their own vocabulary — never a leaked tool id. A new tool lands
 * in `ASSISTANT_TOOLS` (or `buildWriteTools`) far from the chat pane, so
 * without this test the first person to notice is a packer reading
 * "get packing kpi" on the floor.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASSISTANT_TOOLS } from './tools/index';
import { buildWriteTools } from './tools/write-tools';
import { TOOL_ACTIVITY_PHRASES, WRITE_TOOL_NAMES, toolActivityPhrase } from './tool-activity';

const registryNames = [...ASSISTANT_TOOLS.keys()];
const writeNames = buildWriteTools(null).map((t) => t.name);

test('every registered tool has explicit loading copy', () => {
  const missing = registryNames.filter((name) => !TOOL_ACTIVITY_PHRASES[name]);
  assert.deepEqual(
    missing,
    [],
    `add these to TOOL_ACTIVITY_PHRASES in src/lib/assistant/tool-activity.ts: ${missing.join(', ')}`,
  );
});

test('every session write tool has explicit loading copy', () => {
  // buildWriteTools is per-request, so its names are mirrored as a literal in
  // tool-activity.ts. Both halves of that mirror are asserted here.
  assert.deepEqual([...writeNames].sort(), [...WRITE_TOOL_NAMES].sort());
  const missing = writeNames.filter((name) => !TOOL_ACTIVITY_PHRASES[name]);
  assert.deepEqual(missing, []);
});

test('no phrase carries its own trailing punctuation', () => {
  // The chat pane appends "…". A phrase ending in "…" or "." would double it.
  const offenders = Object.entries(TOOL_ACTIVITY_PHRASES)
    .filter(([, phrase]) => /[.…]$/.test(phrase))
    .map(([name]) => name);
  assert.deepEqual(offenders, []);
});

test('phrases are sentence case and stay on one line in a 360px pane', () => {
  for (const [name, phrase] of Object.entries(TOOL_ACTIVITY_PHRASES)) {
    assert.equal(phrase, phrase.trim(), `${name}: padded`);
    assert.match(phrase, /^[A-Z]/, `${name}: not sentence case`);
    assert.notEqual(phrase, phrase.toUpperCase(), `${name}: shouting`);
    assert.ok(phrase.length <= 34, `${name}: "${phrase}" is ${phrase.length} chars, wraps at 360px`);
  }
});

test('an unmapped tool degrades to readable copy, never a raw id or a blank', () => {
  assert.equal(toolActivityPhrase('get_widget_census'), 'Get widget census');
  assert.equal(toolActivityPhrase(''), 'Working');
});
