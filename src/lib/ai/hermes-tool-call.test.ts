/**
 * DB-free unit tests for the tool-args recovery net.
 * Run: node --import tsx --test src/lib/ai/hermes-tool-call.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverToolArgsFromContent } from './hermes-tool-call';

test('pulls the args out of a Qwen-style <tool_call> block', () => {
  const out = recoverToolArgsFromContent(
    'Sure!\n<tool_call>\n{"subject": "A", "description": "B"}\n</tool_call>',
  );
  assert.deepEqual(JSON.parse(String(out)), { subject: 'A', description: 'B' });
});

test('takes the LAST object, so narration examples lose to the real call', () => {
  const out = recoverToolArgsFromContent(
    'For example {"subject": "draft"} would work. Final: {"subject": "real"}',
  );
  assert.deepEqual(JSON.parse(String(out)), { subject: 'real' });
});

test('braces and quotes inside a string value do not open or close a frame', () => {
  const out = recoverToolArgsFromContent(
    'ok {"description": "a { brace and an escaped \\" quote", "subject": "S"}',
  );
  assert.deepEqual(JSON.parse(String(out)), {
    description: 'a { brace and an escaped " quote',
    subject: 'S',
  });
});

test('nested objects come back whole, not as the inner frame', () => {
  const out = recoverToolArgsFromContent('{"a": {"b": 1}, "c": 2}');
  assert.deepEqual(JSON.parse(String(out)), { a: { b: 1 }, c: 2 });
});

test('prose with no object, and a bare array, both recover nothing', () => {
  assert.equal(recoverToolArgsFromContent('Let me think about the subject line.'), null);
  // Tool arguments are always an object; an array in the prose is narration.
  assert.equal(recoverToolArgsFromContent('steps: [1, 2, 3]'), null);
});

test('an unterminated object recovers nothing rather than half a call', () => {
  assert.equal(recoverToolArgsFromContent('{"subject": "cut off mid-'), null);
});
