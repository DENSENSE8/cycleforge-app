import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import {
  TESTING_RAIL_SEGMENT,
  TRIAGE_RAIL_SEGMENTS,
  UNBOX_QUEUE_SEGMENT,
  UNBOX_RAIL_SEGMENT,
  patchTestingRailByLine,
  patchReceivingRailTicketByCarton,
  patchUnboxRailQtyByCarton,
  patchUnboxRailTitleByCarton,
  purgeTriageRailsAfterUnboxOpen,
  receivingRailCartonKey,
  receivingRailReconcileId,
  reconcileUnboxRailAfterLineDelete,
  removePendingScanRailRow,
  removeReceivingRailByCarton,
  removeReceivingRailByLine,
  upsertReceivingRailRows,
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

describe('removePendingScanRailRow', () => {
  it('drops the pre-resolve scan: stub so carton: upsert does not double-list', () => {
    const qc = new QueryClient();
    qc.setQueryData(railKey(UNBOX_RAIL_SEGMENT), [
      { id: -1, receiving_id: null, client_event_id: 'scan:ABC123', tracking_number: 'ABC123' },
      { id: 2, receiving_id: 20, client_event_id: 'carton:20' },
    ] satisfies ReceivingRailRow[]);

    removePendingScanRailRow(qc, 'scan:ABC123');
    upsertReceivingRailRows(qc, [
      {
        id: -99,
        receiving_id: 99,
        client_event_id: 'carton:99',
        tracking_number: 'ABC123',
        item_name: 'Unfound PO',
      },
    ]);

    const next = qc.getQueryData<ReceivingRailRow[]>(railKey(UNBOX_RAIL_SEGMENT));
    assert.equal(next?.length, 2);
    assert.ok(next?.every((r) => r.client_event_id !== 'scan:ABC123'));
    assert.ok(next?.some((r) => r.client_event_id === 'carton:99'));
    assert.ok(next?.some((r) => r.client_event_id === 'carton:20'));
  });
});

describe('upsertReceivingRailRows (tracking metadata)', () => {
  it('keeps the carton id in Unboxed when re-upserted (add/edit tracking must not drop the row)', () => {
    const qc = new QueryClient();
    qc.setQueryData(railKey(UNBOX_RAIL_SEGMENT), [
      { id: 501, receiving_id: 77, client_event_id: 'carton:77' },
      { id: 502, receiving_id: 88, client_event_id: 'carton:88' },
    ] satisfies ReceivingRailRow[]);

    upsertReceivingRailRows(qc, [
      { id: 501, receiving_id: 77, client_event_id: 'carton:77' },
    ]);

    const next = qc.getQueryData<ReceivingRailRow[]>(railKey(UNBOX_RAIL_SEGMENT));
    assert.equal(next?.length, 2);
    assert.ok(next?.some((r) => r.receiving_id === 77 && r.client_event_id === 'carton:77'));
    assert.ok(next?.some((r) => r.receiving_id === 88));
  });

  it('does not bump an existing Unboxed carton on re-upsert (stable first-open order)', () => {
    const qc = new QueryClient();
    qc.setQueryData(railKey(UNBOX_RAIL_SEGMENT), [
      { id: 1, receiving_id: 10, client_event_id: 'carton:10', unbox_opened_at: '2026-07-01T10:00:00Z' },
      { id: 2, receiving_id: 20, client_event_id: 'carton:20', unbox_opened_at: '2026-07-01T09:00:00Z' },
      { id: 3, receiving_id: 30, client_event_id: 'carton:30', unbox_opened_at: '2026-07-01T08:00:00Z' },
    ] satisfies ReceivingRailRow[]);

    upsertReceivingRailRows(qc, [
      {
        id: 3,
        receiving_id: 30,
        client_event_id: 'carton:30',
        unbox_opened_at: '2026-07-20T12:00:00Z', // re-scan stamp — must be ignored
      },
    ]);

    const next = qc.getQueryData<ReceivingRailRow[]>(railKey(UNBOX_RAIL_SEGMENT));
    assert.equal(next?.[0]?.receiving_id, 10);
    assert.equal(next?.[2]?.receiving_id, 30);
    assert.equal(next?.[2]?.unbox_opened_at, '2026-07-01T08:00:00Z');
  });

  it('preserves first-open unbox_opened_at when hydration upsert omits or rewrites it', () => {
    const qc = new QueryClient();
    qc.setQueryData(railKey(UNBOX_RAIL_SEGMENT), [
      {
        id: -40,
        receiving_id: 40,
        client_event_id: 'carton:40',
        unbox_opened_at: '2026-07-20T11:00:00Z',
      },
    ] satisfies ReceivingRailRow[]);

    upsertReceivingRailRows(qc, [
      {
        id: 900,
        receiving_id: 40,
        client_event_id: 'carton:40',
        unbox_opened_at: '2026-07-20T18:00:00Z',
      },
    ]);

    const next = qc.getQueryData<ReceivingRailRow[]>(railKey(UNBOX_RAIL_SEGMENT));
    assert.equal(next?.[0]?.id, 900);
    assert.equal(next?.[0]?.unbox_opened_at, '2026-07-20T11:00:00Z');
  });

  it('prepends a brand-new Unboxed carton (first open)', () => {
    const qc = new QueryClient();
    qc.setQueryData(railKey(UNBOX_RAIL_SEGMENT), [
      { id: 1, receiving_id: 10, client_event_id: 'carton:10', unbox_opened_at: '2026-07-01T10:00:00Z' },
    ] satisfies ReceivingRailRow[]);

    // First-open membership carries display fields (scan-apply / matched stub) —
    // identity-only workspace patches must not invent a Line # row.
    upsertReceivingRailRows(qc, [
      {
        id: 2,
        receiving_id: 99,
        client_event_id: 'carton:99',
        unbox_opened_at: '2026-07-20T12:00:00Z',
        item_name: 'Scan-opened carton',
        quantity_received: 0,
      } as ReceivingRailRow,
    ]);

    const next = qc.getQueryData<ReceivingRailRow[]>(railKey(UNBOX_RAIL_SEGMENT));
    assert.equal(next?.[0]?.receiving_id, 99);
    assert.equal(next?.[1]?.receiving_id, 10);
  });
});

describe('upsertReceivingRailRows identity-only guard', () => {
  it('does not prepend a Line # stub onto an empty Unboxed cache', () => {
    const qc = new QueryClient();
    qc.setQueryData(railKey(UNBOX_RAIL_SEGMENT), [] satisfies ReceivingRailRow[]);

    upsertReceivingRailRows(qc, [
      {
        id: 8700,
        receiving_id: 14226,
        client_event_id: 'carton:14226',
      },
    ]);

    const next = qc.getQueryData<ReceivingRailRow[]>(railKey(UNBOX_RAIL_SEGMENT));
    assert.deepEqual(next, []);
  });

  it('still prepends a rich scan stub onto an empty Unboxed cache', () => {
    const qc = new QueryClient();
    qc.setQueryData(railKey(UNBOX_RAIL_SEGMENT), [] satisfies ReceivingRailRow[]);

    upsertReceivingRailRows(qc, [
      {
        id: 8700,
        receiving_id: 14226,
        client_event_id: 'carton:14226',
        item_name: 'Bose CineMate GS Series II',
        sku: '00044-P-9',
        quantity_received: 0,
        quantity_expected: 1,
      } as ReceivingRailRow,
    ]);

    const next = qc.getQueryData<Array<ReceivingRailRow & { item_name?: string }>>(
      railKey(UNBOX_RAIL_SEGMENT),
    );
    assert.equal(next?.length, 1);
    assert.equal(next?.[0]?.item_name, 'Bose CineMate GS Series II');
    assert.equal(next?.[0]?.id, 8700);
  });

  it('merges identity keep-alive onto an existing rich Unboxed row', () => {
    const qc = new QueryClient();
    qc.setQueryData(railKey(UNBOX_RAIL_SEGMENT), [
      {
        id: 8700,
        receiving_id: 14226,
        client_event_id: 'carton:14226',
        item_name: 'Bose CineMate GS Series II',
        sku: '00044-P-9',
        quantity_received: 0,
        quantity_expected: 1,
      } as ReceivingRailRow,
    ]);

    upsertReceivingRailRows(qc, [
      {
        id: 8700,
        receiving_id: 14226,
        client_event_id: 'carton:14226',
      },
    ]);

    const next = qc.getQueryData<
      Array<ReceivingRailRow & { item_name?: string; quantity_received?: number }>
    >(railKey(UNBOX_RAIL_SEGMENT));
    assert.equal(next?.length, 1);
    assert.equal(next?.[0]?.item_name, 'Bose CineMate GS Series II');
    assert.equal(next?.[0]?.quantity_received, 0);
  });
});

describe('patchUnboxRailTitleByCarton', () => {
  it('renames stub carton title without clearing unbox_opened_at or writing serials/workflow', () => {
    const qc = new QueryClient();
    qc.setQueryData(railKey(UNBOX_RAIL_SEGMENT), [
      {
        id: -45624,
        receiving_id: 45624,
        client_event_id: 'carton:45624',
        unbox_opened_at: '2026-07-20T21:28:27.920Z',
        item_name: 'Unfound PO',
        workflow_status: 'ARRIVED',
        quantity_received: 0,
      } as ReceivingRailRow & {
        item_name: string;
        workflow_status: string;
        quantity_received: number;
      },
    ]);

    patchUnboxRailTitleByCarton(qc, 45624, {
      item_name: 'Return serial 064795940570213AE',
    });

    const next = qc.getQueryData<
      Array<
        ReceivingRailRow & {
          item_name?: string;
          workflow_status?: string;
          quantity_received?: number;
          serials?: unknown;
        }
      >
    >(railKey(UNBOX_RAIL_SEGMENT));
    assert.equal(next?.[0]?.item_name, 'Return serial 064795940570213AE');
    assert.equal(next?.[0]?.unbox_opened_at, '2026-07-20T21:28:27.920Z');
    assert.equal(next?.[0]?.id, -45624);
    assert.equal(next?.[0]?.workflow_status, 'ARRIVED');
    assert.equal(next?.[0]?.quantity_received, 0);
    assert.equal(next?.[0]?.serials, undefined);
  });

  it('does not invent workflow_status or serials when only title is patched', () => {
    const qc = new QueryClient();
    qc.setQueryData(railKey(UNBOX_RAIL_SEGMENT), [
      {
        id: 10,
        receiving_id: 10,
        client_event_id: 'carton:10',
        unbox_opened_at: '2026-07-20T12:00:00Z',
        item_name: 'Unfound PO',
      } as ReceivingRailRow & { item_name: string },
    ]);

    patchUnboxRailTitleByCarton(qc, 10, {
      item_name: 'Return serial ABC',
      sku: 'SKU-1',
    });

    const next = qc.getQueryData<
      Array<ReceivingRailRow & { item_name?: string; sku?: string; workflow_status?: string }>
    >(railKey(UNBOX_RAIL_SEGMENT));
    assert.equal(next?.[0]?.item_name, 'Return serial ABC');
    assert.equal(next?.[0]?.sku, 'SKU-1');
    assert.equal(next?.[0]?.unbox_opened_at, '2026-07-20T12:00:00Z');
    assert.equal(next?.[0]?.workflow_status, undefined);
  });
});

describe('patchUnboxRailQtyByCarton', () => {
  it('updates qty/workflow without touching unbox_opened_at or title', () => {
    const qc = new QueryClient();
    qc.setQueryData(railKey(UNBOX_RAIL_SEGMENT), [
      {
        id: -50,
        receiving_id: 50,
        client_event_id: 'carton:50',
        unbox_opened_at: '2026-07-20T10:00:00Z',
        item_name: 'Widget',
        quantity_received: 0,
        workflow_status: 'ARRIVED',
      } as ReceivingRailRow & {
        item_name: string;
        quantity_received: number;
        workflow_status: string;
      },
    ]);

    patchUnboxRailQtyByCarton(qc, 50, {
      quantity_received: 2,
      quantity_expected: 2,
      workflow_status: 'UNBOXED',
    });

    const next = qc.getQueryData<
      Array<
        ReceivingRailRow & {
          item_name?: string;
          quantity_received?: number;
          quantity_expected?: number;
          workflow_status?: string;
        }
      >
    >(railKey(UNBOX_RAIL_SEGMENT));
    assert.equal(next?.[0]?.quantity_received, 2);
    assert.equal(next?.[0]?.quantity_expected, 2);
    assert.equal(next?.[0]?.workflow_status, 'UNBOXED');
    assert.equal(next?.[0]?.unbox_opened_at, '2026-07-20T10:00:00Z');
    assert.equal(next?.[0]?.item_name, 'Widget');
    assert.equal(next?.[0]?.id, -50);
  });
});

describe('patchReceivingRailTicketByCarton', () => {
  it('clears zendesk_ticket on Unboxed and triage rails for the carton', () => {
    const qc = new QueryClient();
    const flagged = {
      id: -50060,
      receiving_id: 50060,
      client_event_id: 'carton:50060',
      item_name: 'Unfound PO',
      zendesk_ticket: '#9606',
    } as ReceivingRailRow & { item_name: string; zendesk_ticket: string };
    const other = {
      id: -1,
      receiving_id: 1,
      client_event_id: 'carton:1',
      item_name: 'Unfound PO',
      zendesk_ticket: '#1111',
    } as ReceivingRailRow & { item_name: string; zendesk_ticket: string };

    qc.setQueryData(railKey(UNBOX_RAIL_SEGMENT), [flagged, other]);
    qc.setQueryData(railKey('unfound'), [flagged]);

    patchReceivingRailTicketByCarton(qc, 50060, null);

    const unbox = qc.getQueryData<Array<ReceivingRailRow & { zendesk_ticket?: string | null }>>(
      railKey(UNBOX_RAIL_SEGMENT),
    );
    const unfound = qc.getQueryData<Array<ReceivingRailRow & { zendesk_ticket?: string | null }>>(
      railKey('unfound'),
    );
    assert.equal(unbox?.[0]?.zendesk_ticket, null);
    assert.equal(unbox?.[1]?.zendesk_ticket, '#1111');
    assert.equal(unfound?.[0]?.zendesk_ticket, null);
  });

  it('sets the filed ticket label on the carton row', () => {
    const qc = new QueryClient();
    qc.setQueryData(railKey(UNBOX_RAIL_SEGMENT), [
      {
        id: -7,
        receiving_id: 7,
        client_event_id: 'carton:7',
        zendesk_ticket: null,
      } as ReceivingRailRow & { zendesk_ticket: string | null },
    ]);

    patchReceivingRailTicketByCarton(qc, 7, '#9606');

    const next = qc.getQueryData<Array<ReceivingRailRow & { zendesk_ticket?: string | null }>>(
      railKey(UNBOX_RAIL_SEGMENT),
    );
    assert.equal(next?.[0]?.zendesk_ticket, '#9606');
  });
});

describe('patchTestingRailByLine', () => {
  it('patches workflow/tested_count by line id without writing age or serials', () => {
    const qc = new QueryClient();
    qc.setQueryData(railKey(TESTING_RAIL_SEGMENT), [
      {
        id: 88,
        receiving_id: 9,
        last_activity_at: '2026-07-20T08:00:00Z',
        tested_at: '2026-07-20T08:00:00Z',
        workflow_status: 'IN_TEST',
        tested_count: 0,
        quantity_received: 2,
      } as ReceivingRailRow & {
        last_activity_at: string;
        tested_at: string;
        workflow_status: string;
        tested_count: number;
        quantity_received: number;
      },
    ]);

    patchTestingRailByLine(qc, 88, {
      workflow_status: 'PASSED',
      tested_count: 2,
    });

    const next = qc.getQueryData<
      Array<
        ReceivingRailRow & {
          workflow_status?: string;
          tested_count?: number;
          last_activity_at?: string;
          tested_at?: string;
          serials?: unknown;
        }
      >
    >(railKey(TESTING_RAIL_SEGMENT));
    assert.equal(next?.[0]?.workflow_status, 'PASSED');
    assert.equal(next?.[0]?.tested_count, 2);
    assert.equal(next?.[0]?.last_activity_at, '2026-07-20T08:00:00Z');
    assert.equal(next?.[0]?.tested_at, '2026-07-20T08:00:00Z');
    assert.equal(next?.[0]?.serials, undefined);
  });

  it('does not invent a row when the line is absent from the Testing dock', () => {
    const qc = new QueryClient();
    qc.setQueryData(railKey(TESTING_RAIL_SEGMENT), [
      { id: 1, receiving_id: 1 } satisfies ReceivingRailRow,
    ]);
    patchTestingRailByLine(qc, 99, { workflow_status: 'PASSED' });
    const next = qc.getQueryData<ReceivingRailRow[]>(railKey(TESTING_RAIL_SEGMENT));
    assert.equal(next?.length, 1);
    assert.equal(next?.[0]?.id, 1);
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

describe('purgeTriageRailsAfterUnboxOpen', () => {
  const triageRows = (): ReceivingRailRow[] => [
    { id: -10, receiving_id: 10, client_event_id: 'carton:10' },
    { id: 2, receiving_id: 20, client_event_id: 'carton:20' },
  ];

  it('drops the opened carton from every triage segment, leaves siblings', () => {
    const qc = new QueryClient();
    for (const segment of TRIAGE_RAIL_SEGMENTS) {
      qc.setQueryData(railKey(segment), triageRows());
    }

    purgeTriageRailsAfterUnboxOpen(qc, 10);

    for (const segment of TRIAGE_RAIL_SEGMENTS) {
      assert.deepEqual(
        qc.getQueryData(railKey(segment)),
        [{ id: 2, receiving_id: 20, client_event_id: 'carton:20' }],
        `segment ${segment} should drop carton 10 only`,
      );
    }
  });

  it('never touches Unbox rails (Unboxed / Queue keep the carton)', () => {
    const qc = new QueryClient();
    qc.setQueryData(railKey(UNBOX_RAIL_SEGMENT), triageRows());
    qc.setQueryData(railKey(UNBOX_QUEUE_SEGMENT), triageRows());

    purgeTriageRailsAfterUnboxOpen(qc, 10);

    assert.deepEqual(qc.getQueryData(railKey(UNBOX_RAIL_SEGMENT)), triageRows());
    assert.deepEqual(qc.getQueryData(railKey(UNBOX_QUEUE_SEGMENT)), triageRows());
  });

  it('marks triage rail queries stale so the next mount refetches server truth', () => {
    const qc = new QueryClient();
    for (const segment of TRIAGE_RAIL_SEGMENTS) {
      qc.setQueryData(railKey(segment), triageRows());
    }
    qc.setQueryData(railKey(UNBOX_RAIL_SEGMENT), triageRows());

    purgeTriageRailsAfterUnboxOpen(qc, 10);

    for (const segment of TRIAGE_RAIL_SEGMENTS) {
      assert.equal(
        qc.getQueryState(railKey(segment))?.isInvalidated,
        true,
        `segment ${segment} should be invalidated`,
      );
    }
    assert.equal(qc.getQueryState(railKey(UNBOX_RAIL_SEGMENT))?.isInvalidated, false);
  });

  it('no-ops on a non-materialized receiving id', () => {
    const qc = new QueryClient();
    qc.setQueryData(railKey('triage-combined'), triageRows());

    purgeTriageRailsAfterUnboxOpen(qc, Number.NaN);
    purgeTriageRailsAfterUnboxOpen(qc, -3);

    assert.deepEqual(qc.getQueryData(railKey('triage-combined')), triageRows());
    assert.equal(qc.getQueryState(railKey('triage-combined'))?.isInvalidated, false);
  });
});
