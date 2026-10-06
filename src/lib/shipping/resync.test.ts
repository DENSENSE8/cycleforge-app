import assert from 'node:assert/strict';
import test from 'node:test';

import type { ResyncCandidate } from './repository';
import { resyncDeps, resyncOpenShipments, type ResyncDeps } from './resync';
import { syncShipment, type SyncShipmentResult } from './sync-shipment';

const ORG_A = '00000000-0000-0000-0000-00000000000a';
const ORG_B = '00000000-0000-0000-0000-00000000000b';
const BOTH = { UPS_CLIENT_ID: 'id', UPS_CLIENT_SECRET: 'secret', FEDEX_CLIENT_ID: 'id', FEDEX_CLIENT_SECRET: 'secret' };
const OPTIONS = { carriers: ['UPS', 'FEDEX'], onlyFailing: false, tracking: null, limit: 500, concurrency: 2 };

const candidate = (over: Partial<ResyncCandidate>): ResyncCandidate => ({
  id: 1,
  organizationId: ORG_A,
  carrier: 'UPS',
  trackingNumber: '1Z16D1R0YW22415180',
  previousStatus: 'LABEL_CREATED',
  consecutiveErrorCount: 4,
  // Backed off 12h — the sweep would not touch it until then.
  nextCheckAt: '2026-10-06T14:45:18.628Z',
  ...over,
});

test('the resync writer IS the sweep writer', () => {
  assert.equal(resyncDeps.sync, syncShipment);
});

test('resync polls backed-off rows now, each under its own org, and tallies the outcome', async () => {
  const rows = [
    candidate({ id: 1 }),
    candidate({ id: 2, organizationId: ORG_B, carrier: 'FEDEX', previousStatus: null }),
    candidate({ id: 3, organizationId: null }),
  ];
  const selections: unknown[] = [];
  const polls: Array<[number, string | undefined]> = [];
  const deps: ResyncDeps = {
    env: BOTH,
    selectOpen: async (options) => {
      selections.push(options);
      return rows;
    },
    sync: async (input, orgId): Promise<SyncShipmentResult> => {
      polls.push([input.shipmentId!, orgId]);
      return input.shipmentId === 3
        ? { ok: false, shipmentId: 3, error: 'UPS track failed: 500 {\n"body"}', errorCode: 'HTTP_ERROR' }
        : { ok: true, shipmentId: input.shipmentId, status: 'IN_TRANSIT', eventsInserted: 2 };
    },
  };

  const summary = await resyncOpenShipments(OPTIONS, deps);

  assert.deepEqual(selections, [{ carriers: ['UPS', 'FEDEX'], onlyFailing: false, tracking: null, limit: 500 }]);
  assert.deepEqual(polls, [
    [1, ORG_A],
    [2, ORG_B],
    [3, undefined],
  ]);
  assert.deepEqual(summary, {
    configFaults: [],
    disabled: [],
    selected: 3,
    ok: 2,
    errors: 1,
    eventsInserted: 4,
    errorsByMessage: { 'UPS track failed: 500 {': 1 },
    transitions: { 'LABEL_CREATED → IN_TRANSIT': 1, 'NONE → IN_TRANSIT': 1 },
  });
});

test('resync: a carrier without credentials is reported once and none of its rows is selected', async () => {
  const selected: string[][] = [];
  const deps: ResyncDeps = {
    env: { UPS_CLIENT_ID: 'id', UPS_CLIENT_SECRET: 'secret' },
    selectOpen: async (options) => {
      selected.push([...options.carriers]);
      return [];
    },
    sync: async () => assert.fail('nothing to poll'),
  };
  const summary = await resyncOpenShipments({ ...OPTIONS, carriers: ['ups', 'FEDEX', 'USPS'] }, deps);
  assert.deepEqual(selected, [['UPS']]);
  assert.deepEqual(summary.configFaults, [
    { carrier: 'FEDEX', reason: 'carrier_credentials_missing', missing: ['FEDEX_CLIENT_ID', 'FEDEX_CLIENT_SECRET'] },
  ]);
  assert.deepEqual(summary.disabled, ['USPS']);
});

test('resync: no configured carrier → nothing selected, nothing polled', async () => {
  const deps: ResyncDeps = {
    env: {},
    selectOpen: async () => assert.fail('must not select'),
    sync: async () => assert.fail('must not poll'),
  };
  const summary = await resyncOpenShipments(OPTIONS, deps);
  assert.equal(summary.selected, 0);
  assert.equal(summary.configFaults.length, 2);
});
