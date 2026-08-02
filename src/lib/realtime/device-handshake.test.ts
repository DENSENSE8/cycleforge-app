import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEVICE_ACK_EVENTS,
  LEGACY_RECEIVING_SHARE_ACK_EVENT,
  STATION_DEVICE_ACK_EVENT,
  isAckFor,
  publishDeviceAck,
  sendToDevice,
  type DeviceAckChannel,
} from './device-handshake';

type Handler = (msg: { data?: { request_id?: string | null } | null }) => void;

/** Minimal in-memory Ably channel double. */
function fakeChannel(opts: { failSubscribe?: boolean } = {}) {
  const handlers = new Map<string, Set<Handler>>();
  const published: Array<{ event: string; data: Record<string, unknown> }> = [];
  let subscribeCount = 0;
  let unsubscribeCount = 0;

  const channel: DeviceAckChannel = {
    async publish(event, data) {
      published.push({ event, data });
    },
    subscribe(event, handler) {
      subscribeCount += 1;
      if (opts.failSubscribe) return Promise.reject(new Error('no channel'));
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler as Handler);
      return Promise.resolve();
    },
    unsubscribe(event, handler) {
      unsubscribeCount += 1;
      handlers.get(event)?.delete(handler as Handler);
      return undefined;
    },
  };

  return {
    channel,
    published,
    emit(event: string, requestId: string | null) {
      for (const h of handlers.get(event) ?? []) h({ data: { request_id: requestId } });
    },
    liveHandlerCount() {
      let n = 0;
      for (const set of handlers.values()) n += set.size;
      return n;
    },
    get subscribeCount() {
      return subscribeCount;
    },
    get unsubscribeCount() {
      return unsubscribeCount;
    },
  };
}

test('an ack matches only its own request id', () => {
  assert.equal(isAckFor({ data: { request_id: 'r1' } }, 'r1'), true);
  assert.equal(isAckFor({ data: { request_id: 'r2' } }, 'r1'), false);
  // An empty/missing id must never count as a match, or one malformed message
  // would satisfy every desk waiting on that channel.
  assert.equal(isAckFor({ data: { request_id: '' } }, ''), false);
  assert.equal(isAckFor({ data: {} }, 'r1'), false);
  assert.equal(isAckFor({}, 'r1'), false);
  assert.equal(isAckFor({ data: null }, 'r1'), false);
});

/**
 * The load-bearing ordering guarantee: a phone on the same LAN can ack within
 * milliseconds, so subscribing after the publish would lose the race and report
 * a reachable phone as unreachable.
 */
test('subscribes BEFORE publishing, so an instant ack is not missed', async () => {
  const f = fakeChannel();
  const acked = await sendToDevice({
    channel: f.channel,
    requestId: 'r1',
    publish: async () => {
      // Simulates a phone that replies during the publish round-trip.
      f.emit(STATION_DEVICE_ACK_EVENT, 'r1');
    },
    timeoutMs: 50,
  });
  assert.equal(acked, true);
});

test('resolves false when nothing answers within the window', async () => {
  const f = fakeChannel();
  const acked = await sendToDevice({
    channel: f.channel,
    requestId: 'r1',
    publish: async () => {},
    timeoutMs: 20,
  });
  assert.equal(acked, false);
});

test("another request's ack does not satisfy this one", async () => {
  const f = fakeChannel();
  const acked = await sendToDevice({
    channel: f.channel,
    requestId: 'mine',
    publish: async () => {
      f.emit(STATION_DEVICE_ACK_EVENT, 'somebody-else');
    },
    timeoutMs: 20,
  });
  assert.equal(acked, false);
});

/** The migration guarantee: a phone on older code still satisfies a fresh desk. */
test('the legacy receiving_share_ack still counts', async () => {
  const f = fakeChannel();
  const acked = await sendToDevice({
    channel: f.channel,
    requestId: 'r1',
    publish: async () => {
      f.emit(LEGACY_RECEIVING_SHARE_ACK_EVENT, 'r1');
    },
    timeoutMs: 50,
  });
  assert.equal(acked, true);
});

test('every ack event is unsubscribed, on both the ack and timeout paths', async () => {
  const acked = fakeChannel();
  await sendToDevice({
    channel: acked.channel,
    requestId: 'r1',
    publish: async () => acked.emit(STATION_DEVICE_ACK_EVENT, 'r1'),
    timeoutMs: 50,
  });
  assert.equal(acked.liveHandlerCount(), 0, 'ack path leaked a listener');
  assert.equal(acked.subscribeCount, DEVICE_ACK_EVENTS.length);
  assert.equal(acked.unsubscribeCount, DEVICE_ACK_EVENTS.length);

  const timedOut = fakeChannel();
  await sendToDevice({
    channel: timedOut.channel,
    requestId: 'r1',
    publish: async () => {},
    timeoutMs: 20,
  });
  assert.equal(timedOut.liveHandlerCount(), 0, 'timeout path leaked a listener');
});

test('a failed subscribe resolves immediately instead of hanging to timeout', async () => {
  const f = fakeChannel({ failSubscribe: true });
  const started = Date.now();
  const acked = await sendToDevice({
    channel: f.channel,
    requestId: 'r1',
    publish: async () => {},
    // A long timeout: if the rejected subscribe were not handled, this would
    // take the full window rather than returning at once.
    timeoutMs: 5_000,
  });
  assert.equal(acked, false);
  assert.ok(Date.now() - started < 1_000, 'did not short-circuit on subscribe failure');
});

test('a publish failure propagates (silence and a send error are different faults)', async () => {
  const f = fakeChannel();
  await assert.rejects(
    sendToDevice({
      channel: f.channel,
      requestId: 'r1',
      publish: async () => {
        throw new Error('publish exploded');
      },
      timeoutMs: 20,
    }),
    /publish exploded/,
  );
  assert.equal(f.liveHandlerCount(), 0, 'listeners leaked when publish threw');
});

test('the phone ack carries the request id and its kind', async () => {
  const f = fakeChannel();
  await publishDeviceAck(f.channel, 'r1', 'pack_scan');
  assert.deepEqual(f.published, [
    { event: STATION_DEVICE_ACK_EVENT, data: { request_id: 'r1', kind: 'pack_scan' } },
  ]);
});

test('acking is a no-op without a channel or a request id', async () => {
  const f = fakeChannel();
  await publishDeviceAck(null, 'r1', 'pack_scan');
  await publishDeviceAck(f.channel, '', 'pack_scan');
  await publishDeviceAck(f.channel, null, 'pack_scan');
  assert.deepEqual(f.published, []);
});

/** A failed ack must never break the capture flow the operator cares about. */
test('a throwing ack publish is swallowed', async () => {
  const channel = {
    publish: async () => {
      throw new Error('offline');
    },
    subscribe: () => Promise.resolve(),
    unsubscribe: () => undefined,
  } as unknown as DeviceAckChannel;
  await assert.doesNotReject(publishDeviceAck(channel, 'r1', 'receiving_photo'));
});
