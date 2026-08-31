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
};

function gate(facts: ReleaseGateFacts, id: 'G1' | 'G2' | 'G3') {
  const found = evaluateReleaseGates(facts).gates.find((g) => g.id === id);
  assert.ok(found, `gate ${id} present`);
  return found;
}

test('all three gates green → canRelease', () => {
  const result = evaluateReleaseGates(GREEN);
  assert.equal(result.canRelease, true);
  assert.equal(result.failing.length, 0);
  assert.deepEqual(result.gates.map((g) => g.id), ['G1', 'G2', 'G3']);
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

test('G3 fails with neither', () => {
  const g = gate({ ...GREEN, shippingLabelLinked: false, shippingLabelPurchased: false }, 'G3');
  assert.equal(g.passed, false);
  assert.match(g.reason ?? '', /buy one/);
});

// ── The matrix as a whole ───────────────────────────────────────────────────

test('an empty order fails all three and reports all three', () => {
  const result = evaluateReleaseGates({});
  assert.equal(result.canRelease, false);
  assert.equal(result.failing.length, 3, 'every failure is named, not just the first');
  assert.deepEqual(result.failing.map((g) => g.id), ['G1', 'G2', 'G3']);
});

test('one red gate is enough to hold the cage shut', () => {
  for (const broken of [
    { itemNumber: null },
    { linkedDocumentCount: 0, docsNotRequired: false },
    { shippingLabelLinked: false, shippingLabelPurchased: false },
  ] satisfies Partial<ReleaseGateFacts>[]) {
    const result = evaluateReleaseGates({ ...GREEN, ...broken });
    assert.equal(result.canRelease, false, `${JSON.stringify(broken)} must not release`);
    assert.equal(result.failing.length, 1, 'exactly the broken gate is failing');
  }
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
