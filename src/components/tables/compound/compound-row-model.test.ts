/**
 * The compound seam: FOUR families, ONE renderer and ONE column declaration.
 *
 * These used to assert that Receiving's and Orders' hand-copied column arrays
 * had stayed byte-identical. That is a weaker property than it looks: it lets
 * the drift happen and then reports it, and it says nothing about the third and
 * fourth family. The arrays are now DERIVED from `COMPOUND_TRACKS`, so equality
 * is structural — and what is left to pin is the thing a cast cannot check:
 * that every family's key union really does carry the compound keys, and that
 * nobody has quietly reintroduced a per-family array.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  firstNote,
  formatCompoundDelayAgeFace,
  formatCompoundStageStampFace,
  formatDayGap,
  compoundDatesHoverLabel,
  COMPOUND_DATES_START_HOVER,
  COMPOUND_DATES_ORDER_HOVER,
  COMPOUND_DATES_DUE_HOVER,
} from '@/components/tables/compound/compound-row-model';
import {
  COMPOUND_COLUMN_KEYS,
  COMPOUND_TRACKS,
  compoundRowEstimateFor,
} from '@/components/tables/compound/compound-columns';
import { gridHeaderShowsLabel } from '@/design-system/components/grid/grid-column-geometry';
import {
  COMPOUND_GUTTER_PX,
  COMPOUND_GUTTER_TRACK_REM,
  COMPOUND_ROW_PX,
} from '@/components/tables/compound/compound-row-chrome';
import { receivingStateTone } from '@/lib/receiving/receiving-compound-view';
import { ordersStateTone } from '@/lib/orders/orders-compound-view';
import { RECEIVING_COMPOUND_COLUMNS } from '@/lib/receiving/receiving-grid-layout';
import { ORDERS_COMPOUND_COLUMNS } from '@/lib/dashboard-order-row-layout';
import { TASKS_COMPOUND_COLUMNS } from '@/features/tasks/grid/tasks-table-definition';
import { DAILY_COMPOUND_COLUMNS } from '@/features/home/grid/daily-table-definition';
import { CATALOG_LINK_COMPOUND_COLUMNS } from '@/features/review/catalog-link/grid/catalog-link-grid-layout';
import { IMPORT_EXCEPTION_COMPOUND_COLUMNS } from '@/features/review/catalog-link/grid/import-exception-grid-layout';

const keys = (c: readonly { key: string }[]) => c.map((x) => x.key);
const widths = (c: readonly { key: string; width?: string }[]) =>
  c.map((x) => `${x.key}:${x.width}`);

/**
 * Every family that mounts the compound layout. A new one adds a line HERE —
 * which is the point: the list is what makes "every DB table" checkable instead
 * of aspirational.
 */
const FAMILIES = [
  ['Receiving (Unbox · History · Testing)', RECEIVING_COMPOUND_COLUMNS],
  // Tasks and Daily are NOT here: both are engine-record families
  // (`TASKS_FAMILY`, `DAILY_FAMILY`), so the engine binds their identity fact
  // into the identity chrome track and the array is DERIVED rather than the
  // shared object. Each gets its own assertion below, beside Orders.
  ['Review · Listing match', CATALOG_LINK_COMPOUND_COLUMNS],
  ['Review · Missing item number', IMPORT_EXCEPTION_COMPOUND_COLUMNS],
] as const;

/**
 * Orders MATERIALIZES its status band after `state` (`materializeTracks`);
 * the product default binds `orders.picked` into `status:1`. Shared families
 * stay identical.
 */
/**
 * No `amount` — line money lives under the title on every family
 * (`ensureLineMoneySubtitle`). Copy order / copy tracking live on the identity
 * chips. The ⋮ track is gone from the shared skeleton for everyone.
 */
const ORDERS_KEYS = [
  'select',
  'fulfillment',
  'thumb',
  'item',
  'dates',
  'state',
  'status:1',
  '_fill',
] as const;

const DAILY_KEYS = [...ORDERS_KEYS] as const;

describe('compound layout is shared, not forked', () => {
  it('every shared family declares the SAME tracks, in the same order', () => {
    // HARD RULE: select · ids · image · title · dates · status · slack.
    assert.deepEqual(keys(COMPOUND_TRACKS), [
      'select',
      'fulfillment',
      'thumb',
      'item',
      'dates',
      'state',
      '_fill',
    ]);
    for (const [name, model] of FAMILIES) {
      assert.deepEqual(keys(model), keys(COMPOUND_TRACKS), name);
    }
  });

  it('Orders derives the shared tracks plus a materialized status band after state', () => {
    assert.deepEqual(keys(ORDERS_COMPOUND_COLUMNS), [...ORDERS_KEYS]);
    const stateIdx = ORDERS_COMPOUND_COLUMNS.findIndex((c) => c.key === 'state');
    const status1 = ORDERS_COMPOUND_COLUMNS[stateIdx + 1];
    assert.equal(status1?.key, 'status:1');
    // The track KEY is the slot; the FIELD is the product default binding.
    assert.equal(status1?.fieldId, 'orders.picked');
    assert.equal(status1?.label, 'Pick');
  });

  it('Daily derives the same tracks with its identity bound into the id track', () => {
    assert.deepEqual(keys(DAILY_COMPOUND_COLUMNS), [...DAILY_KEYS]);
    const id = DAILY_COMPOUND_COLUMNS.find((c) => c.key === 'fulfillment');
    // The header word stays the engine's `Id`; the FIELD is what it paints.
    assert.equal(id?.fieldId, 'daily.item');
    // Every shared track keeps the shared geometry; only the materialized
    // status band is Daily's own.
    assert.deepEqual(
      widths(DAILY_COMPOUND_COLUMNS.filter((c) => !c.key.startsWith('status:'))),
      widths(COMPOUND_TRACKS),
    );
    const stateIdx = DAILY_COMPOUND_COLUMNS.findIndex((c) => c.key === 'state');
    const owner = DAILY_COMPOUND_COLUMNS[stateIdx + 1];
    assert.equal(owner?.key, 'status:1');
    assert.equal(owner?.fieldId, 'daily.owner');
    assert.equal(owner?.label, 'Owner');
  });

  it('Tasks derives the shared tracks with its identity bound into the id track', () => {
    assert.deepEqual(keys(TASKS_COMPOUND_COLUMNS), keys(COMPOUND_TRACKS));
    assert.deepEqual(widths(TASKS_COMPOUND_COLUMNS), widths(COMPOUND_TRACKS));
    const id = TASKS_COMPOUND_COLUMNS.find((c) => c.key === 'fulfillment');
    // The header word stays the engine's `Id`; the FIELD is what it paints.
    assert.equal(id?.fieldId, 'tasks.task');
  });

  it('and the same geometry — the tables must read as one product', () => {
    for (const [name, model] of FAMILIES) {
      assert.deepEqual(widths(model), widths(COMPOUND_TRACKS), name);
    }
  });

  it('is the same OBJECT, so equality cannot be broken by an edit', () => {
    // The stronger form of the two assertions above: a family that hand-rolls
    // an array which happens to match today fails here immediately, rather
    // than passing until someone edits one copy.
    for (const [name, model] of FAMILIES) {
      assert.equal(model, COMPOUND_TRACKS as unknown, `${name} must derive, not copy`);
    }
  });

  it('Orders still mounts every shared track (prefix + suffix around the status band)', () => {
    const sharedKeys = new Set(keys(COMPOUND_TRACKS));
    for (const col of ORDERS_COMPOUND_COLUMNS) {
      if (col.key.startsWith('status:')) continue;
      assert.ok(sharedKeys.has(col.key), `Orders lost shared track ${col.key}`);
    }
  });

  it('exports the key list the families narrow against', () => {
    assert.deepEqual([...COMPOUND_COLUMN_KEYS], keys(COMPOUND_TRACKS));
  });

  it('each ends with exactly one 1fr slack track', () => {
    for (const [name, model] of FAMILIES) {
      assert.equal(model[model.length - 1].key, '_fill', name);
      assert.equal(model.filter((c) => String(c.width).includes('1fr')).length, 1, name);
    }
    assert.equal(ORDERS_COMPOUND_COLUMNS[ORDERS_COMPOUND_COLUMNS.length - 1].key, '_fill');
    assert.equal(
      ORDERS_COMPOUND_COLUMNS.filter((c) => String(c.width).includes('1fr')).length,
      1,
    );
  });

  it('pins the IDENTITY pane — select · ids · image', () => {
    for (const [name, model] of FAMILIES) {
      assert.deepEqual(
        model.filter((c) => c.frozen).map((c) => c.key),
        ['select', 'fulfillment', 'thumb'],
        name,
      );
    }
    assert.deepEqual(
      ORDERS_COMPOUND_COLUMNS.filter((c) => c.frozen).map((c) => c.key),
      ['select', 'fulfillment', 'thumb'],
    );
    const thumb = COMPOUND_TRACKS.find((c) => c.key === 'thumb');
    assert.equal(thumb?.gridLabel, 'Image');
    assert.equal(thumb?.type, 'image');
    // The photo gutter explicitly keeps its word even though the track is
    // narrow; headerForceLabel outranks the ordinary image-glyph fallback.
    assert.equal(gridHeaderShowsLabel(thumb!), true);
  });

  it('freezes a contiguous prefix in every family', () => {
    // gridFrozenLeft sums preceding frozen widths; a gap mis-positions the pane.
    for (const [name, model] of [...FAMILIES, ['Orders / To-Ship', ORDERS_COMPOUND_COLUMNS] as const]) {
      const frozen = model.map((c) => Boolean(c.frozen));
      const firstFalse = frozen.indexOf(false);
      assert.ok(firstFalse > 0, name);
      assert.ok(!frozen.slice(firstFalse).includes(true), name);
    }
  });
});

describe('the photo gutter is a square; the select gutter is not', () => {
  const select = COMPOUND_TRACKS.find((c) => c.key === 'select')!;
  const thumb = COMPOUND_TRACKS.find((c) => c.key === 'thumb')!;

  it('keeps the photo gutter as the ROW BOX so a photo fills it uncropped', () => {
    assert.equal(COMPOUND_GUTTER_PX, COMPOUND_ROW_PX);
    assert.equal(COMPOUND_GUTTER_TRACK_REM * 16, COMPOUND_ROW_PX);
    assert.equal(thumb.width, `minmax(${COMPOUND_GUTTER_TRACK_REM}rem, ${COMPOUND_GUTTER_TRACK_REM}rem)`);
  });

  it('keeps select narrower than the photo — a 16px checkbox does not need a 48px well', () => {
    assert.notEqual(select.width, thumb.width);
    assert.equal(select.resizable, false);
    assert.equal(thumb.resizable, false);
  });
});

describe('column widths are operator-adjustable', () => {
  it('every DATA track can be dragged', () => {
    // The complaint this answers: a fixed 11rem `fulfillment` left a visible
    // gutter between a short order chip and the item title on every row, and no
    // operator could close it. Width is now a default, not a ceiling.
    const resizable = COMPOUND_TRACKS.filter((c) => c.resizable !== false).map((c) => c.key);
    assert.deepEqual(resizable, ['fulfillment', 'item', 'dates', 'state']);
  });

  it('leaves only fixed-content chrome un-draggable', () => {
    // The two gutters and `_fill` (structural slack). Dragging any could only
    // add or steal whitespace.
    const fixed = COMPOUND_TRACKS.filter((c) => c.resizable === false).map((c) => c.key);
    assert.deepEqual(fixed, ['select', 'thumb', '_fill']);
  });

  it('gives every draggable track a content floor', () => {
    // Without a floor a drag can collapse a track to nothing and the row's
    // content clips with no way back except a prefs reset.
    for (const col of COMPOUND_TRACKS) {
      if (col.resizable === false) continue;
      assert.ok(
        (col.minTrackRem ?? 0) > 0,
        `${col.key} is draggable and must declare a minimum`,
      );
    }
  });
});

describe('state tone is neutral-by-default on every family', () => {
  it('reserves the loud tone for rows that need a human', () => {
    assert.equal(receivingStateTone('RECEIVING_EXCEPTION'), 'alert');
    assert.equal(receivingStateTone('DAMAGED'), 'alert');
    assert.equal(ordersStateTone('Blocked'), 'alert');
  });

  it('marks completed progress as done', () => {
    assert.equal(receivingStateTone('COMPLETE'), 'done');
    assert.equal(ordersStateTone('Tested'), 'done');
  });

  it('leaves ordinary movement neutral', () => {
    assert.equal(receivingStateTone('IN_PROGRESS'), 'neutral');
    assert.equal(ordersStateTone('Pending'), 'neutral');
    assert.equal(receivingStateTone(null), 'neutral');
    assert.equal(ordersStateTone(undefined), 'neutral');
  });
});

describe('firstNote', () => {
  it('takes the most specific note and never concatenates', () => {
    assert.equal(firstNote(['line note', 'carton note']), 'line note');
    assert.equal(firstNote([null, 'carton note']), 'carton note');
  });
  it('treats whitespace as absent', () => {
    assert.equal(firstNote(['   ', null, undefined]), null);
    assert.equal(firstNote(['  hi  ']), 'hi');
  });
});

describe('every table measures the same row', () => {
  it('one constant owns the row box — paint AND the virtualizer estimate', () => {
    // Receiving rendered a single visible line while To-Ship rendered two,
    // because `ReceivingGridRow` pinned itself to the HEADER band constant
    // (`PRIMARY_CHROME_ROW_FACE`, h-7 = 28px, shrink-0) while the orders row
    // carried no height class at all. A 48px compound cell inside a 28px
    // shrink-0 row overflows and `[contain:layout_style]` clips it silently.
    //
    // The rule this pins: a compound row's height is a property of what it
    // CONTAINS, and it comes from exactly one number.
    assert.equal(COMPOUND_ROW_PX, 48);
  });

  it('feeds that SAME constant to the virtualizer', () => {
    // The virtualizer sizes its scroll runway from `rowEstimate`. A compound
    // table left on the flat default (40) under-measures every row by 8px, and
    // the error compounds the further down the list you scroll.
    for (const [name, model] of FAMILIES) {
      assert.equal(compoundRowEstimateFor(model), COMPOUND_ROW_PX, name);
    }
  });

  it('leaves a flat spreadsheet on the house default', () => {
    // The estimate is keyed off the MOUNTED model, not a flag, so a flat table
    // must not inherit the taller box.
    assert.equal(
      compoundRowEstimateFor([{ key: 'select' }, { key: 'title' }, { key: 'status' }]),
      undefined,
    );
  });

  it('neither row component hard-codes a height class', async () => {
    // A DOM/behaviour assertion is the honest form here, but the cheap
    // structural guarantee is that the constant is exported from ONE module
    // and every family imports it rather than declaring its own.
    const mod = await import('@/components/tables/compound/compound-row-chrome');
    assert.equal(mod.COMPOUND_ROW_PX, COMPOUND_ROW_PX);
    assert.equal(mod.COMPOUND_GUTTER_PX, COMPOUND_GUTTER_PX);
  });
});

describe('formatDayGap — the shortest unit that still reads true', () => {
  it('counts days under a month', () => {
    assert.equal(formatDayGap(0), '0d');
    assert.equal(formatDayGap(2), '2d');
    assert.equal(formatDayGap(29), '29d');
  });

  it('rolls up to months, then years, so the face stays two characters', () => {
    assert.equal(formatDayGap(30), '1m');
    assert.equal(formatDayGap(75), '2m');
    assert.equal(formatDayGap(364), '12m');
    assert.equal(formatDayGap(400), '1y');
  });
});

describe('formatCompoundDelayAgeFace — the DATES deadline line', () => {
  it('paints the AGE, never the civil day', () => {
    const face = formatCompoundDelayAgeFace({
      days: 2,
      overdue: true,
      dateLabel: 'Sep 2',
      dateKey: '2026-09-02',
    });
    assert.equal(face.text, '2d late');
    // The operator's rule: the date belongs to the hover, not to the cell.
    assert.ok(!face.text.includes('Sep'));
  });

  it('rolls a long overdue up to months', () => {
    assert.equal(
      formatCompoundDelayAgeFace({ days: 45, overdue: true, dateKey: '2026-07-21' }).text,
      '1m late',
    );
  });

  it('says due today rather than 0d late', () => {
    const face = formatCompoundDelayAgeFace({
      days: 0,
      overdue: false,
      dateKey: '2026-09-04',
      dueToday: true,
    });
    assert.equal(face.text, 'Due today');
  });

  it('counts down to a future deadline', () => {
    const face = formatCompoundDelayAgeFace({
      days: 0,
      overdue: false,
      dateKey: '2026-09-20',
      daysUntil: 16,
    });
    assert.equal(face.text, 'in 16d');
  });

  it('falls back to On time for a deadline with no countdown', () => {
    assert.equal(
      formatCompoundDelayAgeFace({ days: 0, overdue: false, dateKey: '2026-09-20' }).text,
      'On time',
    );
  });

  it('paints the missing mark when there is no deadline at all', () => {
    assert.equal(formatCompoundDelayAgeFace(null, { missingText: '--' }).text, '--');
  });

  it('paints faceLabel for secondary temporal facts (dwell) instead of --', () => {
    const face = formatCompoundDelayAgeFace({
      days: 0,
      overdue: false,
      faceLabel: '8d',
    });
    assert.equal(face.text, '8d');
    assert.doesNotMatch(face.text, /late|On time|Due/);
  });
});

describe('compoundDatesHoverLabel — DATES cursor chip', () => {
  it('always names the line so every product table gets a hover', () => {
    assert.equal(compoundDatesHoverLabel('start'), COMPOUND_DATES_START_HOVER);
    assert.equal(compoundDatesHoverLabel('order'), COMPOUND_DATES_ORDER_HOVER);
    assert.equal(COMPOUND_DATES_ORDER_HOVER, COMPOUND_DATES_START_HOVER);
    assert.equal(compoundDatesHoverLabel('due'), COMPOUND_DATES_DUE_HOVER);
  });

  it('lets a family tip that already names the Hash line own the chip', () => {
    assert.equal(
      compoundDatesHoverLabel('start', 'Ordered · Aug 20, 2026'),
      'Ordered · Aug 20, 2026',
    );
    assert.equal(
      compoundDatesHoverLabel('start', 'Last seen Sep 2 · Enrolled Sep 2'),
      'Last seen Sep 2 · Enrolled Sep 2',
    );
  });

  it('prefixes anonymous start detail with Start date', () => {
    assert.equal(
      compoundDatesHoverLabel('start', 'Aug 20, 2026'),
      'Start date · Aug 20, 2026',
    );
  });

  it('rewrites Ship by tips to Due date; keeps Dwell verbatim', () => {
    assert.equal(
      compoundDatesHoverLabel('due', 'Ship by · Aug 17 · 2 days late'),
      'Due date · Aug 17 · 2 days late',
    );
    assert.equal(compoundDatesHoverLabel('due', 'Dwell · 8d'), 'Dwell · 8d');
  });
});

describe('formatCompoundStageStampFace — short time on the track', () => {
  it('paints time-of-day from the raw instant, not Sep 4, 9:41 AM', () => {
    const face = formatCompoundStageStampFace({
      who: 'SA',
      at: 'Sep 4, 9:41 AM',
      atInstant: '2026-07-13T16:15:00-07:00',
      station: null,
    });
    assert.ok(face);
    assert.doesNotMatch(String(face), /Sep|Jul|,/);
  });

  it('falls back to the long stamp when there is no instant', () => {
    assert.equal(
      formatCompoundStageStampFace({
        who: 'SA',
        at: 'Sep 4, 9:41 AM',
        station: null,
      }),
      'Sep 4, 9:41 AM',
    );
  });
});
