/** Carrier scan stamps → true instants. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { upsActivityInstant, uspsEventInstant, isoStampInstant } from './carrier-event-instant';
import { parseUPSTrackingPayload } from './providers/ups';
import { parseFedExTrackingPayload } from './providers/fedex';
import { parseUSPSTrackingPayload } from './providers/usps';

const upsFixture = JSON.parse(
  readFileSync(path.join(__dirname, 'providers/fixtures/ups-track-1Z23A1E90339190802.json'), 'utf8'),
);

test('UPS: live 43308 payload parses the MP scan at its true instant, identity unchanged', () => {
  const result = parseUPSTrackingPayload(upsFixture);
  assert.ok(result);
  assert.equal(result.events.length, 1);
  const [mp] = result.events;
  assert.equal(mp.externalStatusCode, 'MP');
  assert.equal(mp.eventOccurredAt, '2026-07-23T18:40:34.000Z');
  // external_event_id of the row already stored for this scan — a re-sync must
  // hit the same dedupe key once the backfill corrects event_occurred_at.
  assert.equal(mp.externalEventId, 'MP:2026-07-23T11:40:34.000Z');
  assert.equal(result.latestEventAt, '2026-07-23T18:40:34.000Z');
});

test('UPS: a typeless currentStatus ("160 · We Have Your Package") reads the newest activity, never UNKNOWN', () => {
  // Live 1Z16D1R0YW22415180 on 2026-10-06: currentStatus has code + words, no type.
  const result = parseUPSTrackingPayload({
    trackResponse: {
      shipment: [
        {
          package: [
            {
              trackingNumber: '1Z16D1R0YW22415180',
              currentStatus: { description: 'We Have Your Package', code: '160' },
              activity: [
                {
                  location: { address: { city: 'Anaheim', stateProvince: 'CA' } },
                  status: { type: 'I', description: 'Arrived at Facility', code: 'OR', statusCode: '160' },
                  gmtDate: '20261006',
                  gmtTime: '03:54:02',
                },
                { status: { type: 'M', description: 'Shipper created a label', code: 'MP' }, gmtDate: '20261002', gmtTime: '22:19:52' },
              ],
            },
          ],
        },
      ],
    },
  });
  assert.ok(result);
  assert.equal(result.latestStatusCategory, 'IN_TRANSIT');
});

test('UPS: gmtDate/gmtTime win; local date/time + gmtOffset is the fallback', () => {
  const act = { date: '20260723', time: '114034', gmtDate: '20260723', gmtTime: '18:40:34', gmtOffset: '-07:00' };
  assert.equal(upsActivityInstant(act), '2026-07-23T18:40:34.000Z');
  // No GMT pair: the local clock at its offset (Eastern, crossing midnight UTC).
  assert.equal(
    upsActivityInstant({ date: '20260528', time: '214750', gmtOffset: '-04:00' }),
    '2026-05-29T01:47:50.000Z',
  );
});

test('UPS: no zone at all reads the local clock in the warehouse zone (DST-aware)', () => {
  assert.equal(upsActivityInstant({ date: '20260528', time: '174750' }), '2026-05-29T00:47:50.000Z');
  assert.equal(upsActivityInstant({ date: '20260115', time: '090000' }), '2026-01-15T17:00:00.000Z');
  assert.equal(upsActivityInstant({ date: '2026', time: '090000' }), null);
});

test('FedEx: offset-bearing stamps as given; date-only pickups in the warehouse zone', () => {
  const payload = {
    output: {
      completeTrackResults: [
        {
          trackingNumber: '123456789012',
          trackResults: [
            {
              trackingNumberInfo: { trackingNumber: '123456789012' },
              latestStatusDetail: { code: 'IT', description: 'In transit' },
              scanEvents: [
                { date: '2026-05-15T17:39:53-05:00', eventType: 'IT', eventDescription: 'In transit' },
                { date: '2026-06-12T00:00:00', eventType: 'PU', eventDescription: 'Picked up' },
              ],
              dateAndTimes: [{ type: 'ACTUAL_DELIVERY', dateTime: '2026-06-14T10:05:00-07:00' }],
            },
          ],
        },
      ],
    },
  };
  const result = parseFedExTrackingPayload(payload);
  assert.ok(result);
  assert.equal(result.events[0].eventOccurredAt, '2026-05-15T22:39:53.000Z');
  assert.equal(result.events[1].eventOccurredAt, '2026-06-12T07:00:00.000Z');
  // FedEx identity embeds the raw carrier string, not a parsed instant.
  assert.equal(result.events[1].externalEventId, 'PU:2026-06-12T00:00:00');
  assert.equal(result.deliveredAt, '2026-06-14T17:05:00.000Z');
  assert.equal(isoStampInstant('not a date'), null);
});

test('FedEx: a GS1 scanner envelope resolves to the existing carrier identity', () => {
  const payload = {
    output: {
      completeTrackResults: [{
        trackingNumber: '9621091390008524261900383825682187',
        trackResults: [{
          trackingNumberInfo: { trackingNumber: '9621091390008524261900383825682187' },
          latestStatusDetail: { code: 'DL', description: 'Delivered' },
          scanEvents: [],
          dateAndTimes: [{ type: 'ACTUAL_DELIVERY', dateTime: '2026-09-26T12:00:00-07:00' }],
        }],
      }],
    },
  };

  const result = parseFedExTrackingPayload(payload);
  assert.ok(result);
  assert.equal(result.trackingNumberNormalized, '383825682187');
  assert.equal(result.latestStatusCategory, 'DELIVERED');
});

test('USPS v3: GMTTimestamp wins; eventTimestamp + GMTOffset is the fallback; eventType is the text', () => {
  // Live lane row 43998 (tracking v3 `trackingEvents[]` shape).
  const stored = {
    eventZIP: '92101', GMTOffset: '-07:00', eventCity: 'SAN DIEGO', eventCode: 'SF',
    eventType: 'Departed Post Office', eventState: 'CA',
    GMTTimestamp: '2026-06-09T02:40:22Z', eventTimestamp: '2026-06-08T19:40:00',
  };
  assert.equal(uspsEventInstant(stored), '2026-06-09T02:40:22.000Z');
  const { GMTTimestamp: _gmt, ...noGmt } = stored;
  assert.equal(uspsEventInstant(noGmt), '2026-06-09T02:40:00.000Z');

  const result = parseUSPSTrackingPayload({ trackingNumber: '9400100000000000000000', trackingEvents: [stored] });
  assert.ok(result);
  const [ev] = result.events;
  assert.equal(ev.eventOccurredAt, '2026-06-09T02:40:22.000Z');
  assert.equal(ev.externalEventId, 'SF:2026-06-09T02:40:22.000Z');
  assert.equal(ev.externalStatusDescription, 'Departed Post Office');
});
