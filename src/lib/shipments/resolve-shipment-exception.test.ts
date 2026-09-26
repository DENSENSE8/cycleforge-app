import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  resolveShipmentException,
  type ApplyResult,
  type CloseInput,
  type LinkOrderInput,
  type ResolveShipmentExceptionDeps,
  type ResolveTarget,
} from './resolve-shipment-exception';
import type { ResolveShipmentExceptionBody, ShipmentRecord } from './shipment-record-types';

const ORG = '00000000-0000-0000-0000-00000000000a' as OrgId;
const SHIPMENT = 52848;

interface Captured {
  claimKeys: string[];
  links: LinkOrderInput[];
  closes: CloseInput[];
  recordReads: number;
}

const RECORD = { shipmentId: SHIPMENT, tracking: '1Z23A1E90383534572' } as ShipmentRecord;

function applied(kind: 'link-order' | 'close'): ApplyResult {
  return {
    ok: true,
    applied: {
      exceptionId: 3371,
      kind,
      orderRowId: kind === 'link-order' ? 7109 : null,
      orderRef: kind === 'link-order' ? 'FBA19JY9D8PV' : null,
      linkRole: kind === 'link-order' ? 'ORDER_SPLIT' : null,
      before: { status: 'open' },
      after: { status: 'resolved' },
    },
  };
}

/** Fakes with a real in-memory idempotency store: a replayed key never re-runs `produce`. */
function fakes(opts: {
  target?: ResolveTarget | null;
  link?: ApplyResult;
  close?: ApplyResult;
} = {}) {
  const cap: Captured = { claimKeys: [], links: [], closes: [], recordReads: 0 };
  const store = new Map<string, { status: number; body: Record<string, unknown> }>();
  const target = opts.target === undefined ? { tracking: RECORD.tracking, openExceptionId: 3371 } : opts.target;
  const deps: ResolveShipmentExceptionDeps = {
    claim: async ({ orgId, key }, produce) => {
      assert.equal(orgId, ORG);
      cap.claimKeys.push(key);
      const hit = store.get(key);
      if (hit) return { ...hit, cached: true };
      const out = await produce();
      store.set(key, out);
      return { ...out, cached: false };
    },
    loadTarget: async (orgId, shipmentId) => {
      assert.equal(orgId, ORG);
      assert.equal(shipmentId, SHIPMENT);
      return target;
    },
    linkOrder: async (orgId, input) => {
      assert.equal(orgId, ORG);
      cap.links.push(input);
      return opts.link ?? applied('link-order');
    },
    close: async (orgId, input) => {
      assert.equal(orgId, ORG);
      cap.closes.push(input);
      return opts.close ?? applied('close');
    },
    getRecord: async () => {
      cap.recordReads += 1;
      return RECORD;
    },
  };
  return { deps, cap };
}

const link: ResolveShipmentExceptionBody = { kind: 'link-order', orderRowId: 7109, clientEventId: 'evt-1' };
const close: ResolveShipmentExceptionBody = { kind: 'close', reason: 'Duplicate label, box never left', clientEventId: 'evt-2' };

test('link-order links the open exception to the order and returns the fresh record', async () => {
  const { deps, cap } = fakes();
  const out = await resolveShipmentException({ orgId: ORG, staffId: 4, shipmentId: SHIPMENT, body: link }, deps);

  assert.equal(out.status, 200);
  if (out.status !== 200) return;
  assert.deepEqual(out.result, { ok: true, idempotent: false, record: RECORD });
  assert.equal(out.applied?.kind, 'link-order');
  assert.deepEqual(cap.links, [
    { shipmentId: SHIPMENT, exceptionId: 3371, orderRowId: 7109, staffId: 4, clientEventId: 'evt-1' },
  ]);
  assert.equal(cap.closes.length, 0);
  assert.deepEqual(cap.claimKeys, [`${SHIPMENT}:evt-1`]);
});

test('close resolves the open exception with the operator reason and links nothing', async () => {
  const { deps, cap } = fakes();
  const out = await resolveShipmentException({ orgId: ORG, staffId: 1, shipmentId: SHIPMENT, body: close }, deps);

  assert.equal(out.status, 200);
  if (out.status !== 200) return;
  assert.equal(out.applied?.kind, 'close');
  assert.deepEqual(cap.closes, [
    { shipmentId: SHIPMENT, exceptionId: 3371, reason: 'Duplicate label, box never left', staffId: 1 },
  ]);
  assert.equal(cap.links.length, 0);
});

test('a package with no open exception is a 409 and writes nothing', async () => {
  const { deps, cap } = fakes({ target: { tracking: RECORD.tracking, openExceptionId: null } });
  const out = await resolveShipmentException({ orgId: ORG, staffId: 1, shipmentId: SHIPMENT, body: link }, deps);

  assert.deepEqual(out, { status: 409, error: 'This package has no open exception' });
  assert.equal(cap.links.length, 0);
  assert.equal(cap.closes.length, 0);
  assert.equal(cap.recordReads, 0);
});

test('an unknown package is a 404; an unknown order is a 404; a lost race is a 409', async () => {
  const unknown = fakes({ target: null });
  assert.deepEqual(
    await resolveShipmentException({ orgId: ORG, staffId: 1, shipmentId: SHIPMENT, body: link }, unknown.deps),
    { status: 404, error: 'Package not found' },
  );
  assert.equal(unknown.cap.links.length, 0);

  const noOrder = fakes({ link: { ok: false, code: 'order_not_found' } });
  assert.deepEqual(
    await resolveShipmentException({ orgId: ORG, staffId: 1, shipmentId: SHIPMENT, body: link }, noOrder.deps),
    { status: 404, error: 'Order not found' },
  );

  const raced = fakes({ close: { ok: false, code: 'not_open' } });
  assert.deepEqual(
    await resolveShipmentException({ orgId: ORG, staffId: 1, shipmentId: SHIPMENT, body: close }, raced.deps),
    { status: 409, error: 'The exception is no longer open' },
  );
});

test('replaying the same clientEventId does not write again and reports idempotent with nothing to audit', async () => {
  const { deps, cap } = fakes();
  const args = { orgId: ORG, staffId: 4, shipmentId: SHIPMENT, body: link };
  const first = await resolveShipmentException(args, deps);
  const replay = await resolveShipmentException(args, deps);

  assert.equal(first.status, 200);
  assert.equal(replay.status, 200);
  if (first.status !== 200 || replay.status !== 200) return;
  assert.equal(first.result.idempotent, false);
  assert.notEqual(first.applied, null);
  assert.equal(replay.result.idempotent, true);
  assert.equal(replay.applied, null);
  assert.equal(cap.links.length, 1);
  assert.equal(cap.recordReads, 2);
});

test('the same clientEventId on a different package is not a replay', async () => {
  const { deps, cap } = fakes();
  await resolveShipmentException({ orgId: ORG, staffId: 4, shipmentId: SHIPMENT, body: link }, deps);
  const other: ResolveShipmentExceptionDeps = { ...deps, loadTarget: async () => ({ tracking: 'X', openExceptionId: 9 }) };
  const out = await resolveShipmentException({ orgId: ORG, staffId: 4, shipmentId: SHIPMENT + 1, body: link }, other);

  assert.equal(out.status, 200);
  if (out.status !== 200) return;
  assert.equal(out.result.idempotent, false);
  assert.equal(cap.links.length, 2);
  assert.equal(cap.links[1].exceptionId, 9);
});
