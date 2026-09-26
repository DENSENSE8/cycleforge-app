import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeSubstitutionReasons, SUBSTITUTION_REASONS } from './substitution-reasons';

/** Class-D substitution slice (D1): */

test('mergeSubstitutionReasons: DB label wins, registry supplies tone + hint for a built-in code', () => {
  const merged = mergeSubstitutionReasons([{ code: 'DAMAGE_FOUND', label: 'Damaged on arrival' }]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].code, 'DAMAGE_FOUND');
  assert.equal(merged[0].label, 'Damaged on arrival'); // tenant-renamed label is preserved
  assert.equal(merged[0].tone, 'danger'); // tone resolved from the built-in registry
  const builtin = SUBSTITUTION_REASONS.find((r) => r.code === 'DAMAGE_FOUND');
  assert.equal(merged[0].hint, builtin?.hint);
});

test('mergeSubstitutionReasons: a custom tenant code degrades to muted tone + no hint', () => {
  const merged = mergeSubstitutionReasons([{ code: 'TENANT_SPECIAL', label: 'Tenant special' }]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].tone, 'muted');
  assert.equal(merged[0].hint, undefined);
});

test('mergeSubstitutionReasons: empty input is empty (caller falls back to the built-ins)', () => {
  assert.deepEqual(mergeSubstitutionReasons([]), []);
});

test('mergeSubstitutionReasons: preserves order + maps every row', () => {
  const rows = SUBSTITUTION_REASONS.map((r) => ({ code: r.code, label: r.label }));
  const merged = mergeSubstitutionReasons(rows);
  assert.equal(merged.length, rows.length);
  assert.deepEqual(merged.map((r) => r.code), rows.map((r) => r.code));
});
