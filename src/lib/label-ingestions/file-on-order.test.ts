import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { fileLabelOnOrder, LabelFilingError, type FileLabelOnOrderDeps, type LabelFilingSnapshot } from './file-on-order';
import { classifyLabelFiling, filingTracking, labelFilingNeeds, type LabelFilingFacts } from './file-on-order-contracts';
import type { ApplyLabelIngestionInput } from './types';

const org = '11111111-1111-4111-8111-111111111111' as never;
const UPS = '1Z999AA10123456784';
const OTHER = '9400150206217932830794';
const thisOrder = { orderId: 12, orderNumber: '113-0000001-0000001', platform: 'amazon', status: 'unassigned' };
const otherOrder = { orderId: 40, orderNumber: '19-15205-47811', platform: 'ebay', status: 'shipped' };
const labelTracking = { raw: UPS, normalized: UPS, carrier: 'UPS', source: 'label' as const };

const facts = (extra: Partial<LabelFilingFacts> = {}): LabelFilingFacts => ({ tracking: labelTracking, order: thisOrder, otherOrders: [], orderTracking: [], ...extra });

describe('classifyLabelFiling', () => {
  test('no tracking: asks for it, or files without it when told to', () => {
    const asked = classifyLabelFiling(facts({ tracking: null }));
    assert.equal(asked.check.source, null);
    assert.deepEqual(asked.plan, { kind: 'ask', needs: ['tracking'] });
    assert.deepEqual(classifyLabelFiling(facts({ tracking: null }), { withoutTracking: true }).plan, { kind: 'withoutTracking' });
  });

  test('no tracking: other orders and the order’s own tracking are not asked about', () => {
    const verdict = classifyLabelFiling(facts({ tracking: null, otherOrders: [otherOrder], orderTracking: [{ raw: OTHER, normalized: OTHER }] }), { withoutTracking: true });
    assert.deepEqual(verdict.plan, { kind: 'withoutTracking' });
    assert.deepEqual(verdict.check.otherOrders, []);
  });

  test('a label that carries tracking is never filed without it', () => {
    assert.equal(classifyLabelFiling(facts(), { withoutTracking: true }).plan.kind, 'refuse');
  });

  test('tracking on another order: collision, then the answer rides into apply', () => {
    const asked = classifyLabelFiling(facts({ otherOrders: [otherOrder] }));
    assert.deepEqual(asked.plan, { kind: 'ask', needs: ['collision'] });
    assert.deepEqual(asked.check.otherOrders, [otherOrder]);
    assert.deepEqual(classifyLabelFiling(facts({ otherOrders: [otherOrder] }), { collision: 'keep' }).plan, { kind: 'apply', typed: null, collision: 'keep', existing: null });
  });

  test('the order already ships on a different tracking: existing (replace / add)', () => {
    const owned = facts({ orderTracking: [{ raw: OTHER, normalized: OTHER }] });
    assert.deepEqual(classifyLabelFiling(owned).plan, { kind: 'ask', needs: ['existing'] });
    assert.equal(classifyLabelFiling(owned).check.sameAlready, false);
    assert.deepEqual(classifyLabelFiling(owned, { existing: 'replace' }).plan, { kind: 'apply', typed: null, collision: null, existing: 'replace' });
  });

  test('collision and existing together ask both, and need both answers', () => {
    const both = facts({ otherOrders: [otherOrder], orderTracking: [{ raw: OTHER, normalized: OTHER }] });
    assert.deepEqual(classifyLabelFiling(both).plan, { kind: 'ask', needs: ['collision', 'existing'] });
    assert.deepEqual(classifyLabelFiling(both, { collision: 'move' }).plan, { kind: 'ask', needs: ['existing'] });
    assert.deepEqual(classifyLabelFiling(both, { collision: 'move', existing: 'add' }).plan, { kind: 'apply', typed: null, collision: 'move', existing: 'add' });
  });

  test('the same tracking already on the order: sameAlready, filed with no tracking change', () => {
    const verdict = classifyLabelFiling(facts({ orderTracking: [{ raw: OTHER, normalized: OTHER }, { raw: '1z 999 aa1 0123456784', normalized: UPS }] }));
    assert.equal(verdict.check.sameAlready, true);
    assert.deepEqual(verdict.plan, { kind: 'apply', typed: null, collision: null, existing: 'add' });
  });

  test('a clean filing applies with no answers', () => {
    assert.deepEqual(classifyLabelFiling(facts()).plan, { kind: 'apply', typed: null, collision: null, existing: null });
  });

  test('a typed number is carried as typed; the page’s own number always wins', () => {
    const typed = filingTracking({ raw: null, normalized: null, carrier: null }, { tracking: ' 1z999aa1 0123456784 ' });
    assert.deepEqual(typed, { raw: '1z999aa1 0123456784', normalized: UPS, carrier: 'UPS', source: 'typed' });
    assert.deepEqual(classifyLabelFiling(facts({ tracking: typed })).plan, { kind: 'apply', typed, collision: null, existing: null });
    assert.equal(filingTracking({ raw: UPS, normalized: UPS, carrier: 'UPS' }, { tracking: OTHER })?.source, 'label');
    assert.equal(filingTracking({ raw: null, normalized: null, carrier: null }, { tracking: ' - ' }), null);
  });

  test('labelFilingNeeds is the tray’s rule too', () => {
    const check = classifyLabelFiling(facts({ otherOrders: [otherOrder] })).check;
    assert.deepEqual(labelFilingNeeds(check), ['collision']);
    assert.deepEqual(labelFilingNeeds(check, { collision: 'move' }), []);
  });
});

describe('fileLabelOnOrder', () => {
  const snapshot = (over: { ingestion?: Partial<LabelFilingSnapshot['ingestion']>; facts?: Partial<LabelFilingFacts> } = {}): LabelFilingSnapshot => ({
    ingestion: { id: 5, state: 'QUARANTINED', rowVersion: 3, matchedOrderId: null, ...over.ingestion },
    order: { id: 12, orderRef: thisOrder.orderNumber, orderIds: [12, 13] },
    facts: facts(over.facts),
  });

  function harness(snap: LabelFilingSnapshot) {
    const calls: string[] = [];
    const applied: ApplyLabelIngestionInput[] = [];
    const deps: Partial<FileLabelOnOrderDeps> = {
      readSnapshot: async () => snap,
      recordOperatorEvidence: async (input) => {
        calls.push(`evidence:${input.tracking?.raw ?? '-'}:${input.release}:${input.expectedRowVersion}`);
        return { state: 'QUARANTINED', rowVersion: input.expectedRowVersion + 1 } as never;
      },
      confirm: async (input) => {
        calls.push(`confirm:${input.orderId}:${input.expectedRowVersion}`);
        return { ingestion: { state: 'MATCHED', rowVersion: input.expectedRowVersion + 1 } as never, repaired: [{} as never] };
      },
      apply: async (input) => {
        calls.push(`apply:${input.expectedRowVersion}`);
        applied.push(input);
        return { ok: true, replayed: false, ingestionId: 5, orderIds: [12, 13], serialUnitIds: [], inventoryEventIds: [], shipmentId: 77, documentId: 88, rowVersion: input.expectedRowVersion + 1 };
      },
      storeWithoutTracking: async (input) => {
        calls.push(`store:${input.orderId}:${input.orderRef}`);
        return { documentId: 99 };
      },
    };
    return { calls, applied, deps };
  }
  const input = (extra: Record<string, unknown> = {}) => ({ organizationId: org, actorStaffId: 2, ingestionId: 5, orderId: 12, expectedRowVersion: 3, ...extra });

  test('a missing answer refuses with the classification and writes nothing', async () => {
    const { calls, deps } = harness(snapshot({ facts: { otherOrders: [otherOrder] } }));
    await assert.rejects(fileLabelOnOrder(input(), deps), (error: unknown) => {
      assert.ok(error instanceof LabelFilingError);
      assert.equal(error.code, 'FILING_ANSWER_REQUIRED');
      assert.deepEqual(error.answer?.needs, ['collision']);
      assert.deepEqual(error.answer?.check.otherOrders, [otherOrder]);
      return true;
    });
    assert.deepEqual(calls, []);
  });

  test('a quarantined label with its own tracking: confirm, then apply under the new row version', async () => {
    const { calls, applied, deps } = harness(snapshot());
    const result = await fileLabelOnOrder(input(), deps);
    assert.deepEqual(calls, ['confirm:12:3', 'apply:4']);
    assert.deepEqual(result, { mode: 'applied', repaired: 1, documentId: 88, shipmentId: 77, check: classifyLabelFiling(facts()).check });
    assert.equal(applied[0]?.collision, undefined);
    assert.equal(applied[0]?.existing, undefined);
  });

  test('typed tracking is written as operator evidence before confirm and apply', async () => {
    const typed = filingTracking({ raw: null, normalized: null, carrier: null }, { tracking: UPS });
    const { calls, deps } = harness(snapshot({ facts: { tracking: typed } }));
    await fileLabelOnOrder(input({ tracking: UPS }), deps);
    assert.deepEqual(calls, [`evidence:${UPS}:false:3`, 'confirm:12:4', 'apply:5']);
  });

  test('without tracking: stored as the order document, never confirmed or applied', async () => {
    const { calls, deps } = harness(snapshot({ facts: { tracking: null } }));
    const result = await fileLabelOnOrder(input({ withoutTracking: true }), deps);
    assert.deepEqual(calls, [`store:12:${thisOrder.orderNumber}`]);
    assert.equal(result.mode, 'withoutTracking');
    assert.equal(result.documentId, 99);
  });

  test('collision and existing answers ride into apply', async () => {
    const { applied, deps } = harness(snapshot({ facts: { otherOrders: [otherOrder], orderTracking: [{ raw: OTHER, normalized: OTHER }] } }));
    await fileLabelOnOrder(input({ collision: 'move', existing: 'replace' }), deps);
    assert.equal(applied[0]?.collision, 'move');
    assert.equal(applied[0]?.existing, 'replace');
  });

  test('the same tracking already on the order files without moving its primary', async () => {
    const { applied, deps } = harness(snapshot({ facts: { orderTracking: [{ raw: OTHER, normalized: OTHER }, { raw: UPS, normalized: UPS }] } }));
    await fileLabelOnOrder(input(), deps);
    assert.equal(applied[0]?.existing, 'add');
  });

  test('a label resolved to another order is released, confirmed here, then applied', async () => {
    const { calls, deps } = harness(snapshot({ ingestion: { state: 'MATCHED', matchedOrderId: 40 }, facts: { otherOrders: [otherOrder] } }));
    await fileLabelOnOrder(input({ collision: 'move' }), deps);
    assert.deepEqual(calls, ['evidence:-:true:3', 'confirm:12:4', 'apply:5']);
  });

  test('a label already matched to this order applies directly', async () => {
    const { calls, deps } = harness(snapshot({ ingestion: { state: 'MATCHED', matchedOrderId: 13 } }));
    await fileLabelOnOrder(input(), deps);
    assert.deepEqual(calls, ['apply:3']);
  });

  test('applied here replays; applied elsewhere refuses; a stale row version refuses', async () => {
    const here = harness(snapshot({ ingestion: { state: 'APPLIED', matchedOrderId: 12, rowVersion: 9 } }));
    await fileLabelOnOrder(input(), here.deps);
    assert.deepEqual(here.calls, ['apply:9']);

    const elsewhere = harness(snapshot({ ingestion: { state: 'APPLIED', matchedOrderId: 40 } }));
    await assert.rejects(fileLabelOnOrder(input(), elsewhere.deps), (error: unknown) => error instanceof LabelFilingError && error.code === 'INGESTION_NOT_ACTIONABLE');
    assert.deepEqual(elsewhere.calls, []);

    const stale = harness(snapshot());
    await assert.rejects(fileLabelOnOrder(input({ expectedRowVersion: 2 }), stale.deps), (error: unknown) => error instanceof LabelFilingError && error.code === 'ROW_VERSION_CONFLICT');
    assert.deepEqual(stale.calls, []);
  });

  test('an apply conflict surfaces as a 409 with its message', async () => {
    const { deps } = harness(snapshot({ ingestion: { state: 'MATCHED', matchedOrderId: 12 } }));
    deps.apply = async () => ({ ok: false, code: 'ALLOCATION_NOT_PACKED', ingestionId: 5, message: 'Every active allocation must be PACKED' });
    await assert.rejects(fileLabelOnOrder(input(), deps), (error: unknown) => error instanceof LabelFilingError && error.code === 'INGESTION_APPLY_CONFLICT' && error.message === 'Every active allocation must be PACKED');
  });
});
