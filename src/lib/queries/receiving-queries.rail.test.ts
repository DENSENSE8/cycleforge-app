import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import {
  UNBOX_QUEUE_SEGMENT,
  UNBOX_RAIL_SEGMENT,
  receivingRailCartonKey,
  receivingRailReconcileId,
  reconcileUnboxRailAfterLineDelete,
  removeReceivingRailByCarton,
  removeReceivingRailByLine,
  type ReceivingRailRow,
} from './receiving-queries';

function railKey(segment: string) {
  return ['receiving-lines-table', 'rail', segment, 'default', '', 'all'] as const;
}

describe('receivingRailReconcileId', () => {
  it('prefers client_event_id, then carton key, then line id', () => {
    assert.equal(
      receivingRailReconcileId({ id: 9, receiving_id: 3, client_event_id: 'carton:3' }),
      'carton:3',
    );
    assert.equal(
      receivingRailReconcileId({ id: 9, receiving_id: 3 }),
      receivingRailCartonKey(3),
    );
    assert.equal(receivingRailReconcileId({ id: 9 }), 9);
  });

  it('stays stable across stub → real line id swaps', () => {
    const stub = receivingRailReconcileId({
      id: -44,
      receiving_id: 44,
      client_event_id: receivingRailCartonKey(44),
    });
    const real = receivingRailReconcileId({
      id: 901,
      receiving_id: 44,
      client_event_id: receivingRailCartonKey(44),
    });
    assert.equal(stub, real);
    assert.equal(stub, 'carton:44');
  });
});

describe('removeReceivingRailByCarton / ByLine', () => {
  it('drops carton rows from Unboxed and Queue caches', () => {
    const qc = new QueryClient();
    const rows: ReceivingRailRow[] = [
      { id: 1, receiving_id: 10, client_event_id: 'carton:10' },
      { id: 2, receiving_id: 20, client_event_id: 'carton:20' },
    ];
    qc.setQueryData(railKey(UNBOX_RAIL_SEGMENT), rows);
    qc.setQueryData(railKey(UNBOX_QUEUE_SEGMENT), [...rows]);

    removeReceivingRailByCarton(qc, 10);

    assert.deepEqual(qc.getQueryData(railKey(UNBOX_RAIL_SEGMENT)), [
      { id: 2, receiving_id: 20, client_event_id: 'carton:20' },
    ]);
    assert.deepEqual(qc.getQueryData(railKey(UNBOX_QUEUE_SEGMENT)), [
      { id: 2, receiving_id: 20, client_event_id: 'carton:20' },
    ]);
  });

  it('resolves line dismiss to carton remove when receiving_id is cached', () => {
    const qc = new QueryClient();
    qc.setQueryData(railKey(UNBOX_RAIL_SEGMENT), [
      { id: 501, receiving_id: 77, client_event_id: 'carton:77' },
      { id: 502, receiving_id: 88, client_event_id: 'carton:88' },
    ] satisfies ReceivingRailRow[]);

    removeReceivingRailByLine(qc, 501);

    assert.deepEqual(qc.getQueryData(railKey(UNBOX_RAIL_SEGMENT)), [
      { id: 502, receiving_id: 88, client_event_id: 'carton:88' },
    ]);
  });
});

describe('reconcileUnboxRailAfterLineDelete', () => {
  it('retargets the carton row id while keeping carton: key', () => {
    const qc = new QueryClient();
    qc.setQueryData(railKey(UNBOX_RAIL_SEGMENT), [
      { id: 100, receiving_id: 5, client_event_id: 'carton:5' },
    ] satisfies ReceivingRailRow[]);

    reconcileUnboxRailAfterLineDelete(qc, 5, { kind: 'line', lineId: 200 });

    const next = qc.getQueryData<ReceivingRailRow[]>(railKey(UNBOX_RAIL_SEGMENT));
    assert.ok(next);
    assert.equal(next[0]?.id, 200);
    assert.equal(next[0]?.client_event_id, 'carton:5');
    assert.equal(receivingRailReconcileId(next[0]!), 'carton:5');
  });

  it('collapses to a negative stub id with the same carton key', () => {
    const qc = new QueryClient();
    qc.setQueryData(railKey(UNBOX_RAIL_SEGMENT), [
      { id: 100, receiving_id: 5, client_event_id: 'carton:5' },
    ] satisfies ReceivingRailRow[]);

    reconcileUnboxRailAfterLineDelete(qc, 5, { kind: 'stub', tracking: '1Z999' });

    const next = qc.getQueryData<ReceivingRailRow[]>(railKey(UNBOX_RAIL_SEGMENT));
    assert.ok(next);
    assert.equal(next[0]?.id, -5);
    assert.equal(next[0]?.client_event_id, 'carton:5');
    assert.equal(receivingRailReconcileId(next[0]!), 'carton:5');
  });
});
