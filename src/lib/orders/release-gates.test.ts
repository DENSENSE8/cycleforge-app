import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateReleaseGates,
  isCaged,
  isReleased,
  type ReleaseGateFacts,
} from './release-gates';

/** The all-green baseline; each case below breaks exactly one thing. */
const GREEN: ReleaseGateFacts = {
  orderNumber: '111-2223334-4445556',
  itemNumber: '404912345678',
  trackingNumber: '9400111899223344556677',
  linkedDocumentCount: 1,
  docsNotRequired: false,
  shippingLabelLinked: true,
  shippingLabelPurchased: false,
  skuCatalogId: 741,
};

function gate(facts: ReleaseGateFacts, id: 'G1' | 'G2' | 'G3' | 'G4') {
  const found = evaluateReleaseGates(facts).gates.find((g) => g.id === id);
  assert.ok(found, `gate ${id} present`);
  return found;
}

test('all four gates green → canRelease', () => {
  const result = evaluateReleaseGates(GREEN);
  assert.equal(result.canRelease, true);
  assert.equal(result.failing.length, 0);
  assert.deepEqual(result.gates.map((g) => g.id), ['G1', 'G2', 'G3', 'G4']);
  assert.ok(result.gates.every((g) => g.reason === null), 'a passed gate carries no reason');
});

// ── G1 identity triangle ────────────────────────────────────────────────────

test('G1 fails when the item number is missing', () => {
  const g = gate({ ...GREEN, itemNumber: null }, 'G1');
  assert.equal(g.passed, false);
  assert.match(g.reason ?? '', /item number/);
});

test('G1 fails when the order number is missing', () => {
  assert.equal(gate({ ...GREEN, orderNumber: '' }, 'G1').passed, false);
});

test('G1 fails when the tracking number is missing', () => {
  assert.equal(gate({ ...GREEN, trackingNumber: undefined }, 'G1').passed, false);
});

test('G1 treats whitespace as absence', () => {
  const g = gate({ ...GREEN, itemNumber: '   ' }, 'G1');
  assert.equal(g.passed, false, 'a blank item number is not an item number');
});

test('G1 names every missing corner, not just the first', () => {
  const g = gate({ ...GREEN, itemNumber: null, trackingNumber: null }, 'G1');
  assert.match(g.reason ?? '', /item number/);
  assert.match(g.reason ?? '', /tracking number/);
});

// ── G2 documents: linked vs exempt ──────────────────────────────────────────

test('G2 passes on a linked document', () => {
  assert.equal(gate({ ...GREEN, linkedDocumentCount: 2, docsNotRequired: false }, 'G2').passed, true);
});

test('G2 passes on the explicit "does not require documents" exemption', () => {
  assert.equal(gate({ ...GREEN, linkedDocumentCount: 0, docsNotRequired: true }, 'G2').passed, true);
});

test('G2 fails with no documents and no exemption', () => {
  const g = gate({ ...GREEN, linkedDocumentCount: 0, docsNotRequired: false }, 'G2');
  assert.equal(g.passed, false);
  assert.match(g.reason ?? '', /does not require documents/);
});

test('G2 fails when the document count is unknown — absence, not assumption', () => {
  assert.equal(gate({ ...GREEN, linkedDocumentCount: null, docsNotRequired: null }, 'G2').passed, false);
});

// ── G3 shipping: linked vs bought ───────────────────────────────────────────

test('G3 passes on a linked label', () => {
  assert.equal(
    gate({ ...GREEN, shippingLabelLinked: true, shippingLabelPurchased: false }, 'G3').passed,
    true,
  );
});

test('G3 passes on a purchased label', () => {
  assert.equal(
    gate({ ...GREEN, shippingLabelLinked: false, shippingLabelPurchased: true }, 'G3').passed,
    true,
  );
});

test('G3 passes on a linked TRACKING number with no label document', () => {
  // Operator ruling 2026-08-31. A tracking number reaches an order through
  // `shipment_id` because a label was bought or attached, so the paperwork not
  // having been filed as a document is not a reason to hold the cage shut.
  assert.equal(
    gate(
      { ...GREEN, shippingLabelLinked: false, shippingLabelPurchased: false },
      'G3',
    ).passed,
    true,
  );
});

test('G3 fails only when there is no label AND no tracking', () => {
  const g = gate(
    {
      ...GREEN,
      trackingNumber: null,
      shippingLabelLinked: false,
      shippingLabelPurchased: false,
    },
    'G3',
  );
  assert.equal(g.passed, false);
  assert.match(g.reason ?? '', /buy one/);
});

test('G3 is implied by G1 — it can never be the only failure', () => {
  // The stated consequence of the ruling, pinned so a later edit that makes G3
  // independent again has to do it deliberately.
  for (const facts of [
    GREEN,
    { ...GREEN, shippingLabelLinked: false, shippingLabelPurchased: false },
    { ...GREEN, trackingNumber: null, shippingLabelLinked: false, shippingLabelPurchased: false },
  ] as ReleaseGateFacts[]) {
    const failing = evaluateReleaseGates(facts).failing.map((g) => g.id);
    if (failing.includes('G3')) {
      assert.ok(failing.includes('G1'), 'G3 failed without G1 — G3 is independent again');
    }
  }
});

// ── G4 SKU pairing (operator ruling 2026-08-31, R-FLOW-1) ───────────────────

test('G4 passes on a paired catalog id', () => {
  assert.equal(gate({ ...GREEN, skuCatalogId: 1 }, 'G4').passed, true);
});

test('G4 fails when unpaired — null and unknown land on the same side', () => {
  const g = gate({ ...GREEN, skuCatalogId: null }, 'G4');
  assert.equal(g.passed, false);
  assert.match(g.reason ?? '', /catalog SKU/);
  assert.equal(gate({ ...GREEN, skuCatalogId: undefined }, 'G4').passed, false);
});

test('G4 alone holds the cage shut — pairing is a real gate now', () => {
  // This is the behaviour the 2026-08-31 flow ruling adds. The old note that
  // pairing "is NOT a gate at all" is superseded (R-FLOW-1).
  const result = evaluateReleaseGates({ ...GREEN, skuCatalogId: null });
  assert.equal(result.canRelease, false);
  assert.deepEqual(result.failing.map((g) => g.id), ['G4']);
});

// ── The matrix as a whole ───────────────────────────────────────────────────

test('an empty order fails all four and reports all four', () => {
  const result = evaluateReleaseGates({});
  assert.equal(result.canRelease, false);
  assert.equal(result.failing.length, 4, 'every failure is named, not just the first');
  assert.deepEqual(result.failing.map((g) => g.id), ['G1', 'G2', 'G3', 'G4']);
});

test('one red gate is enough to hold the cage shut', () => {
  // The label-only break used to be the third case here. It is not a break any
  // more — see the test below — and that is the behaviour change of the
  // 2026-08-31 ruling, stated rather than quietly dropped from this list.
  for (const broken of [
    { itemNumber: null },
    { linkedDocumentCount: 0, docsNotRequired: false },
    { skuCatalogId: null },
  ] satisfies Partial<ReleaseGateFacts>[]) {
    const result = evaluateReleaseGates({ ...GREEN, ...broken });
    assert.equal(result.canRelease, false, `${JSON.stringify(broken)} must not release`);
    assert.equal(result.failing.length, 1, 'exactly the broken gate is failing');
  }
});

test('a missing label alone no longer cages an order that HAS tracking', () => {
  // Operator ruling 2026-08-31: the tracking number is the label. Before it,
  // this exact fact set was caged on G3 while carrying a tracking number that
  // only exists because a label was bought or attached.
  const result = evaluateReleaseGates({
    ...GREEN,
    shippingLabelLinked: false,
    shippingLabelPurchased: false,
  });
  assert.equal(result.canRelease, true, 'tracking present ⇒ G3 green ⇒ releasable');
  assert.equal(result.failing.length, 0);
});

test('evaluation is pure — same facts, same verdict, input untouched', () => {
  const facts: ReleaseGateFacts = { ...GREEN };
  const first = evaluateReleaseGates(facts);
  const second = evaluateReleaseGates(facts);
  assert.deepEqual(first, second);
  assert.deepEqual(facts, GREEN, 'the caller’s facts are not mutated');
});

// ── NULL release_state is RELEASED, not caged ───────────────────────────────

test('unknown release state reads as released — the queue must not empty', () => {
  assert.equal(isReleased(null), true);
  assert.equal(isReleased(undefined), true);
  assert.equal(isReleased(''), true);
  assert.equal(isReleased('released'), true);
  assert.equal(isCaged(null), false);
});

test('only an explicit caged stamp cages a row', () => {
  assert.equal(isCaged('caged'), true);
  assert.equal(isCaged('CAGED'), true, 'case is not a semantic');
  assert.equal(isReleased('caged'), false);
});
