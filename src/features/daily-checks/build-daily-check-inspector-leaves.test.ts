import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import {
  buildDailyCheckInspectorLeaves,
  DAILY_CHECK_INSPECTOR_TOPICS,
  dailyCheckInspectorSubtitle,
} from './build-daily-check-inspector-leaves';

test('Daily inspector leaf ids are the five Unbox-mapped topics in order', () => {
  assert.deepEqual([...DAILY_CHECK_INSPECTOR_TOPICS], [
    'overview',
    'connections',
    'ticket',
    'work-order',
    'who-ran',
  ]);
});

test('builder returns those five ids with Overview first', () => {
  const contents = Object.fromEntries(
    DAILY_CHECK_INSPECTOR_TOPICS.map((id) => [id, createElement('div', { key: id })]),
  ) as Parameters<typeof buildDailyCheckInspectorLeaves>[0]['contents'];
  const leaves = buildDailyCheckInspectorLeaves({ contents });
  assert.deepEqual(
    leaves.map((leaf) => leaf.id),
    [...DAILY_CHECK_INSPECTOR_TOPICS],
  );
  assert.equal(leaves[0]?.label, 'Overview');
});

test('Ticket / Work order subtitles flip when a link exists', () => {
  assert.equal(
    dailyCheckInspectorSubtitle('ticket', { ticketLinked: false, workOrderLinked: false }),
    'Connect a ticket',
  );
  assert.equal(
    dailyCheckInspectorSubtitle('ticket', { ticketLinked: true, workOrderLinked: false }),
    'Linked — view in panel',
  );
  assert.equal(
    dailyCheckInspectorSubtitle('work-order', { ticketLinked: false, workOrderLinked: true }),
    'Linked',
  );
});
