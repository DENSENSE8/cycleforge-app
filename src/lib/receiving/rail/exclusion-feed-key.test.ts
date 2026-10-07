/**
 * Pure tests for the rail → feed_key / exclusion → rail-id mapping.
 * Run: npx tsx --test src/lib/receiving/rail/exclusion-feed-key.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { railExclusionFeedKey, exclusionToRailId } from './exclusion-feed-key';

test('railExclusionFeedKey: each station rail dismisses into its own feed key', () => {
  assert.equal(railExclusionFeedKey('triageCombined'), 'receiving_triage');
  assert.equal(railExclusionFeedKey('unboxRecent'), 'receiving_unbox');
});

test('railExclusionFeedKey: QC Recent has no dismiss feed', () => {
  assert.equal(railExclusionFeedKey('testingRecent'), null);
});

test('exclusionToRailId: carton negates, line stays positive (matches getRowId = row.id)', () => {
  assert.equal(exclusionToRailId('RECEIVING', 88), -88); // unfound carton stub id < 0
  assert.equal(exclusionToRailId('RECEIVING_LINE', 41), 41); // real line id > 0
});
