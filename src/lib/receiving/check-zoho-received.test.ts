/**
 * Unit tests for check-zoho-received (parse + classify + mirror/Zoho orchestration).
 * DB-free via injectable deps.
 *
 * Run: `npx tsx --test src/lib/receiving/check-zoho-received.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CHECK_ZOHO_RECEIVED_MAX_INPUTS,
  ZOHO_RECEIVED_LIKE_STATUSES,
  checkZohoReceived,
  isUndeterminedReason,
  isZohoReceivedLikeStatus,
  parseTrackingPaste,
  resolveVerdict,
  resolveWatchState,
  type CheckZohoReceivedDeps,
  type CheckZohoReceivedLocal,
} from './check-zoho-received';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;

/** No local lookup unless a test opts in — keeps the DB-free contract explicit. */
const NO_LOCAL: Pick<CheckZohoReceivedDeps, 'lookupLocal'> = {
  lookupLocal: async () => new Map(),
};

const local = (over: Partial<CheckZohoReceivedLocal> = {}): CheckZohoReceivedLocal => ({
  known: true,
  delivered: false,
  delivered_at: null,
  scanned: false,
  unboxed: false,
  watch: 'in_flight',
  ...over,
});

test('isZohoReceivedLikeStatus matches ZOHO_RECEIVED_LIKE SoT', () => {
  for (const s of ZOHO_RECEIVED_LIKE_STATUSES) {
    assert.equal(isZohoReceivedLikeStatus(s), true);
    assert.equal(isZohoReceivedLikeStatus(s.toUpperCase()), true);
  }
  assert.equal(isZohoReceivedLikeStatus('issued'), false);
  assert.equal(isZohoReceivedLikeStatus('cancelled'), false);
  assert.equal(isZohoReceivedLikeStatus(null), false);
  assert.equal(isZohoReceivedLikeStatus(''), false);
});

test('parseTrackingPaste splits newline/comma/whitespace and dedupes by canon', () => {
  const parsed = parseTrackingPaste('1Z999 AA1 01\n9400111899223344556677, 1Z999-AA1-01');
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.unique_count, 2);
  assert.equal(parsed.input_count, 3);
  assert.deepEqual(parsed.trackings, ['1Z999 AA1 01', '9400111899223344556677']);
});

test('parseTrackingPaste rejects empty and oversize', () => {
  assert.equal(parseTrackingPaste('  , \n').ok, false);
  const many = Array.from({ length: CHECK_ZOHO_RECEIVED_MAX_INPUTS + 1 }, (_, i) => `T${i}`).join(
    '\n',
  );
  const over = parseTrackingPaste(many);
  assert.equal(over.ok, false);
  if (over.ok) return;
  assert.match(over.error, /Too many/);
});

test('parseTrackingPaste accepts string[]', () => {
  const parsed = parseTrackingPaste(['AAA111', 'BBB222', 'AAA-111']);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.unique_count, 2);
});

test('checkZohoReceived: mirror hit received vs issued; Zoho fallback; no_match', async () => {
  const deps: CheckZohoReceivedDeps = {
    ...NO_LOCAL,
    lookupMirror: async () =>
      new Map([
        [
          'RECV1',
          {
            zoho_purchaseorder_id: 'po-1',
            zoho_purchaseorder_number: 'PO-1',
            reference_number: 'RECV1',
            status: 'received',
            ref_canon: 'RECV1',
            last_synced_at: '2026-08-01T00:00:00.000Z',
          },
        ],
        [
          'OPEN1',
          {
            zoho_purchaseorder_id: 'po-2',
            zoho_purchaseorder_number: 'PO-2',
            reference_number: 'OPEN1',
            status: 'issued',
            ref_canon: 'OPEN1',
            last_synced_at: null,
          },
        ],
        ['MISS1', null],
        ['GARBAGE', null],
      ]),
    searchZoho: async (tracking) => {
      if (tracking === 'MISS1') {
        return [
          {
            purchaseorder_id: 'po-3',
            purchaseorder_number: 'PO-3',
            reference_number: 'MISS1',
            status: 'billed',
          },
        ];
      }
      return [];
    },
  };

  const result = await checkZohoReceived(
    ORG,
    'RECV1\nOPEN1\nMISS1\nGARBAGE',
    deps,
  );
  assert.ok(!('error' in result));
  if ('error' in result) return;

  assert.equal(result.received_in_zoho.length, 2);
  assert.deepEqual(
    result.received_in_zoho.map((r) => r.tracking).sort(),
    ['MISS1', 'RECV1'],
  );
  // Only the genuinely-open PO lands in "not received" — the unidentifiable one
  // is a separate answer.
  assert.deepEqual(result.not_received_in_zoho.map((r) => r.tracking), ['OPEN1']);
  const open = result.not_received_in_zoho[0]!;
  assert.equal(open.status, 'issued');
  assert.equal(open.reason, 'matched');
  assert.deepEqual(result.undetermined.map((r) => r.tracking), ['GARBAGE']);
  assert.equal(result.undetermined[0]!.reason, 'no_match');
  assert.equal(result.stats.mirror_hits, 2);
  assert.equal(result.stats.zoho_lookups, 2);
  assert.equal(result.stats.undetermined, 1);
  // Mirror-sourced rows disclose their cache age; live ones have none to disclose.
  assert.equal(
    result.received_in_zoho.find((r) => r.tracking === 'RECV1')!.synced_at,
    '2026-08-01T00:00:00.000Z',
  );
  assert.equal(result.received_in_zoho.find((r) => r.tracking === 'MISS1')!.synced_at, null);
});

test('a Zoho outage reports UNDETERMINED, never "not received"', async () => {
  const result = await checkZohoReceived(ORG, 'AMB1\nERR1', {
    ...NO_LOCAL,
    lookupMirror: async () =>
      new Map([
        ['AMB1', 'ambiguous'],
        ['ERR1', null],
      ]),
    searchZoho: async () => {
      throw new Error('zoho down');
    },
  });
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.received_in_zoho.length, 0);
  // The regression this bucket exists to prevent: an unreachable ERP must not
  // produce a list an operator would act on as "still open with the vendor".
  assert.equal(result.not_received_in_zoho.length, 0);
  assert.equal(result.undetermined.length, 2);
  assert.equal(result.undetermined.find((r) => r.tracking === 'AMB1')?.reason, 'ambiguous');
  assert.equal(result.undetermined.find((r) => r.tracking === 'ERR1')?.reason, 'error');
  assert.equal(result.stats.errors, 1);
  assert.equal(result.stats.undetermined, 2);
  for (const row of result.undetermined) assert.equal(row.verdict, 'unknown');
});

test('checkZohoReceived: zoho_cap is undetermined, not not-received', async () => {
  const trackings = ['A1', 'B2', 'C3'];
  const result = await checkZohoReceived(ORG, trackings.join('\n'), {
    ...NO_LOCAL,
    lookupMirror: async () => new Map(trackings.map((t) => [t, null] as const)),
    searchZoho: async () => [],
    maxZohoLookups: 1,
  });
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.stats.zoho_lookups, 1);
  assert.equal(result.undetermined.filter((r) => r.reason === 'zoho_cap').length, 2);
  assert.equal(result.not_received_in_zoho.length, 0);
});

test('checkZohoReceived: empty paste returns error object', async () => {
  const result = await checkZohoReceived(ORG, '  \n  ');
  assert.ok('error' in result);
});

test('isUndeterminedReason: only `matched` is a real answer', () => {
  assert.equal(isUndeterminedReason('matched'), false);
  for (const r of ['no_match', 'ambiguous', 'error', 'zoho_cap'] as const) {
    assert.equal(isUndeterminedReason(r), true);
  }
});

test('resolveWatchState maps to the lane that owns the tracking today', () => {
  assert.equal(
    resolveWatchState({ known: false, delivered: false, scanned: false, unboxed: false }),
    'unknown',
  );
  assert.equal(
    resolveWatchState({ known: true, delivered: false, scanned: false, unboxed: false }),
    'in_flight',
  );
  assert.equal(
    resolveWatchState({ known: true, delivered: true, scanned: false, unboxed: false }),
    'delivered_unscanned',
  );
  assert.equal(
    resolveWatchState({ known: true, delivered: true, scanned: true, unboxed: false }),
    'delivered_not_unboxed',
  );
  // Unboxed wins outright — both delivered lanes exclude it.
  assert.equal(
    resolveWatchState({ known: true, delivered: true, scanned: false, unboxed: true }),
    'done',
  );
});

test('resolveVerdict: the ERP × warehouse cross-product', () => {
  const done = local({ unboxed: true, watch: 'done' });
  const notDone = local({ delivered: true, watch: 'delivered_unscanned' });

  assert.equal(resolveVerdict({ reason: 'matched', status: 'received', local: done }), 'settled');
  // The state no continuous feed reports.
  assert.equal(
    resolveVerdict({ reason: 'matched', status: 'billed', local: notDone }),
    'erp_ahead',
  );
  assert.equal(
    resolveVerdict({ reason: 'matched', status: 'issued', local: done }),
    'warehouse_ahead',
  );
  assert.equal(resolveVerdict({ reason: 'matched', status: 'issued', local: notDone }), 'open');
  // An undetermined ERP answer can never yield a verdict, whatever the warehouse says.
  assert.equal(resolveVerdict({ reason: 'error', status: null, local: done }), 'unknown');
  assert.equal(resolveVerdict({ reason: 'zoho_cap', status: null, local: notDone }), 'unknown');
});

test('checkZohoReceived: local state joins onto rows and drives the verdict', async () => {
  const result = await checkZohoReceived(ORG, 'RECV1\nRECV2', {
    lookupMirror: async () =>
      new Map([
        [
          'RECV1',
          {
            zoho_purchaseorder_id: 'po-1',
            zoho_purchaseorder_number: 'PO-1',
            reference_number: 'RECV1',
            status: 'received',
            ref_canon: 'RECV1',
            last_synced_at: null,
          },
        ],
        [
          'RECV2',
          {
            zoho_purchaseorder_id: 'po-2',
            zoho_purchaseorder_number: 'PO-2',
            reference_number: 'RECV2',
            status: 'received',
            ref_canon: 'RECV2',
            last_synced_at: null,
          },
        ],
      ]),
    lookupLocal: async () =>
      new Map([
        ['RECV1', local({ unboxed: true, delivered: true, scanned: true, watch: 'done' })],
        ['RECV2', local({ delivered: true, watch: 'delivered_unscanned' })],
      ]),
  });
  assert.ok(!('error' in result));
  if ('error' in result) return;

  // Both are "received in Zoho" — the bucket is unchanged. What separates them
  // is the warehouse half, which is exactly the unification this check adds.
  assert.equal(result.received_in_zoho.length, 2);
  const settled = result.received_in_zoho.find((r) => r.tracking === 'RECV1')!;
  const orphan = result.received_in_zoho.find((r) => r.tracking === 'RECV2')!;
  assert.equal(settled.verdict, 'settled');
  assert.equal(orphan.verdict, 'erp_ahead');
  assert.equal(orphan.local?.watch, 'delivered_unscanned');
  assert.equal(result.stats.erp_ahead, 1);
  assert.equal(result.stats.warehouse_ahead, 0);
});

test('a failing local lookup degrades to unknown — it never fails the check', async () => {
  const result = await checkZohoReceived(ORG, 'RECV1', {
    lookupMirror: async () =>
      new Map([
        [
          'RECV1',
          {
            zoho_purchaseorder_id: 'po-1',
            zoho_purchaseorder_number: 'PO-1',
            reference_number: 'RECV1',
            status: 'received',
            ref_canon: 'RECV1',
            last_synced_at: null,
          },
        ],
      ]),
    lookupLocal: async () => {
      throw new Error('db down');
    },
  });
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.received_in_zoho.length, 1);
  // A failed lookup is NOT "no warehouse record" — it is no answer at all, so
  // the row carries a null local half and no verdict is claimed.
  assert.equal(result.received_in_zoho[0]!.local, null);
  assert.equal(result.received_in_zoho[0]!.verdict, 'unknown');
  assert.equal(result.stats.erp_ahead, 0);
});

test('looked-up-and-absent DOES resolve — it is evidence, unlike a failed lookup', async () => {
  const result = await checkZohoReceived(ORG, 'RECV1', {
    lookupMirror: async () =>
      new Map([
        [
          'RECV1',
          {
            zoho_purchaseorder_id: 'po-1',
            zoho_purchaseorder_number: 'PO-1',
            reference_number: 'RECV1',
            status: 'received',
            ref_canon: 'RECV1',
            last_synced_at: null,
          },
        ],
      ]),
    // Lookup succeeded and returned nothing for this tracking.
    lookupLocal: async () => new Map(),
  });
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.received_in_zoho[0]!.local?.known, false);
  assert.equal(result.received_in_zoho[0]!.verdict, 'erp_ahead');
  assert.equal(result.stats.erp_ahead, 1);
});
