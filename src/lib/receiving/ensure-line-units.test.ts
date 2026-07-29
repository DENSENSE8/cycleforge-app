/**
 * ensureLineUnits / planLineUnits — Phase 1 tests
 * (docs/todo/per-unit-no-serial-EXECUTION-PROMPT.md §4, §5).
 *
 * Two halves:
 *   1. planLineUnits — the pure planner. Pins every rule the applier depends
 *      on: idempotence, append-only ordinals, never-shrink, scan-order
 *      attachment, waived slots, and the gate cases from the plan's §5 table.
 *   2. ensureLineUnits — the applier, with injected deps so it runs DB-free.
 *      Asserts the write actually skipped on a converged line (that skip IS the
 *      steady-state cost profile, not an optimisation detail).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planLineUnits,
  ensureLineUnits,
  fetchLineUnits,
  type EnsureLineUnitsDeps,
  type EnsureLineUnitsLine,
  type ExistingLineUnit,
  type LineUnitPlan,
  type FetchLineUnitsDeps,
} from './ensure-line-units';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '00000000-0000-4000-8000-000000000001' as OrgId;

function unit(over: Partial<ExistingLineUnit> & { id: number; ordinal: number }): ExistingLineUnit {
  return { serialUnitId: null, serialAbsent: false, ...over };
}

/** Apply a plan to an existing row set, the way the SQL does — for re-run checks. */
function applyInMemory(
  existing: ReadonlyArray<ExistingLineUnit>,
  plan: LineUnitPlan,
  nextId = 1000,
): ExistingLineUnit[] {
  const rows = existing.map((u) => ({ ...u }));
  let id = nextId;
  for (const ordinal of plan.insertOrdinals) rows.push(unit({ id: (id += 1), ordinal }));
  for (const unitId of plan.releaseUnitIds) {
    const row = rows.find((r) => r.id === unitId);
    if (row) row.serialUnitId = null;
  }
  for (const { ordinal, serialUnitId } of plan.attach) {
    const row = rows.find((r) => r.ordinal === ordinal);
    if (row) row.serialUnitId = serialUnitId;
  }
  return rows;
}

// ─── materialisation ─────────────────────────────────────────────────────────

test('a fresh qty-3 line materialises 3 rows at ordinals 1..3', () => {
  const plan = planLineUnits({ expectedQty: 3, serialIds: [], existing: [] });
  assert.deepEqual(plan.insertOrdinals, [1, 2, 3]);
  assert.equal(plan.targetCount, 3);
  assert.deepEqual(plan.attach, []);
  assert.equal(plan.noop, false);
});

test('a line with no expected qty and no serials materialises nothing', () => {
  for (const expectedQty of [null, 0]) {
    const plan = planLineUnits({ expectedQty, serialIds: [], existing: [] });
    assert.deepEqual(plan.insertOrdinals, [], `expectedQty=${expectedQty}`);
    assert.equal(plan.targetCount, 0);
    assert.equal(plan.noop, true);
  }
});

test('serials beyond expected qty still get a row (the UI renders one per serial)', () => {
  // ReceivingUnitRows: total = max(quantityExpected, saved.length, 1).
  const plan = planLineUnits({ expectedQty: 1, serialIds: [11, 12, 13], existing: [] });
  assert.equal(plan.targetCount, 3);
  assert.deepEqual(plan.insertOrdinals, [1, 2, 3]);
  assert.deepEqual(plan.unplacedSerialIds, []);
});

// ─── idempotence ─────────────────────────────────────────────────────────────

test('re-running over the resulting rows is a noop — no duplicates, no renumbering', () => {
  const first = planLineUnits({ expectedQty: 3, serialIds: [11, 12], existing: [] });
  const rows = applyInMemory([], first);

  const second = planLineUnits({ expectedQty: 3, serialIds: [11, 12], existing: rows });
  assert.equal(second.noop, true);
  assert.deepEqual(second.insertOrdinals, []);
  assert.deepEqual(second.releaseUnitIds, []);
  assert.deepEqual(second.attach, []);

  // Row identities and ordinals are untouched by the re-plan.
  assert.deepEqual(
    applyInMemory(rows, second).map((r) => ({ id: r.id, ordinal: r.ordinal, serialUnitId: r.serialUnitId })),
    rows.map((r) => ({ id: r.id, ordinal: r.ordinal, serialUnitId: r.serialUnitId })),
  );
});

test('a serial already parked on this line is never re-attached', () => {
  const existing = [
    unit({ id: 1, ordinal: 1, serialUnitId: 11 }),
    unit({ id: 2, ordinal: 2 }),
  ];
  const plan = planLineUnits({ expectedQty: 2, serialIds: [11], existing });
  assert.equal(plan.noop, true);
});

// ─── scan-order attachment ───────────────────────────────────────────────────

test('serials attach to the lowest free ordinals in scan order', () => {
  const existing = [
    unit({ id: 1, ordinal: 1 }),
    unit({ id: 2, ordinal: 2 }),
    unit({ id: 3, ordinal: 3 }),
  ];
  const plan = planLineUnits({ expectedQty: 3, serialIds: [21, 22], existing });
  assert.deepEqual(plan.attach, [
    { ordinal: 1, serialUnitId: 21 },
    { ordinal: 2, serialUnitId: 22 },
  ]);
});

test('a new serial fills the free slot around an already-claimed one', () => {
  const existing = [
    unit({ id: 1, ordinal: 1 }),
    unit({ id: 2, ordinal: 2, serialUnitId: 22 }),
    unit({ id: 3, ordinal: 3 }),
  ];
  const plan = planLineUnits({ expectedQty: 3, serialIds: [22, 33], existing });
  assert.deepEqual(plan.attach, [{ ordinal: 1, serialUnitId: 33 }]);
  assert.deepEqual(plan.releaseUnitIds, []);
});

test('duplicate serial ids in the input claim exactly one slot', () => {
  const plan = planLineUnits({ expectedQty: 2, serialIds: [11, 11], existing: [] });
  assert.equal(plan.targetCount, 2);
  assert.deepEqual(plan.attach, [{ ordinal: 1, serialUnitId: 11 }]);
});

// ─── waived units are not free slots ─────────────────────────────────────────

test('a waived unit never receives a serial', () => {
  const existing = [
    unit({ id: 1, ordinal: 1, serialAbsent: true }),
    unit({ id: 2, ordinal: 2 }),
    unit({ id: 3, ordinal: 3 }),
  ];
  const plan = planLineUnits({ expectedQty: 3, serialIds: [21, 22], existing });
  assert.deepEqual(plan.attach, [
    { ordinal: 2, serialUnitId: 21 },
    { ordinal: 3, serialUnitId: 22 },
  ]);
});

test('serials with nowhere to land are reported, never forced onto a waived slot', () => {
  const existing = [
    unit({ id: 1, ordinal: 1, serialAbsent: true }),
    unit({ id: 2, ordinal: 2, serialAbsent: true }),
    unit({ id: 3, ordinal: 3, serialAbsent: true }),
  ];
  const plan = planLineUnits({ expectedQty: 3, serialIds: [21], existing });
  assert.deepEqual(plan.attach, []);
  assert.deepEqual(plan.unplacedSerialIds, [21]);
  assert.equal(plan.noop, true);
});

// ─── §5 gate cases ───────────────────────────────────────────────────────────

test('quantity_expected raised 3 → 5 adds 2 rows; existing rows and waivers untouched', () => {
  const existing = [
    unit({ id: 1, ordinal: 1, serialUnitId: 11 }),
    unit({ id: 2, ordinal: 2, serialAbsent: true }),
    unit({ id: 3, ordinal: 3, serialUnitId: 13 }),
  ];
  const plan = planLineUnits({ expectedQty: 5, serialIds: [11, 13], existing });
  assert.deepEqual(plan.insertOrdinals, [4, 5]);
  assert.deepEqual(plan.releaseUnitIds, []);
  assert.deepEqual(plan.attach, []);
  assert.equal(plan.targetCount, 5);
});

test('quantity_expected lowered 5 → 3 deletes nothing — surplus rows survive', () => {
  const existing = [1, 2, 3, 4, 5].map((n) => unit({ id: n, ordinal: n }));
  existing[3].serialAbsent = true; // unit 4 carries an operator waiver
  const plan = planLineUnits({ expectedQty: 3, serialIds: [], existing });
  assert.equal(plan.targetCount, 5);
  assert.deepEqual(plan.insertOrdinals, []);
  assert.deepEqual(plan.releaseUnitIds, []);
  assert.equal(plan.noop, true);
});

test('deleting a scanned serial releases its slot; other units keep their waivers', () => {
  const existing = [
    unit({ id: 1, ordinal: 1, serialUnitId: 11 }),
    unit({ id: 2, ordinal: 2, serialAbsent: true }),
    unit({ id: 3, ordinal: 3, serialUnitId: 13 }),
  ];
  // Serial 11 was deleted — it no longer comes back from fetchSerialsForLines.
  const plan = planLineUnits({ expectedQty: 3, serialIds: [13], existing });
  assert.deepEqual(plan.releaseUnitIds, [1]);
  assert.deepEqual(plan.attach, []);
  assert.deepEqual(plan.insertOrdinals, []);

  const after = applyInMemory(existing, plan);
  assert.equal(after.find((r) => r.id === 1)?.serialUnitId, null);
  assert.equal(after.find((r) => r.id === 2)?.serialAbsent, true);
  assert.equal(after.find((r) => r.id === 3)?.serialUnitId, 13);
});

test('a serial that moved onto this line takes the freed slot of the one that left', () => {
  const existing = [
    unit({ id: 1, ordinal: 1, serialUnitId: 11 }),
    unit({ id: 2, ordinal: 2, serialUnitId: 12 }),
  ];
  // 11 left the line, 99 arrived (returned-then-re-received under this PO).
  const plan = planLineUnits({ expectedQty: 2, serialIds: [12, 99], existing });
  assert.deepEqual(plan.releaseUnitIds, [1]);
  assert.deepEqual(plan.attach, [{ ordinal: 1, serialUnitId: 99 }]);
});

// ─── applier ─────────────────────────────────────────────────────────────────

function fakes(existing: Map<number, ExistingLineUnit[]> = new Map()) {
  const calls = {
    loads: [] as Array<{ orgId: string; lineIds: number[] }>,
    applies: [] as Array<{ lineId: number; plan: LineUnitPlan }>,
  };
  const deps: EnsureLineUnitsDeps = {
    loadUnits: async (orgId, lineIds) => {
      calls.loads.push({ orgId, lineIds });
      return existing;
    },
    applyPlan: async (_orgId, lineId, plan) => {
      calls.applies.push({ lineId, plan });
    },
  };
  return { deps, calls };
}

test('ensureLineUnits loads every line in one call and applies each non-noop plan', async () => {
  const { deps, calls } = fakes();
  const lines: EnsureLineUnitsLine[] = [
    { lineId: 7, expectedQty: 2, serialIds: [] },
    { lineId: 9, expectedQty: 1, serialIds: [] },
  ];

  const plans = await ensureLineUnits(ORG, lines, deps);

  assert.equal(calls.loads.length, 1, 'one batched load for the whole carton');
  assert.deepEqual(calls.loads[0].lineIds, [7, 9]);
  assert.deepEqual(calls.applies.map((a) => a.lineId), [7, 9]);
  assert.deepEqual(plans.get(7)?.insertOrdinals, [1, 2]);
  assert.deepEqual(plans.get(9)?.insertOrdinals, [1]);
});

test('a converged line writes nothing — the steady-state open is one SELECT', async () => {
  const existing = new Map([
    [7, [unit({ id: 1, ordinal: 1, serialUnitId: 11 }), unit({ id: 2, ordinal: 2 })]],
  ]);
  const { deps, calls } = fakes(existing);

  const plans = await ensureLineUnits(ORG, [{ lineId: 7, expectedQty: 2, serialIds: [11] }], deps);

  assert.equal(plans.get(7)?.noop, true);
  assert.equal(calls.applies.length, 0, 'no write transaction opened');
});

test('ensureLineUnits skips synthetic/non-positive line ids and de-dupes repeats', async () => {
  const { deps, calls } = fakes();
  const plans = await ensureLineUnits(
    ORG,
    [
      { lineId: 0, expectedQty: 2, serialIds: [] },
      { lineId: -3, expectedQty: 2, serialIds: [] },
      { lineId: 7, expectedQty: 2, serialIds: [] },
      { lineId: 7, expectedQty: 9, serialIds: [] },
    ],
    deps,
  );

  assert.deepEqual(calls.loads[0].lineIds, [7]);
  assert.equal(plans.size, 1);
  // First occurrence wins — the later duplicate never re-plans the same line.
  assert.deepEqual(plans.get(7)?.insertOrdinals, [1, 2]);
});

test('ensureLineUnits does not touch the DB when every line id is unusable', async () => {
  const { deps, calls } = fakes();
  const plans = await ensureLineUnits(ORG, [{ lineId: 0, expectedQty: 3, serialIds: [] }], deps);
  assert.equal(plans.size, 0);
  assert.equal(calls.loads.length, 0);
  assert.equal(calls.applies.length, 0);
});

// ─── fetchLineUnits (Phase 2 read model) ─────────────────────────────────────

test('fetchLineUnits maps rows into the wire shape and groups by line, ordinal order', async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const deps: FetchLineUnitsDeps = {
    query: (async (_orgId: OrgId, sql: string, params?: unknown[]) => {
      queries.push({ sql, params: params ?? [] });
      return {
        rows: [
          {
            receiving_line_id: 7,
            id: '101',
            ordinal: 1,
            serial_unit_id: 11,
            serial_number: 'SN-A',
            serial_absent: false,
            serial_absent_reason: null,
            condition_grade: 'USED_A',
          },
          {
            receiving_line_id: 7,
            id: '102',
            ordinal: 2,
            serial_unit_id: null,
            serial_number: null,
            serial_absent: true,
            serial_absent_reason: 'NOT_SERIALIZED',
            condition_grade: null,
          },
          {
            receiving_line_id: 9,
            id: '201',
            ordinal: 1,
            serial_unit_id: null,
            serial_number: null,
            serial_absent: false,
            serial_absent_reason: null,
            condition_grade: null,
          },
        ],
      };
    }) as FetchLineUnitsDeps['query'],
  };

  const grouped = await fetchLineUnits([7, 9], ORG, deps);

  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].params, [[7, 9], ORG]);
  assert.deepEqual(grouped.get(7), [
    {
      id: 101,
      ordinal: 1,
      serial_unit_id: 11,
      serial: 'SN-A',
      serial_absent: false,
      serial_absent_reason: null,
      condition_grade: 'USED_A',
    },
    {
      id: 102,
      ordinal: 2,
      serial_unit_id: null,
      serial: null,
      serial_absent: true,
      serial_absent_reason: 'NOT_SERIALIZED',
      condition_grade: null,
    },
  ]);
  assert.deepEqual(grouped.get(9), [
    {
      id: 201,
      ordinal: 1,
      serial_unit_id: null,
      serial: null,
      serial_absent: false,
      serial_absent_reason: null,
      condition_grade: null,
    },
  ]);
});

test('fetchLineUnits: empty / non-positive lineIds short-circuit with no query', async () => {
  let called = 0;
  const deps: FetchLineUnitsDeps = {
    query: (async () => {
      called += 1;
      return { rows: [] };
    }) as FetchLineUnitsDeps['query'],
  };
  const empty = await fetchLineUnits([], ORG, deps);
  const junk = await fetchLineUnits([0, -1], ORG, deps);
  assert.equal(empty.size, 0);
  assert.equal(junk.size, 0);
  assert.equal(called, 0);
});

test('fetchLineUnits shape is identical for the same rows regardless of caller — endpoint agreement', async () => {
  // Both /api/receiving-lines and /api/receiving/:id must emit the same wire
  // shape for the same underlying rows. They share fetchLineUnits, so agreement
  // is by construction — pin the field set the plan names.
  const deps: FetchLineUnitsDeps = {
    query: (async () => ({
      rows: [
        {
          receiving_line_id: 42,
          id: '7',
          ordinal: 1,
          serial_unit_id: 99,
          serial_number: 'ABC',
          serial_absent: false,
          serial_absent_reason: null,
          condition_grade: 'PARTS',
        },
      ],
    })) as FetchLineUnitsDeps['query'],
  };
  const a = await fetchLineUnits([42], ORG, deps);
  const b = await fetchLineUnits([42], ORG, deps);
  assert.deepEqual(a.get(42), b.get(42));
  assert.deepEqual(Object.keys(a.get(42)![0]).sort(), [
    'condition_grade',
    'id',
    'ordinal',
    'serial',
    'serial_absent',
    'serial_absent_reason',
    'serial_unit_id',
  ]);
});
