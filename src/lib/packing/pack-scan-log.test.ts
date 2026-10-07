import test from 'node:test';
import assert from 'node:assert/strict';
import { writePackScanLog, type PackScanLogDeps } from './pack-scan-log';
import type { CreatePackerLogInput } from './packer-log-writer';
import { PACKER_LOG_COMPLETED } from './packer-log-completion';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '11111111-1111-1111-1111-111111111111' as OrgId;
const db = {
  query: async () => {
    throw new Error('writePackScanLog writes through its deps only');
  },
} as unknown as Parameters<typeof writePackScanLog>[0];

/** The first pack happened days ago; the operator re-scans the box now. */
const FIRST_PACK_ISO = '2026-10-01T16:00:00.000Z';
const SCAN_AT = '2026-10-06 09:15:30'; // America/Los_Angeles (PDT, UTC-7)
const SCAN_AT_ISO = '2026-10-06T16:15:30.000Z';

interface Captured {
  touched: Array<{ packerLogId: number; packedBy: number; source: string }>;
  created: CreatePackerLogInput[];
}

function fakes(): { deps: PackScanLogDeps; cap: Captured } {
  const cap: Captured = { touched: [], created: [] };
  const deps: PackScanLogDeps = {
    touch: async (_db, input) => {
      cap.touched.push({ packerLogId: input.packerLogId, packedBy: input.packedBy, source: input.source });
      // The DB row keeps its first-pack created_at.
      return { id: input.packerLogId, createdAt: FIRST_PACK_ISO, completionState: PACKER_LOG_COMPLETED };
    },
    create: async (_db, input) => {
      cap.created.push(input);
      return { id: 900, createdAt: SCAN_AT_ISO, completionState: PACKER_LOG_COMPLETED };
    },
  };
  return { deps, cap };
}

const baseInput = {
  organizationId: ORG,
  scanAt: SCAN_AT,
  packedBy: 7,
  create: { shipmentId: 55, scanRef: null, trackingType: 'ORDERS', source: 'packing-logs.order' },
  rescanSource: 'packing-logs.order-rescan',
};

test('writePackScanLog: a re-scan reuses the row but its activity is stamped with the scan instant', async () => {
  const { deps, cap } = fakes();
  const out = await writePackScanLog(db, { ...baseInput, existingPackerLogId: 41 }, deps);

  assert.deepEqual(out, { packerLogId: 41, activityAt: SCAN_AT_ISO, rescan: true });
  assert.notEqual(out.activityAt, FIRST_PACK_ISO);
  assert.deepEqual(cap.touched, [{ packerLogId: 41, packedBy: 7, source: 'packing-logs.order-rescan' }]);
  assert.equal(cap.created.length, 0, 'a re-scan never inserts a second packer_logs row');
});

test('writePackScanLog: a first pack inserts the row at the scan instant', async () => {
  const { deps, cap } = fakes();
  const out = await writePackScanLog(db, { ...baseInput, existingPackerLogId: null }, deps);

  assert.deepEqual(out, { packerLogId: 900, activityAt: SCAN_AT_ISO, rescan: false });
  assert.equal(cap.touched.length, 0);
  assert.equal(cap.created.length, 1);
  assert.equal(cap.created[0].organizationId, ORG);
  assert.equal(cap.created[0].createdAt, SCAN_AT);
  assert.equal(cap.created[0].packedBy, 7);
  assert.equal(cap.created[0].shipmentId, 55);
});
