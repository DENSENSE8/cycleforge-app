import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decideLabelLink,
  decideLabelUnlink,
  shipmentIdFromLabelId,
  type LabelLinkFacts,
} from './label-purpose';

/**
 * DB-free: which labels may be paired with an order under which purpose, and
 * which may come off again.
 * Run: node --require ./scripts/register-server-only-shim.cjs --import tsx --test src/lib/shipping/label-purpose.test.ts
 */

const ORDER = 42;

function facts(over: Partial<LabelLinkFacts> = {}): LabelLinkFacts {
  return { labelId: 'se-900', voided: false, isReturnLabel: false, ingestion: null, liveRow: null, ...over };
}

// ─── link ────────────────────────────────────────────────────────────────────

test('link: a fresh ShipStation label is created with its purpose; only a return stays off the order tracking', () => {
  for (const [purpose, linkTracking] of [['outbound', true], ['replacement', true], ['return', false]] as const) {
    assert.deepEqual(decideLabelLink(ORDER, purpose, facts()), {
      kind: 'create',
      purpose,
      resolveIngestionId: null,
      linkTracking,
    });
  }
});

test('link: the quarantined second live label resolves (LINKED) when the operator pairs it', () => {
  const decision = decideLabelLink(
    ORDER,
    'replacement',
    facts({ ingestion: { id: 7, state: 'QUARANTINED', matchedOrderId: null } }),
  );
  assert.deepEqual(decision, { kind: 'create', purpose: 'replacement', resolveIngestionId: 7, linkTracking: true });
});

test('link: a voided label is refused before anything else', () => {
  const decision = decideLabelLink(ORDER, 'return', facts({ voided: true, isReturnLabel: true }));
  assert.equal(decision.kind, 'refuse');
  if (decision.kind === 'refuse') assert.equal(decision.code, 'LABEL_VOIDED');
});

test('link: a ShipStation return label can only be a Return; a plain label may still be linked as a return', () => {
  const wrong = decideLabelLink(ORDER, 'outbound', facts({ isReturnLabel: true }));
  assert.equal(wrong.kind === 'refuse' && wrong.status, 400);
  assert.equal(decideLabelLink(ORDER, 'return', facts({ isReturnLabel: true })).kind, 'create');
  assert.equal(decideLabelLink(ORDER, 'return', facts()).kind, 'create');
});

test('link: already live on this order under the same purpose replays; another purpose or order is a 409', () => {
  const same = facts({ liveRow: { id: 11, orderId: ORDER, purpose: 'return' } });
  assert.deepEqual(decideLabelLink(ORDER, 'return', same), { kind: 'replay', rowId: 11 });

  const purpose = decideLabelLink(ORDER, 'outbound', same);
  assert.equal(purpose.kind === 'refuse' && purpose.code, 'LABEL_PURPOSE_CONFLICT');

  const elsewhere = decideLabelLink(ORDER, 'return', facts({ liveRow: { id: 11, orderId: 99, purpose: 'return' } }));
  assert.equal(elsewhere.kind === 'refuse' && elsewhere.code, 'LABEL_LINKED_ELSEWHERE');
});

test('link: an import APPLIED to another order, or mid-import, is never re-pointed', () => {
  const applied = decideLabelLink(ORDER, 'outbound', facts({ ingestion: { id: 3, state: 'APPLIED', matchedOrderId: 99 } }));
  assert.equal(applied.kind === 'refuse' && applied.code, 'LABEL_LINKED_ELSEWHERE');
  for (const state of ['MATCHED', 'APPLYING']) {
    const d = decideLabelLink(ORDER, 'outbound', facts({ ingestion: { id: 3, state, matchedOrderId: null } }));
    assert.equal(d.kind === 'refuse' && d.code, 'LABEL_IMPORT_IN_FLIGHT');
  }
  // Applied to THIS order but missing from its list: listing it is safe, nothing to resolve.
  assert.deepEqual(
    decideLabelLink(ORDER, 'outbound', facts({ ingestion: { id: 3, state: 'APPLIED', matchedOrderId: ORDER } })),
    { kind: 'create', purpose: 'outbound', resolveIngestionId: null, linkTracking: true },
  );
});

// ─── unlink ──────────────────────────────────────────────────────────────────

test('unlink: bought-here labels are voided, not unlinked; the imported primary stays', () => {
  const bought = decideLabelUnlink({ status: 'purchased', creationType: 'bought_in_app', purpose: 'return', ingestionState: null });
  assert.equal(bought.kind === 'refuse' && bought.code, 'LABEL_BOUGHT_HERE');
  const primary = decideLabelUnlink({ status: 'purchased', creationType: 'imported_shipstation', purpose: 'outbound', ingestionState: 'APPLIED' });
  assert.equal(primary.kind === 'refuse' && primary.code, 'LABEL_IS_PRIMARY_IMPORT');
});

test('unlink: a paired quarantine reopens and its tracking comes off; a return has no tracking to remove', () => {
  assert.deepEqual(
    decideLabelUnlink({ status: 'purchased', creationType: 'linked_manually', purpose: 'replacement', ingestionState: 'LINKED' }),
    { kind: 'unlink', reopenIngestion: true, unlinkTracking: true },
  );
  assert.deepEqual(
    decideLabelUnlink({ status: 'purchased', creationType: 'linked_manually', purpose: 'return', ingestionState: null }),
    { kind: 'unlink', reopenIngestion: false, unlinkTracking: false },
  );
  // An imported return (never added tracking) comes off without touching tracking.
  assert.deepEqual(
    decideLabelUnlink({ status: 'purchased', creationType: 'imported_shipstation', purpose: 'return', ingestionState: null }),
    { kind: 'unlink', reopenIngestion: false, unlinkTracking: false },
  );
  assert.deepEqual(
    decideLabelUnlink({ status: 'unlinked', creationType: 'linked_manually', purpose: 'return', ingestionState: null }),
    { kind: 'replay' },
  );
});

test('label id ↔ v1 shipment id: only `se-<digits>` maps', () => {
  assert.equal(shipmentIdFromLabelId('se-123456'), 123456);
  assert.equal(shipmentIdFromLabelId('se-'), null);
  assert.equal(shipmentIdFromLabelId('lbl_123'), null);
  assert.equal(shipmentIdFromLabelId(null), null);
});
