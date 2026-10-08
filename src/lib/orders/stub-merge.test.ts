import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decideStubMerge,
  mergeStubOrder,
  stubMergeNote,
  type StubMergeDeps,
  type StubMergeFacts,
} from './stub-merge';

const ORG = '11111111-1111-1111-1111-111111111111' as const;

function facts(overrides: Partial<StubMergeFacts> = {}): StubMergeFacts {
  return {
    stub: { id: 100, orderNumber: '100628', shipmentId: 555 },
    target: { id: 200, shipmentId: 777, hasActiveLabel: true, newestLabelShipmentId: 777 },
    openAllocations: 0,
    stubLabels: [
      { rowId: 10, purpose: 'outbound', labelDocumentId: 1001, shipmentId: 555 },
    ],
    ...overrides,
  };
}

// ─── decideStubMerge ─────────────────────────────────────────────────────────

test('decideStubMerge: same row for both ids refuses 400', () => {
  const d = decideStubMerge(facts({ target: { id: 100, shipmentId: 555, hasActiveLabel: false, newestLabelShipmentId: null }, stub: { id: 100, orderNumber: 'x', shipmentId: 555 } }));
  assert.equal(d.kind, 'refuse');
  if (d.kind === 'refuse') {
    assert.equal(d.status, 400);
    assert.equal(d.code, 'SAME_ORDER');
  }
});

test('decideStubMerge: missing stub / target refuse 404 with distinct codes', () => {
  const noStub = decideStubMerge(facts({ stub: null }));
  assert.equal(noStub.kind, 'refuse');
  if (noStub.kind === 'refuse') {
    assert.equal(noStub.status, 404);
    assert.equal(noStub.code, 'STUB_NOT_FOUND');
  }
  const noTarget = decideStubMerge(facts({ target: null }));
  if (noTarget.kind === 'refuse') {
    assert.equal(noTarget.status, 404);
    assert.equal(noTarget.code, 'TARGET_NOT_FOUND');
  }
});

test('decideStubMerge: open allocations refuse 409 (inventory is real work)', () => {
  const d = decideStubMerge(facts({ openAllocations: 2 }));
  assert.equal(d.kind, 'refuse');
  if (d.kind === 'refuse') {
    assert.equal(d.status, 409);
    assert.equal(d.code, 'STUB_HAS_ALLOCATIONS');
    assert.match(d.message, /2 open unit allocation/);
  }
});

test('decideStubMerge: a stub with nothing to move refuses — that row wants delete, not merge', () => {
  const d = decideStubMerge(facts({ stubLabels: [] }));
  if (d.kind === 'refuse') {
    assert.equal(d.status, 409);
    assert.equal(d.code, 'NOTHING_TO_MOVE');
  } else assert.fail('expected refuse');
});

test('decideStubMerge: outbound re-purposes to replacement when the survivor already ships', () => {
  const d = decideStubMerge(facts());
  assert.equal(d.kind, 'merge');
  if (d.kind === 'merge') {
    assert.deepEqual(d.moves, [{ rowId: 10, purpose: 'replacement' }]);
    assert.equal(d.promoteShipmentId, null); // survivor keeps its own shipment_id
  }
});

test('decideStubMerge: return labels and labelless survivors keep their purpose', () => {
  const d = decideStubMerge(
    facts({
      target: { id: 200, shipmentId: null, hasActiveLabel: false, newestLabelShipmentId: null },
      stubLabels: [
        { rowId: 11, purpose: 'return', labelDocumentId: null, shipmentId: 556 },
        { rowId: 12, purpose: 'outbound', labelDocumentId: 1002, shipmentId: 557 },
      ],
    }),
  );
  assert.equal(d.kind, 'merge');
  if (d.kind === 'merge') {
    assert.deepEqual(d.moves, [
      { rowId: 11, purpose: 'return' },
      { rowId: 12, purpose: 'outbound' }, // survivor has no label — the moved outbound stays outbound
    ]);
    // No survivor shipment → newest moved label (557) promotes.
    assert.equal(d.promoteShipmentId, 557);
  }
});

test('decideStubMerge: promotion prefers the survivor own newest label over the moved one', () => {
  const d = decideStubMerge(
    facts({
      target: { id: 200, shipmentId: null, hasActiveLabel: true, newestLabelShipmentId: 888 },
    }),
  );
  if (d.kind === 'merge') assert.equal(d.promoteShipmentId, 888);
  else assert.fail('expected merge');
});

// ─── mergeStubOrder (executor threading) ─────────────────────────────────────

function fakes(f: StubMergeFacts) {
  const applied = { movedLabelRows: 1, movedLabelDocuments: 1, movedLinks: 1, movedNotes: 0, promotedShipmentId: null };
  const cap = { readFacts: [] as Array<{ orgId: unknown; stubId: number; targetId: number }>, applied: [] as unknown[] };
  const deps: StubMergeDeps = {
    readFacts: async (orgId, stubId, targetId) => {
      cap.readFacts.push({ orgId, stubId, targetId });
      return f;
    },
    applyMerge: async (_orgId, plan) => {
      cap.applied.push(plan);
      return applied;
    },
  };
  return { deps, cap, applied };
}

test('mergeStubOrder: ok path threads org + plan into applyMerge and returns the stub ref', async () => {
  const { deps, cap, applied } = fakes(facts());
  const out = await mergeStubOrder({ orgId: ORG, stubOrderId: 100, targetOrderId: 200, staffId: 7 }, deps);

  assert.equal(out.ok, true);
  if (out.ok) {
    assert.deepEqual(out.plan, { stubId: 100, targetId: 200, moves: [{ rowId: 10, purpose: 'replacement' }], promoteShipmentId: null });
    assert.equal(out.applied, applied);
    assert.deepEqual(out.stub, { id: 100, orderNumber: '100628' });
  }
  assert.equal(cap.readFacts.length, 1);
  assert.equal(cap.readFacts[0]!.orgId, ORG);
  assert.equal(cap.readFacts[0]!.stubId, 100);
  assert.equal(cap.applied.length, 1);
});

test('mergeStubOrder: a refusal never reaches applyMerge', async () => {
  const { deps, cap } = fakes(facts({ openAllocations: 1 }));
  const out = await mergeStubOrder({ orgId: ORG, stubOrderId: 100, targetOrderId: 200, staffId: null }, deps);

  assert.equal(out.ok, false);
  if (!out.ok) {
    assert.equal(out.status, 409);
    assert.equal(out.code, 'STUB_HAS_ALLOCATIONS');
  }
  assert.equal(cap.applied.length, 0);
});

// ─── stubMergeNote ───────────────────────────────────────────────────────────

test('stubMergeNote names the stub ref and the label count', () => {
  assert.equal(stubMergeNote('100628', 1), 'Merged stub order 100628 into this order — 1 label absorbed.');
  assert.equal(stubMergeNote(null, 2), 'Merged stub order an unnumbered order into this order — 2 labels absorbed.');
});
