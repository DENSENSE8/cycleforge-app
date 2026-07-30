/**
 * Unit tests for claim-deadline escalation (Phase 4 of
 * docs/todo/ebay-delivered-not-unboxed-PLAN.md). DB-free, and creates no tickets.
 *
 * Load-bearing assertions:
 *   1. eBay-only — a vendor PO (claim_by_date NULL) is never escalated,
 *   2. the flag defaults to report-only, so a deploy files nothing,
 *   3. one ticket per line, ever (existing-ticket skip + date-free idempotency key),
 *   4. expired claims are still surfaced, not silently dropped,
 *   5. the per-run clamp is reported, never silent,
 *   6. a single provider failure does not abort the remaining deadlines,
 *   7. civil-date math does not drift by a day.
 *
 * Run: `npx tsx --test src/lib/receiving/claims-escalation.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CLAIM_DUE_LEAD_DAYS,
  CLAIMS_ESCALATION_MAX_PER_RUN,
  daysUntilClaimDeadline,
  escalationAnchor,
  escalationIdempotencyKey,
  escalationNote,
  escalationSubject,
  runClaimsEscalationForOrg,
  selectEscalationCandidates,
} from './claims-escalation';
import type { DeliveredNotUnboxedItem } from './delivered-not-unboxed';

const ORG = 'org-1' as never;
const TODAY = '2026-07-29';

function item(over: Partial<DeliveredNotUnboxedItem> = {}): DeliveredNotUnboxedItem {
  return {
    receiving_line_id: 1,
    receiving_id: 10,
    shipment_id: 5,
    carrier: 'USPS',
    tracking_number_raw: '9400111899223197428490',
    delivered_at: '2026-07-01 09:00:00-07',
    zoho_purchaseorder_id: null,
    po_number: null,
    vendor_name: null,
    expected_delivery_date: null,
    po_date: null,
    item_name: 'Bose QC35',
    sku: 'SKU-1',
    workflow_status: 'ARRIVED',
    was_scanned: false,
    age_band: 'gt_48h',
    claim_by_date: '2026-08-01', // 3 days out
    ...over,
  };
}

function fakes(over: Record<string, unknown> = {}) {
  const created: Array<Record<string, unknown>> = [];
  return {
    created,
    deps: {
      listLane: async () => [] as DeliveredNotUnboxedItem[],
      findExistingTicket: async () => false,
      createTicket: async (args: Record<string, unknown>) => {
        created.push(args);
        return { supportTicketId: 1, providerTicketId: 2 };
      },
      today: () => TODAY,
      ...over,
    } as never,
  };
}

// ── 7. civil-date math ────────────────────────────────────────────────────────

test('daysUntilClaimDeadline is exact and signed, with no UTC drift', () => {
  assert.equal(daysUntilClaimDeadline('2026-07-29', '2026-07-29'), 0);
  assert.equal(daysUntilClaimDeadline('2026-08-01', '2026-07-29'), 3);
  assert.equal(daysUntilClaimDeadline('2026-07-24', '2026-07-29'), -5);
  // Across a month boundary and a DST shift — still whole days.
  assert.equal(daysUntilClaimDeadline('2026-11-10', '2026-10-31'), 10);
});

// ── 1. eBay-only ──────────────────────────────────────────────────────────────

test('a vendor-PO line (claim_by_date NULL) is never a candidate', () => {
  const picked = selectEscalationCandidates([item({ claim_by_date: null })], TODAY);
  assert.deepEqual(picked, []);
});

test('an eBay line outside the lead window is not yet a candidate', () => {
  // 10 days out, lead is 5.
  const picked = selectEscalationCandidates([item({ claim_by_date: '2026-08-08' })], TODAY);
  assert.deepEqual(picked, []);
});

test('a line exactly at the lead boundary IS a candidate', () => {
  const boundary = '2026-08-03'; // exactly CLAIM_DUE_LEAD_DAYS out
  assert.equal(daysUntilClaimDeadline(boundary, TODAY), CLAIM_DUE_LEAD_DAYS);
  assert.equal(selectEscalationCandidates([item({ claim_by_date: boundary })], TODAY).length, 1);
});

// ── 4. expired claims still surface ───────────────────────────────────────────

test('an already-expired claim is still escalated, most-urgent first', () => {
  const picked = selectEscalationCandidates(
    [
      item({ receiving_line_id: 1, claim_by_date: '2026-08-01' }), // +3
      item({ receiving_line_id: 2, claim_by_date: '2026-07-20' }), // -9 (expired)
      item({ receiving_line_id: 3, claim_by_date: '2026-07-30' }), // +1
    ],
    TODAY,
  );
  assert.deepEqual(
    picked.map((c) => c.receivingLineId),
    [2, 3, 1],
    'most negative (most overdue) first',
  );
  assert.equal(picked[0].daysRemaining, -9);
});

test('copy distinguishes expired from closing-soon', () => {
  const [soon] = selectEscalationCandidates([item({ claim_by_date: '2026-08-01' })], TODAY);
  const [gone] = selectEscalationCandidates([item({ claim_by_date: '2026-07-20' })], TODAY);
  assert.match(escalationSubject(soon), /closes in 3d/);
  assert.match(escalationSubject(gone), /EXPIRED/);
  assert.match(escalationNote(gone), /closed on 2026-07-20 \(9 day\(s\) ago\)/);
  // The note must carry enough to act without opening the app.
  assert.match(escalationNote(soon), /Tracking: 9400111899223197428490/);
  assert.match(escalationNote(soon), /Receiving line: 1/);
});

// ── anchor precedence ─────────────────────────────────────────────────────────

test('anchor prefers the carton, falls back to tracking, then null', () => {
  const [withCarton] = selectEscalationCandidates([item()], TODAY);
  assert.deepEqual(escalationAnchor(withCarton), {
    type: 'receiving',
    receivingId: 10,
    lineId: 1,
  });

  const [noCarton] = selectEscalationCandidates([item({ receiving_id: null })], TODAY);
  assert.deepEqual(escalationAnchor(noCarton), {
    type: 'tracking',
    trackingNumber: '9400111899223197428490',
  });

  const [bare] = selectEscalationCandidates(
    [item({ receiving_id: null, tracking_number_raw: null })],
    TODAY,
  );
  assert.equal(escalationAnchor(bare), null, 'still filed, just unanchored');
});

// ── 3. one ticket per line, ever ──────────────────────────────────────────────

test('idempotency key is line-scoped and carries no date', () => {
  const key = escalationIdempotencyKey(42);
  assert.equal(key, 'receiving-claim-escalation:42');
  // A date in the key would file a fresh ticket every day the carton sits due.
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(key));
  assert.equal(escalationIdempotencyKey(42), key, 'stable across calls');
});

test('a line that already has a ticket is skipped, not re-filed', async () => {
  const { created, deps } = fakes({
    listLane: async () => [item()],
    findExistingTicket: async () => true,
  });
  const s = await runClaimsEscalationForOrg(ORG, { enabled: true }, deps);
  assert.equal(s.candidates, 1);
  assert.equal(s.alreadyTicketed, 1);
  assert.equal(s.created, 0);
  assert.deepEqual(created, []);
});

test('a live run files one ticket carrying the idempotency key and anchor', async () => {
  const { created, deps } = fakes({ listLane: async () => [item()] });
  const s = await runClaimsEscalationForOrg(ORG, { enabled: true }, deps);
  assert.equal(s.created, 1);
  assert.equal(s.reportOnly, false);
  assert.equal(created.length, 1);
  assert.equal(created[0].idempotencyKey, 'receiving-claim-escalation:1');
  assert.deepEqual(created[0].anchor, { type: 'receiving', receivingId: 10, lineId: 1 });
});

// ── 2. report-only by default ─────────────────────────────────────────────────

test('flag OFF reports what it would file but creates nothing', async () => {
  const { created, deps } = fakes({ listLane: async () => [item()] });
  const s = await runClaimsEscalationForOrg(ORG, { enabled: false }, deps);
  assert.equal(s.reportOnly, true);
  // `created` is "would create" — same field so dry and live runs compare directly.
  assert.equal(s.created, 1);
  assert.deepEqual(created, [], 'no ticket may be filed while the flag is off');
});

test('dryRun forces report-only even with the flag ON', async () => {
  const { created, deps } = fakes({ listLane: async () => [item()] });
  const s = await runClaimsEscalationForOrg(ORG, { dryRun: true, enabled: true }, deps);
  assert.equal(s.reportOnly, true);
  assert.deepEqual(created, []);
});

// ── 5. the clamp is reported ──────────────────────────────────────────────────

test('the per-run clamp is counted, not silent', async () => {
  const many = Array.from({ length: CLAIMS_ESCALATION_MAX_PER_RUN + 7 }, (_, i) =>
    item({ receiving_line_id: i + 1 }),
  );
  const { created, deps } = fakes({ listLane: async () => many });
  const s = await runClaimsEscalationForOrg(ORG, { enabled: true }, deps);
  assert.equal(s.candidates, many.length);
  assert.equal(s.created, CLAIMS_ESCALATION_MAX_PER_RUN);
  assert.equal(s.clamped, 7, 'the dropped remainder must be reported');
  assert.equal(created.length, CLAIMS_ESCALATION_MAX_PER_RUN);
});

// ── 6. one failure does not abort the rest ────────────────────────────────────

test('a failing ticket create does not stop the other deadlines', async () => {
  const created: number[] = [];
  const deps = {
    listLane: async () => [
      item({ receiving_line_id: 1, claim_by_date: '2026-07-30' }),
      item({ receiving_line_id: 2, claim_by_date: '2026-07-31' }),
      item({ receiving_line_id: 3, claim_by_date: '2026-08-01' }),
    ],
    findExistingTicket: async () => false,
    createTicket: async (args: { idempotencyKey: string }) => {
      const id = Number(args.idempotencyKey.split(':')[1]);
      if (id === 2) throw new Error('helpdesk 503');
      created.push(id);
      return { supportTicketId: id, providerTicketId: id };
    },
    today: () => TODAY,
  } as never;

  const s = await runClaimsEscalationForOrg(ORG, { enabled: true }, deps);
  assert.equal(s.errors, 1);
  assert.equal(s.created, 2);
  assert.deepEqual(created, [1, 3], 'line 3 must still be attempted after 2 failed');
});

test('an empty lane is a clean no-op', async () => {
  const { created, deps } = fakes();
  const s = await runClaimsEscalationForOrg(ORG, { enabled: true }, deps);
  assert.equal(s.laneSize, 0);
  assert.equal(s.candidates, 0);
  assert.equal(s.created, 0);
  assert.deepEqual(created, []);
});
