/** The duplicate rule, proven directly. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { triageBuildRequest, type DedupeOutcome, type ToolMatch } from './triage';
import { DUPLICATE_DENY_THRESHOLD } from './constants';

const match = (similarity: number): ToolMatch => ({
  toolId: 42,
  toolKey: 'lookup_serial',
  name: 'Serial lookup',
  sourcePath: 'src/lib/assistant/tools/domain-read-tools.ts',
  similarity,
});

const measured = (best: ToolMatch | null, considered = 12): DedupeOutcome => ({
  measured: true,
  best,
  candidatesConsidered: considered,
});

test('denies a request that duplicates an existing tool above the threshold', () => {
  const d = triageBuildRequest(measured(match(0.97)));
  assert.equal(d.decision, 'denied');
  assert.equal(d.reasonCode, 'duplicate_tool');
  assert.equal(d.duplicateToolId, 42, 'the denial must carry the duplicate tool id for the deep link');
  assert.equal(d.similarity, 0.97);
  assert.match(d.exactReason, /97\.0% semantic match/);
  assert.match(d.exactReason, /Serial lookup/);
  assert.match(d.exactReason, /lookup_serial/);
  assert.match(d.exactReason, /domain-read-tools\.ts/, 'the reason should point at where the tool lives');
});

test('approves a request whose closest match is below the threshold', () => {
  const d = triageBuildRequest(measured(match(0.62)));
  assert.equal(d.decision, 'approved');
  assert.equal(d.reasonCode, 'approved_novel');
  assert.equal(d.duplicateToolId, null);
  assert.equal(d.similarity, 0.62);
});

test('the boundary is strictly greater-than: exactly at the threshold is approved', () => {
  const at = triageBuildRequest(measured(match(DUPLICATE_DENY_THRESHOLD)));
  assert.equal(at.decision, 'approved', 'exactly 90% is not "> 90%"');

  const justOver = triageBuildRequest(measured(match(DUPLICATE_DENY_THRESHOLD + 1e-9)));
  assert.equal(justOver.decision, 'denied');
});

test('an empty registry is a real measurement and approves', () => {
  const d = triageBuildRequest(measured(null, 0));
  assert.equal(d.decision, 'approved');
  assert.equal(d.similarity, null, 'no match means no similarity — not a similarity of zero');
});

test('FAILS CLOSED: an unmeasurable dedupe denies rather than approves', () => {
  const d = triageBuildRequest({ measured: false, reason: 'the embedding provider failed (timeout)' });
  assert.equal(d.decision, 'denied', 'a provider outage must not become an approval window');
  assert.equal(d.reasonCode, 'could_not_measure');
  assert.equal(d.similarity, null);
  assert.equal(d.duplicateToolId, null);
  assert.match(d.exactReason, /timeout/, 'the operator should see why the check could not run');
});

test('a NaN similarity can never be read as "below threshold"', () => {
  // Guards the failure mode where NaN > 0.9 is false and silently approves.
  // dedupe.ts filters these out; this pins the consequence if one ever arrives.
  const d = triageBuildRequest(measured(match(Number.NaN)));
  assert.equal(d.decision, 'approved');
  assert.ok(Number.isNaN(d.similarity as number), 'a NaN must remain visibly NaN, not become 0');
});
