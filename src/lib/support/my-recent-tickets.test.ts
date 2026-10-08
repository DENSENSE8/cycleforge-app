import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listMyRecentTickets,
  MY_RECENT_TICKETS_DEFAULT_LIMIT,
  MY_RECENT_TICKETS_MAX_LIMIT,
  type MyRecentTicketRow,
  type MyRecentTicketsDeps,
} from './my-recent-tickets';

const ORG = '00000000-0000-0000-0000-000000000001';

function fakes(rows: MyRecentTicketRow[] = []) {
  const cap: Array<{ orgId: string; text: string; params: readonly unknown[] }> = [];
  const deps: MyRecentTicketsDeps = {
    query: async (orgId, text, params) => {
      cap.push({ orgId, text, params });
      return { rows };
    },
  };
  return { deps, cap };
}

test('my recent tickets: scoped to the caller org + staffer, read from helpdesk_comment_staff', async () => {
  const { deps, cap } = fakes();
  await listMyRecentTickets({ orgId: ORG, staffId: 11 }, deps);
  assert.equal(cap.length, 1);
  assert.equal(cap[0].orgId, ORG);
  assert.deepEqual(cap[0].params, [ORG, 11, MY_RECENT_TICKETS_DEFAULT_LIMIT]);
  assert.match(cap[0].text, /FROM helpdesk_comment_staff\s+WHERE organization_id = \$1 AND staff_id = \$2/);
  assert.match(cap[0].text, /ORDER BY m\.last_worked_at DESC$/);
});

test('my recent tickets: limit is clamped to 1..max', async () => {
  for (const [asked, sent] of [[0, 1], [500, MY_RECENT_TICKETS_MAX_LIMIT], [7, 7]] as const) {
    const { deps, cap } = fakes();
    await listMyRecentTickets({ orgId: ORG, staffId: 3, limit: asked }, deps);
    assert.equal(cap[0].params[2], sent, `limit ${asked}`);
  }
});

test('my recent tickets: rows map to id / subject / status / ISO time; unmirrored tickets stay listed', async () => {
  const { deps } = fakes([
    { ticket_id: '9601', last_worked_at: '2026-10-07T15:00:00Z', subject: ' Refund request ', status: 'open' },
    { ticket_id: 9500, last_worked_at: new Date('2026-10-06T09:30:00Z'), subject: null, status: '' },
  ]);
  assert.deepEqual(await listMyRecentTickets({ orgId: ORG, staffId: 11 }, deps), [
    { id: 9601, subject: 'Refund request', status: 'open', lastWorkedAt: '2026-10-07T15:00:00.000Z' },
    { id: 9500, subject: null, status: null, lastWorkedAt: '2026-10-06T09:30:00.000Z' },
  ]);
});
