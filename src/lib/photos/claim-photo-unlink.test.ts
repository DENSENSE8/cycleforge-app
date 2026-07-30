import assert from 'node:assert/strict';
import test from 'node:test';
import {
  unlinkReceivingClaimPhotosFromTicket,
  type UnlinkReceivingClaimPhotosFromTicketDeps,
} from './claim-photo-unlink';

const ORG = '00000000-0000-0000-0000-000000000001';

test('unlinkReceivingClaimPhotosFromTicket threads org/ticket/carton/line into delete', async () => {
  const calls: Array<{
    orgId: string;
    ticketId: number;
    receivingId: number;
    lineId?: number | null;
  }> = [];
  const deps: UnlinkReceivingClaimPhotosFromTicketDeps = {
    deleteTicketPhotoLinks: async (args) => {
      calls.push(args);
      return 4;
    },
  };

  const out = await unlinkReceivingClaimPhotosFromTicket(
    { orgId: ORG, ticketId: 9652, receivingId: 50106, lineId: 30557 },
    deps,
  );

  assert.deepEqual(out, { cleared: 4 });
  assert.deepEqual(calls, [
    { orgId: ORG, ticketId: 9652, receivingId: 50106, lineId: 30557 },
  ]);
});

test('unlinkReceivingClaimPhotosFromTicket normalizes missing lineId to null', async () => {
  const calls: Array<{ lineId?: number | null }> = [];
  const deps: UnlinkReceivingClaimPhotosFromTicketDeps = {
    deleteTicketPhotoLinks: async (args) => {
      calls.push(args);
      return 0;
    },
  };

  const out = await unlinkReceivingClaimPhotosFromTicket(
    { orgId: ORG, ticketId: 9652, receivingId: 50106 },
    deps,
  );

  assert.deepEqual(out, { cleared: 0 });
  assert.equal(calls[0]?.lineId, null);
});
