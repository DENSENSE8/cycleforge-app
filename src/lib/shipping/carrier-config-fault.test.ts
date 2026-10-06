import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CARRIER_CREDENTIALS_MISSING,
  CarrierCredentialsMissingError,
  requireCarrierCredentials,
  carrierConfigFaults,
} from './carrier-credentials';
import { syncShipment, syncShipmentDeps, type SyncShipmentDeps } from './sync-shipment';
import type { CarrierTrackingResult, ShipmentRow } from './types';
import { runShippingSyncDueJob, type ShippingSyncDueDeps } from '@/lib/jobs/shipping-sync-due';
import type { OverdueOrderAlertResult } from './overdue-order-alerts';

const ORG = '00000000-0000-0000-0000-000000000001';
const UPS_ONLY = { UPS_CLIENT_ID: 'id', UPS_CLIENT_SECRET: 'secret' };
const BOTH = { ...UPS_ONLY, FEDEX_CLIENT_ID: 'id', FEDEX_CLIENT_SECRET: 'secret' };

const row = (over: Partial<ShipmentRow> = {}): ShipmentRow =>
  ({
    id: 182589,
    organization_id: ORG,
    tracking_number_normalized: '1Z16D1R0YW22415180',
    carrier: 'UPS',
    latest_status_category: 'LABEL_CREATED',
    is_terminal: false,
    is_delivered: false,
    consecutive_error_count: 4,
    ...over,
  }) as ShipmentRow;

/** Deps whose writers record every call; the provider answers IN_TRANSIT unless told to throw. */
function recordingDeps(env: Record<string, string>, shipment: ShipmentRow, providerError?: Error) {
  const calls = { track: 0, summary: 0, error: [] as Array<[number, string, string]>, events: 0 };
  const deps: SyncShipmentDeps = {
    ...syncShipmentDeps,
    env,
    getShipmentById: async () => shipment,
    resolveShipmentOrgId: async () => null,
    trackByNumber: async (carrier, tracking): Promise<CarrierTrackingResult> => {
      calls.track++;
      if (providerError) throw providerError;
      return { carrier, trackingNumberNormalized: tracking, latestStatusCategory: 'IN_TRANSIT', events: [], payload: {} };
    },
    upsertTrackingEvents: async () => {
      calls.events++;
      return 1;
    },
    updateShipmentSummary: async () => {
      calls.summary++;
      return 'IN_TRANSIT';
    },
    updateShipmentError: async (id, code, message) => {
      calls.error.push([id, code, message]);
    },
    publishShipmentStatusChange: async () => {},
  };
  return { deps, calls };
}

test('missing credentials: syncShipment reports a config fault and never touches the row', async () => {
  const { deps, calls } = recordingDeps({}, row());
  const result = await syncShipment({ shipmentId: 182589 }, undefined, deps);
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, CARRIER_CREDENTIALS_MISSING);
  assert.equal(result.error, 'UPS_CLIENT_ID and UPS_CLIENT_SECRET are required');
  assert.equal(calls.track, 0, 'provider not called');
  assert.deepEqual(calls.error, [], 'no consecutive_error_count / next_check_at write');
  assert.equal(calls.summary, 0);
});

test('blank credential values count as missing', async () => {
  const { deps, calls } = recordingDeps({ UPS_CLIENT_ID: '  ', UPS_CLIENT_SECRET: 'secret' }, row());
  const result = await syncShipment({ shipmentId: 182589 }, undefined, deps);
  assert.equal(result.errorCode, CARRIER_CREDENTIALS_MISSING);
  assert.deepEqual(calls.error, []);
});

test('a real per-package failure still backs the row off', async () => {
  const failure = Object.assign(new Error('UPS track failed: 500'), { code: 'HTTP_ERROR' });
  const { deps, calls } = recordingDeps(UPS_ONLY, row(), failure);
  const result = await syncShipment({ shipmentId: 182589 }, undefined, deps);
  assert.equal(result.ok, false);
  assert.deepEqual(calls.error, [[182589, 'HTTP_ERROR', 'UPS track failed: 500']]);
});

test('with credentials the poll goes through the summary writer', async () => {
  const { deps, calls } = recordingDeps(UPS_ONLY, row());
  const result = await syncShipment({ shipmentId: 182589 }, undefined, deps);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'IN_TRANSIT');
  assert.equal(calls.summary, 1);
  assert.deepEqual(calls.error, []);
});

test('the provider credential read keeps the persisted message (credential recovery matches it)', () => {
  assert.throws(
    () => requireCarrierCredentials('FEDEX', {}),
    (error: unknown) =>
      error instanceof CarrierCredentialsMissingError &&
      error.code === CARRIER_CREDENTIALS_MISSING &&
      error.message === 'FEDEX_CLIENT_ID and FEDEX_CLIENT_SECRET are required' &&
      error.missing.join() === 'FEDEX_CLIENT_ID,FEDEX_CLIENT_SECRET',
  );
  assert.deepEqual(requireCarrierCredentials('UPS', { UPS_CLIENT_ID: ' id ', UPS_CLIENT_SECRET: 'secret' }), ['id', 'secret']);
  assert.deepEqual(requireCarrierCredentials('USPS', {}), [], 'carriers without a credential list never fault');
});

test('carrierConfigFaults: one fault per carrier, upper-cased and de-duplicated', () => {
  assert.deepEqual(carrierConfigFaults(['ups', 'UPS', 'FEDEX'], UPS_ONLY), [
    { carrier: 'FEDEX', reason: 'carrier_credentials_missing', missing: ['FEDEX_CLIENT_ID', 'FEDEX_CLIENT_SECRET'] },
  ]);
  assert.deepEqual(carrierConfigFaults(['UPS', 'FEDEX'], BOTH), []);
});

function jobDeps(env: Record<string, string>) {
  const sweeps: Array<string[] | undefined> = [];
  const deps: ShippingSyncDueDeps = {
    env,
    runDueShipments: async (options) => {
      sweeps.push(options?.carriers);
      return { synced: 2, terminal: 0, errors: 0, durationMs: 1 };
    },
    emitOverdueOrderAlerts: async (): Promise<OverdueOrderAlertResult> => ({ candidates: 0, subscriptionsAdded: 0 }),
  };
  return { deps, sweeps };
}

test('sync-due job: a carrier without credentials is detected once and left out of the sweep', async () => {
  const { deps, sweeps } = jobDeps(UPS_ONLY);
  const result = await runShippingSyncDueJob({ carriers: ['UPS', 'FEDEX'] }, deps);
  assert.deepEqual(sweeps, [['UPS']], 'only the configured carrier is swept');
  assert.equal(result.ok, false);
  assert.deepEqual(result.configFaults, [
    { carrier: 'FEDEX', reason: 'carrier_credentials_missing', missing: ['FEDEX_CLIENT_ID', 'FEDEX_CLIENT_SECRET'] },
  ]);
  assert.equal(result.synced, 2);
});

test('sync-due job: no credentials at all → no sweep, so no row is selected or backed off', async () => {
  const { deps, sweeps } = jobDeps({});
  const result = await runShippingSyncDueJob({ carriers: 'UPS,FEDEX'.split(',') }, deps);
  assert.deepEqual(sweeps, []);
  assert.equal(result.ok, false);
  assert.deepEqual(result.configFaults.map((f) => f.carrier), ['UPS', 'FEDEX']);
  assert.equal(result.errors, 0);
});

test('sync-due job: healthy config sweeps every enabled carrier and reports ok', async () => {
  const { deps, sweeps } = jobDeps(BOTH);
  const result = await runShippingSyncDueJob({}, deps);
  assert.deepEqual(sweeps, [['UPS', 'FEDEX']]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.configFaults, []);
});
