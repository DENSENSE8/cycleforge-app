/**
 *   node_modules/.bin/tsx --test src/lib/realtime/receiving-location-request.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RECEIVING_LOCATION_REQUEST_EVENT,
  buildReceivingLocationRequestPayload,
  parseReceivingLocationRequest,
  publishReceivingLocationRequest,
  receivingLocationRequestChannel,
} from './receiving-location-request';

test('payload carries receiving id, nullable line id, the R-* plate and the minted request id', () => {
  assert.deepEqual(
    buildReceivingLocationRequestPayload({ receivingId: 53426, lineId: 12, requestId: 'req-1', staffId: 4 }),
    {
      receiving_id: 53426,
      receiving_line_id: 12,
      license: 'R-53426',
      request_id: 'req-1',
      requested_by_staff_id: 4,
    },
  );
  const unfound = buildReceivingLocationRequestPayload({ receivingId: 53426, lineId: -53426, requestId: 'req-2', staffId: 4 });
  assert.equal(unfound?.receiving_line_id, null);
});

test('no payload without a real receiving id or request id', () => {
  assert.equal(buildReceivingLocationRequestPayload({ receivingId: 0, lineId: null, requestId: 'x', staffId: 4 }), null);
  assert.equal(buildReceivingLocationRequestPayload({ receivingId: 5, lineId: null, requestId: '  ', staffId: 4 }), null);
});

test('the phone parses what the desk builds; the plate is derived, never trusted', () => {
  const wire = buildReceivingLocationRequestPayload({ receivingId: 53426, lineId: null, requestId: 'req-3', staffId: 4 });
  assert.deepEqual(parseReceivingLocationRequest({ ...wire, license: 'R-1' }), {
    receivingId: 53426,
    lineId: null,
    license: 'R-53426',
    requestId: 'req-3',
  });
  assert.equal(parseReceivingLocationRequest({ receiving_id: 'abc', request_id: 'r' }), null);
  assert.equal(parseReceivingLocationRequest({ receiving_id: 5 }), null);
  assert.equal(parseReceivingLocationRequest(null), null);
});

test('no org or staff → no channel, and publish stays silent', async () => {
  assert.equal(receivingLocationRequestChannel(null, 4), '');
  assert.equal(receivingLocationRequestChannel('org', 0), '');
  let published = 0;
  const client = { channels: { get: () => ({ publish: async () => { published += 1; } }) } };
  await publishReceivingLocationRequest(client, null, 4, { receivingId: 5, lineId: null, requestId: 'r' });
  assert.equal(published, 0);
});

test('publish sends the request event on the staff bridge channel', async () => {
  const sent: Array<{ channel: string; event: string; data: Record<string, unknown> }> = [];
  const client = {
    channels: {
      get: (channel: string) => ({
        publish: async (event: string, data: Record<string, unknown>) => {
          sent.push({ channel, event, data });
        },
      }),
    },
  };
  const orgId = '00000000-0000-0000-0000-000000000001';
  await publishReceivingLocationRequest(client, orgId, 4, { receivingId: 5, lineId: 9, requestId: 'r' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].channel, receivingLocationRequestChannel(orgId, 4));
  assert.equal(sent[0].event, RECEIVING_LOCATION_REQUEST_EVENT);
  assert.equal(sent[0].data.receiving_line_id, 9);
});
