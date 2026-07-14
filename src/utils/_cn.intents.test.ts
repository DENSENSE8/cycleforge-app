import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cn } from './_cn';

/**
 * Guards the spacing-intent registration in cn()/tailwind-merge (spacing
 * token-leakage plan Phase 2.2). Without the 'cf-inset'/'cf-stack'/'cf-row'
 * class groups, twMerge treats the intent utilities as unknown classes and
 * keeps BOTH of two same-kind intents, so stylesheet order (not call order)
 * silently decides the padding.
 */

test('two intents of one kind conflict-resolve — last wins', () => {
  assert.equal(cn('inset-field', 'inset-card'), 'inset-card');
  assert.equal(cn('inset-chip', 'inset-empty'), 'inset-empty');
  assert.equal(cn('stack-tight', 'stack-section'), 'stack-section');
  assert.equal(cn('row-gap', 'row-tight'), 'row-tight');
});

test('different intent kinds do not conflict with each other', () => {
  assert.equal(cn('inset-card', 'stack-row'), 'inset-card stack-row');
});

test('intents survive alongside unrelated utilities (not misgrouped)', () => {
  assert.equal(cn('inset-chip', 'text-role-caption'), 'inset-chip text-role-caption');
  assert.equal(cn('stack-section', 'overflow-y-auto'), 'stack-section overflow-y-auto');
});

test('positioning inset-* is a separate axis from inset-* intents', () => {
  assert.equal(cn('inset-0', 'inset-card'), 'inset-0 inset-card');
});

test('intent + raw padding is NOT a merge conflict (documented: both kept, intent wins in CSS — do not mix)', () => {
  assert.equal(cn('inset-field', 'px-6'), 'inset-field px-6');
});
