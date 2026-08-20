import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPendingWorkPromptHidden,
  orderPendingWork,
  type PendingWorkItem,
} from './pending-work-model';

const commit = (key: string, latestAt: string): PendingWorkItem => ({
  source: 'nas-archive',
  key,
  receivingId: 1,
  headline: 'x',
  ticketNumber: '9749',
  orderRef: null,
  count: 1,
  latestAt,
  action: 'commit',
  actionLabel: 'Archive photos',
});

const navigate = (key: string, latestAt: string): PendingWorkItem => ({
  source: 'open-exception',
  key,
  receivingId: 2,
  headline: 'y',
  ticketNumber: null,
  orderRef: null,
  count: 1,
  latestAt,
  action: 'navigate',
  actionLabel: 'Open carton',
  href: '/carton/2',
});

test('the card shows the newest item, across sources', () => {
  const ordered = orderPendingWork([
    commit('a', '2026-08-01T00:00:00.000Z'),
    navigate('b', '2026-08-19T00:00:00.000Z'),
    commit('c', '2026-08-10T00:00:00.000Z'),
  ]);
  assert.deepEqual(ordered.map((i) => i.key), ['b', 'c', 'a']);
});

test('ordering does not mutate the caller array', () => {
  const input = [commit('a', '2026-08-01T00:00:00.000Z'), commit('b', '2026-08-09T00:00:00.000Z')];
  orderPendingWork(input);
  assert.deepEqual(input.map((i) => i.key), ['a', 'b']);
});

test('the corner card never mounts on Unbox', () => {
  assert.equal(isPendingWorkPromptHidden('/unbox'), true);
  assert.equal(isPendingWorkPromptHidden('/unbox/'), true);
  assert.equal(isPendingWorkPromptHidden('/triage'), false);
  assert.equal(isPendingWorkPromptHidden('/incoming'), false);
  assert.equal(isPendingWorkPromptHidden('/carton/12'), false);
  assert.equal(isPendingWorkPromptHidden(null), false);
});

test('a navigate item always carries a destination', () => {
  // The union makes the reverse unrepresentable: a `commit` item cannot hold an
  // href, so the card's do-it button can never render for a decision.
  const item = navigate('b', '2026-08-19T00:00:00.000Z');
  assert.equal(item.action, 'navigate');
  assert.ok(item.href.length > 0);
});
