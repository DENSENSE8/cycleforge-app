import test from 'node:test';
import assert from 'node:assert/strict';
import {
  replayHeldScanOut,
  type HeldScan,
  type HeldScanOutReplayDeps,
} from './held-scan-out-replay';
import type { ScanOutCarton, ScanOutInput, ScanOutResult } from './scan-out';

const ORG = '00000000-0000-0000-0000-00000000000a';

const CARTON: ScanOutCarton = {
  shipmentId: 77,
  tracking: 'X-UNKNOWN-1',
  receivingId: null,
  orderRowId: 501,
  orderId: 'A-1',
  productTitle: null,
  sku: null,
  itemNumber: null,
  condition: null,
  quantity: 1,
  accountSource: 'eBay',
  imageUrl: null,
  orderStatus: 'shipped',
};

const DOCK_MISS: HeldScan = {
  exceptionId: 3371,
  sourceStation: 'outbound',
  staffId: 8,
  tracking: 'X-UNKNOWN-1',
  scannedAt: '2026-10-01 14:05:09',
};

interface Captured {
  resolved: string[];
  scanOuts: (ScanOutInput & { shipmentId: number })[];
  notes: [string, number, string][];
  published: [string, number, number | null, string][];
}

function fakes(opts: { shipmentId?: number | null; result?: ScanOutResult } = {}) {
  const cap: Captured = { resolved: [], scanOuts: [], notes: [], published: [] };
  const deps: HeldScanOutReplayDeps = {
    resolveShipment: async (scan) => {
      cap.resolved.push(scan);
      return opts.shipmentId === undefined ? 77 : opts.shipmentId;
    },
    scanOut: async (input) => {
      cap.scanOuts.push(input);
      return opts.result ?? { kind: 'confirmed', activityId: 9001, carton: CARTON };
    },
    noteException: async (...args) => {
      cap.notes.push(args);
    },
    publishConfirmed: async (...args) => {
      cap.published.push(args);
    },
  };
  return { deps, cap };
}

test('a resolved dock miss replays the scan-out as its original scanner, at its original instant', async () => {
  const { deps, cap } = fakes();
  const out = await replayHeldScanOut(ORG, DOCK_MISS, null, deps);

  assert.deepEqual(out, { kind: 'replayed', exceptionId: 3371, shipmentId: 77, outcome: 'confirmed', activityId: 9001 });
  assert.deepEqual(cap.resolved, ['X-UNKNOWN-1']);
  assert.deepEqual(cap.scanOuts, [
    {
      organizationId: ORG,
      scan: 'X-UNKNOWN-1',
      actorStaffId: 8,
      createdAt: '2026-10-01 14:05:09',
      origin: 'resolved-miss',
      heldExceptionId: 3371,
      shipmentId: 77,
    },
  ]);
  assert.deepEqual(cap.published, [[ORG, 9001, 8, 'X-UNKNOWN-1']]);
  assert.equal(cap.notes.length, 0);
});

test('a package-record link replays onto the linked package without re-resolving the label', async () => {
  const { deps, cap } = fakes();
  const out = await replayHeldScanOut(ORG, DOCK_MISS, 52848, deps);
  assert.equal(out.kind, 'replayed');
  assert.equal(cap.resolved.length, 0);
  assert.equal(cap.scanOuts[0]?.shipmentId, 52848);
});

test('a pack-scan exception never replays a scan-out', async () => {
  const { deps, cap } = fakes();
  const out = await replayHeldScanOut(ORG, { ...DOCK_MISS, sourceStation: 'packer' }, 52848, deps);
  assert.deepEqual(out, { kind: 'skipped', exceptionId: 3371, reason: 'not_scan_out' });
  assert.equal(cap.resolved.length, 0);
  assert.equal(cap.scanOuts.length, 0);
  assert.equal(cap.published.length, 0);
});

test('a label that still resolves no shipment writes nothing', async () => {
  const { deps, cap } = fakes({ shipmentId: null });
  const out = await replayHeldScanOut(ORG, DOCK_MISS, null, deps);
  assert.deepEqual(out, { kind: 'skipped', exceptionId: 3371, reason: 'no_shipment' });
  assert.equal(cap.scanOuts.length, 0);
});

test('a cancelled order is not scanned out; the exception carries the reason', async () => {
  const { deps, cap } = fakes({ result: { kind: 'blocked', blockReason: 'canceled', carton: CARTON } });
  const out = await replayHeldScanOut(ORG, DOCK_MISS, null, deps);
  assert.deepEqual(out, { kind: 'blocked', exceptionId: 3371, shipmentId: 77, blockReason: 'canceled' });
  assert.deepEqual(cap.notes, [
    [ORG, 3371, 'Scan-out not recorded: Order is cancelled — do not ship. Pull this package.'],
  ]);
  assert.equal(cap.published.length, 0);
});

test('a package already scanned out is a duplicate: no second event, no publish', async () => {
  const { deps, cap } = fakes({ result: { kind: 'duplicate', shipConfirmedAt: '2026-10-01 15:00:00', carton: CARTON } });
  const out = await replayHeldScanOut(ORG, DOCK_MISS, null, deps);
  assert.deepEqual(out, { kind: 'replayed', exceptionId: 3371, shipmentId: 77, outcome: 'duplicate', activityId: null });
  assert.equal(cap.published.length, 0);
  assert.equal(cap.notes.length, 0);
});
