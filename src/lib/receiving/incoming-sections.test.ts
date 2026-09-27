import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RowGroup } from '@/lib/group-rows';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { cutIncomingSections, incomingSectionOf } from './incoming-sections';

type Line = Pick<ReceivingLineRow, 'delivery_state'>;
const po = (key: string, ...states: Line['delivery_state'][]): RowGroup<Line> => ({
  key,
  rows: states.map((delivery_state) => ({ delivery_state })),
});

test('a purchase walks with its most urgent line — one delivered box puts it at the dock', () => {
  assert.equal(incomingSectionOf(po('A', 'IN_TRANSIT', 'DELIVERED_UNOPENED').rows), 'delivered');
  assert.equal(incomingSectionOf(po('B', 'AWAITING_TRACKING', 'ARRIVING_TODAY').rows), 'today');
  // Carrier trouble is not a walk: it is the Exceptions view's, so it files under Other.
  assert.equal(incomingSectionOf(po('C', 'STALLED', 'CARRIER_MISMATCH', null).rows), 'other');
});

test('sections come in walk order, empty ones dropped, input order kept inside each', () => {
  const cut = cutIncomingSections([
    po('T1', 'IN_TRANSIT'),
    po('X', 'PENDING_CARRIER'),
    po('D1', 'DELIVERED_UNOPENED'),
    po('T2', 'IN_TRANSIT'),
    po('D2', 'IN_TRANSIT', 'DELIVERED_UNOPENED'),
  ]);
  assert.deepEqual(
    cut.map(([section, groups]) => [section, groups.map((group) => group.key)]),
    [
      ['delivered', ['D1', 'D2']],
      ['transit', ['T1', 'T2']],
      ['other', ['X']],
    ],
  );
});
