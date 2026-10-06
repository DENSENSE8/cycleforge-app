import assert from 'node:assert/strict';
import test from 'node:test';

import { carrierSyncHealthSql, summarizeCarrierSyncHealth, type CarrierSyncHealth } from './carrier-sync-health';
import { detectMetricAlerts, type ShippingTrackingMetrics } from '@/lib/jobs/shipping-metrics';
import { NavFulfilledResponseSchema } from '@/lib/nav/context/schema';
import { getNavFulfilled, type NavFulfilledDeps } from '@/lib/nav/fulfilled/service';

const ORG = '00000000-0000-0000-0000-000000000001';
const UPS_ONLY = { UPS_CLIENT_ID: 'id', UPS_CLIENT_SECRET: 'secret' };

test('summary: one entry per carrier in fixed order, zeros for carriers with no rows', () => {
  const health = summarizeCarrierSyncHealth(
    [
      { carrier: 'FEDEX', open: 294, failing_open: 294, last_ok_at: null, last_error: 'Query read timeout' },
      { carrier: 'ups', open: 152, failing_open: 150, last_ok_at: new Date('2026-10-05T21:31:57Z'), last_error: 'UPS_CLIENT_ID and UPS_CLIENT_SECRET are required' },
    ],
    UPS_ONLY,
  );
  assert.deepEqual(health, [
    {
      carrier: 'UPS',
      enabled: true,
      open: 152,
      failingOpen: 150,
      lastOkAt: '2026-10-05T21:31:57.000Z',
      configFault: false,
      lastError: 'UPS_CLIENT_ID and UPS_CLIENT_SECRET are required',
    },
    { carrier: 'FEDEX', enabled: true, open: 294, failingOpen: 294, lastOkAt: null, configFault: true, lastError: 'Query read timeout' },
    { carrier: 'USPS', enabled: false, open: 0, failingOpen: 0, lastOkAt: null, configFault: false, lastError: null },
  ]);
});

test('summary: a string timestamp from the driver normalizes to ISO', () => {
  const [ups] = summarizeCarrierSyncHealth([{ carrier: 'UPS', open: 1, failing_open: 0, last_ok_at: '2026-10-06T03:54:00+00:00', last_error: null }], UPS_ONLY);
  assert.equal(ups.lastOkAt, '2026-10-06T03:54:00.000Z');
});

test('statement: one grouped pass, org predicate only when scoped', () => {
  const scoped = carrierSyncHealthSql(true);
  assert.match(scoped, /organization_id = \$1::uuid/);
  assert.match(scoped, /GROUP BY upper\(carrier\)/);
  assert.doesNotMatch(carrierSyncHealthSql(false), /organization_id/);
});

const health = (over: Partial<CarrierSyncHealth>): CarrierSyncHealth => ({
  carrier: 'UPS',
  enabled: true,
  open: 10,
  failingOpen: 0,
  lastOkAt: '2026-10-06T07:00:00.000Z',
  configFault: false,
  lastError: null,
  ...over,
});

function metrics(carrierSync: CarrierSyncHealth[]): ShippingTrackingMetrics {
  return {
    deliveredUnscanned: 0,
    blockedTotal: 0,
    uspsBlocked: 0,
    pendingStatus: 0,
    errorStuckTotal: 0,
    outForDelivery: 0,
    inTransit: 0,
    openReceivingExceptions: 0,
    unmatchedTracking: 0,
    perCarrier: [],
    carrierSync,
  };
}

test('metrics alerts: config fault and stale sync are error-level; disabled carriers stay quiet', () => {
  const now = new Date('2026-10-06T08:00:00Z');
  const codes = detectMetricAlerts(
    metrics([
      health({ carrier: 'UPS', configFault: true }),
      health({ carrier: 'FEDEX', lastOkAt: '2026-10-05T21:56:00.000Z', failingOpen: 10 }),
      health({ carrier: 'USPS', enabled: false, lastOkAt: null, failingOpen: 10 }),
    ]),
    now,
  ).map((a) => [a.code, a.level]);
  assert.deepEqual(codes, [
    ['CARRIER_CREDENTIALS_MISSING', 'error'],
    ['CARRIER_SYNC_STALE', 'error'],
  ]);
});

test('metrics alerts: a recent successful poll is healthy; no open rows is never stale', () => {
  const now = new Date('2026-10-06T08:00:00Z');
  assert.deepEqual(detectMetricAlerts(metrics([health({}), health({ carrier: 'FEDEX', open: 0, lastOkAt: null })]), now), []);
});

test('GET /api/nav/fulfilled carries syncHealth when the read answers, and omits it when it fails', async () => {
  const base: NavFulfilledDeps = { rows: async () => [], today: () => '2026-10-06', now: () => new Date('2026-10-06T08:00:00Z') };
  const caller = { orgId: ORG, permissions: new Set(['packing.view']) };
  const carriers = [health({ failingOpen: 3, lastError: 'boom' })];

  const withHealth = await getNavFulfilled(caller, new URLSearchParams(), { ...base, syncHealth: async () => carriers });
  assert.ok(withHealth.ok);
  const parsed = NavFulfilledResponseSchema.parse(withHealth.body);
  assert.deepEqual(parsed.syncHealth, { carriers });

  const failed = await getNavFulfilled(caller, new URLSearchParams(), { ...base, syncHealth: async () => null });
  assert.ok(failed.ok);
  assert.equal('syncHealth' in failed.body, false);
});
