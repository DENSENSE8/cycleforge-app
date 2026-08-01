import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  ORDERS_QUEUE_COLUMNS,
  ORDERS_QUEUE_TESTED_COLUMNS,
  ordersQueueColumnsFor,
  ordersQueueGridTemplateFor,
  sanitizeOrdersQueueColumnOrder,
} from '@/lib/dashboard-order-row-layout';
import { ordersQueueColumnDefsFor, queueColumnOf } from './orders-queue-column-defs';
import {
  nonSentinelTimestamp,
  queueRowTestedAtRaw,
  queueRowTesterNameRaw,
  type QueueRowRecord,
} from './helpers';

/**
 * Phase A of the grid-surface-descriptor plan: mode column sets are TanStack
 * `ColumnDef`s carrying the house `OrdersQueueColumn` geometry on
 * `meta.queueColumn`. These lock (1) the per-mode scan order, (2) the TESTED
 * lane's tester/tested-at contract (plan §9), and (3) the def↔house-model
 * round-trip the composer relies on.
 */

describe('orders-queue mode column sets (TanStack ColumnDefs)', () => {
  it('fulfillment.default matches the canonical 7-column scan order', () => {
    const defs = ordersQueueColumnDefsFor('fulfillment.default');
    assert.deepEqual(
      defs.map((d) => d.id),
      ['select', 'order', 'title', 'sla', 'condition', 'qty', 'tracking'],
    );
    assert.deepEqual(
      defs.map((d) => d.id),
      ORDERS_QUEUE_COLUMNS.map((c) => c.key),
      'defs mirror ORDERS_QUEUE_COLUMNS exactly',
    );
  });

  it('fulfillment.tested surfaces Tester + Tested at after Ship by (no Status / Platform)', () => {
    const defs = ordersQueueColumnDefsFor('fulfillment.tested');
    assert.deepEqual(
      defs.map((d) => d.id),
      ['select', 'order', 'title', 'sla', 'tester', 'testedAt', 'condition', 'qty', 'tracking'],
    );
    assert.ok(!defs.some((d) => d.id === 'status'), 'Status pill is not on the TESTED tab');
    assert.ok(!defs.some((d) => d.id === 'platform'), 'Platform column is retired');
  });

  it('defs are stable references per mode (safe hook deps)', () => {
    assert.equal(
      ordersQueueColumnDefsFor('fulfillment.tested'),
      ordersQueueColumnDefsFor('fulfillment.tested'),
    );
  });

  it('every def round-trips its house column model via meta.queueColumn', () => {
    for (const mode of ['fulfillment.default', 'fulfillment.tested'] as const) {
      const houseColumns = ordersQueueColumnsFor(mode);
      const defs = ordersQueueColumnDefsFor(mode);
      defs.forEach((def, i) => {
        assert.equal(queueColumnOf(def), houseColumns[i], `${mode}[${i}] meta is the house model`);
      });
    }
  });

  it('sorting stays inside the URL ?sort= vocabulary — tester/testedAt are not sortable', () => {
    const defs = ordersQueueColumnDefsFor('fulfillment.tested');
    const byId = Object.fromEntries(defs.map((d) => [d.id, d]));
    assert.equal(byId.tester.enableSorting, false, 'tester is outside the ?sort vocabulary');
    assert.equal(byId.testedAt.enableSorting, false, 'testedAt is outside the ?sort vocabulary');
    assert.equal(byId.title.enableSorting, true);
    assert.equal(byId.sla.enableSorting, true);
    // Ascending ship-by IS most-late-first, so no column activates DESC first.
    assert.notEqual(byId.sla.sortDescFirst, true, 'Ship by activates ascending');
  });

  it('locked identity pane (select · title) can never hide; the rest can', () => {
    for (const mode of ['fulfillment.default', 'fulfillment.tested'] as const) {
      const byId = Object.fromEntries(ordersQueueColumnDefsFor(mode).map((d) => [d.id, d]));
      assert.equal(byId.select.enableHiding, false);
      assert.equal(byId.title.enableHiding, false);
      assert.equal(byId.qty.enableHiding, true);
    }
  });
});

describe('ORDERS_QUEUE_TESTED_COLUMNS — house geometry for the TESTED lane', () => {
  it('tester + testedAt carry labels, types, and hard minmax tracks', () => {
    const byKey = Object.fromEntries(ORDERS_QUEUE_TESTED_COLUMNS.map((c) => [c.key, c]));
    assert.equal(byKey.tester.label, 'Tester');
    assert.equal(byKey.tester.type, 'text');
    assert.match(byKey.tester.width, /^minmax\([\d.]+rem, [\d.]+rem\)$/);
    assert.equal(byKey.testedAt.label, 'Tested at');
    assert.equal(byKey.testedAt.type, 'date');
    assert.match(byKey.testedAt.width, /^minmax\([\d.]+rem, [\d.]+rem\)$/);
  });

  it('template resolves TESTED columns without dropping them (mode-aware path)', () => {
    const template = ordersQueueGridTemplateFor(ORDERS_QUEUE_TESTED_COLUMNS);
    assert.ok(template.includes('--cf-col-tester'), 'tester track present');
    assert.ok(template.includes('--cf-col-testedAt'), 'testedAt track present');
    assert.ok(!template.includes('--cf-col-status'), 'status track demoted');
    assert.equal((template.match(/1fr/g) ?? []).length, 1, 'only title flexes');
  });

  it('sanitize against the TESTED canonical keeps tester/testedAt and inserts them for stale orders', () => {
    // A persisted order saved before the TESTED columns existed:
    const out = sanitizeOrdersQueueColumnOrder(
      ['date', 'age', 'status', 'qty', 'condition', 'platform', 'order', 'tracking'] as never[],
      ORDERS_QUEUE_TESTED_COLUMNS,
    );
    assert.ok((out as string[]).includes('tester'), 'tester inserted at canonical slot');
    assert.ok((out as string[]).includes('testedAt'), 'testedAt inserted at canonical slot');
    assert.ok(!(out as string[]).includes('status'), 'status is not a TESTED-mode column');
    assert.ok(!(out as string[]).includes('platform'), 'platform is retired');
    // The frozen identity pane is re-prepended in canonical order regardless
    // of where a stale persisted order put those keys.
    assert.deepEqual(out.slice(0, 3), ['select', 'order', 'title']);
    // And the default canonical still drops the TESTED-only keys:
    const roundTrip = sanitizeOrdersQueueColumnOrder(out);
    assert.ok(!(roundTrip as string[]).includes('tester'));
    assert.ok(!(roundTrip as string[]).includes('testedAt'));
  });
});

describe('plan §9 field contract — tester / tested-at raw resolution', () => {
  const row = (overrides: Record<string, unknown>): QueueRowRecord =>
    ({ id: 1, ...overrides }) as unknown as QueueRowRecord;

  it('nonSentinelTimestamp: empty / whitespace / the legacy "1" sentinel are missing', () => {
    assert.equal(nonSentinelTimestamp(null), null);
    assert.equal(nonSentinelTimestamp(''), null);
    assert.equal(nonSentinelTimestamp('   '), null);
    assert.equal(nonSentinelTimestamp('1'), null);
    assert.equal(nonSentinelTimestamp('2026-07-20 14:05:00'), '2026-07-20 14:05:00');
  });

  it('tested-at prefers test_date_time, then test_activity_at', () => {
    assert.equal(
      queueRowTestedAtRaw(row({ test_date_time: '2026-07-19 10:00:00', test_activity_at: '2026-07-20 14:05:00' })),
      '2026-07-19 10:00:00',
    );
    assert.equal(
      queueRowTestedAtRaw(row({ test_date_time: null, test_activity_at: '2026-07-20 14:05:00' })),
      '2026-07-20 14:05:00',
    );
    assert.equal(
      queueRowTestedAtRaw(row({ test_date_time: '1', test_activity_at: '2026-07-20 14:05:00' })),
      '2026-07-20 14:05:00',
      'sentinel test_date_time falls through to station activity',
    );
    assert.equal(queueRowTestedAtRaw(row({})), null);
  });

  it('tester name prefers the scan actor (tested_by_name) over the assignee (tester_name)', () => {
    assert.equal(
      queueRowTesterNameRaw(row({ tested_by_name: 'Alex Chen', tester_name: 'Sam Assignee' })),
      'Alex Chen',
    );
    assert.equal(queueRowTesterNameRaw(row({ tested_by_name: '  ', tester_name: 'Sam Assignee' })), 'Sam Assignee');
    assert.equal(queueRowTesterNameRaw(row({})), null);
  });
});

describe('React Compiler trap mitigation (plan § React Compiler trap)', () => {
  it('useGridSurface ships with the "use no memo" directive in its prologue', () => {
    const source = readFileSync(
      new URL('../../../design-system/components/grid/useGridSurface.ts', import.meta.url),
      'utf8',
    );
    const prologue = source.slice(0, 200);
    assert.ok(
      /^['"]use no memo['"];/m.test(prologue),
      'useGridSurface.ts must open with the "use no memo" directive — removing it lets a future reactCompiler flip freeze the grid on sort/visibility changes',
    );
  });
});
