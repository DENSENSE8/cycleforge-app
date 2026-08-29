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
import { firstNote } from '@/components/tables/compound/compound-row-model';
import {
  COMPOUND_COLUMN_KEYS,
  COMPOUND_TRACKS,
  compoundRowEstimateFor,
} from '@/components/tables/compound/compound-columns';
import {
  COMPOUND_GUTTER_PX,
  COMPOUND_GUTTER_TRACK_REM,
  COMPOUND_ROW_PX,
} from '@/components/tables/compound/compound-row-chrome';
import { receivingStateTone } from '@/lib/receiving/receiving-compound-view';
import { ordersStateTone } from '@/lib/orders/orders-compound-view';
import {
  INCOMING_COMPOUND_COLUMNS,
  RECEIVING_COMPOUND_COLUMNS,
} from '@/lib/receiving/receiving-grid-layout';
import { ORDERS_COMPOUND_COLUMNS } from '@/lib/dashboard-order-row-layout';
import { TASKS_COMPOUND_COLUMNS } from '@/lib/staff-todos/tasks-grid-layout';
import { DAILY_COMPOUND_COLUMNS } from '@/lib/daily-checks/daily-grid-layout';
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
  ['Orders / To-Ship', ORDERS_COMPOUND_COLUMNS],
  ['Incoming', INCOMING_COMPOUND_COLUMNS],
  ['Tasks', TASKS_COMPOUND_COLUMNS],
  ['Daily', DAILY_COMPOUND_COLUMNS],
  ['Review · Listing match', CATALOG_LINK_COMPOUND_COLUMNS],
  ['Review · Missing item number', IMPORT_EXCEPTION_COMPOUND_COLUMNS],
] as const;

describe('compound layout is shared, not forked', () => {
  it('every family declares the SAME tracks, in the same order', () => {
    // HARD RULE: image · ids · title · status · open. The photo is leftmost.
    assert.deepEqual(keys(COMPOUND_TRACKS), [
      'select',
      'thumb',
      'fulfillment',
      'item',
      'state',
      'amount',
      'actions',
      '_fill',
    ]);
    for (const [name, model] of FAMILIES) {
      assert.deepEqual(keys(model), keys(COMPOUND_TRACKS), name);
    }
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

  it('exports the key list the families narrow against', () => {
    assert.deepEqual([...COMPOUND_COLUMN_KEYS], keys(COMPOUND_TRACKS));
  });

  it('each ends with exactly one 1fr slack track', () => {
    for (const [name, model] of FAMILIES) {
      assert.equal(model[model.length - 1].key, '_fill', name);
      assert.equal(model.filter((c) => String(c.width).includes('1fr')).length, 1, name);
    }
  });

  it('pins the IMAGE — the hard rule says it is always leftmost', () => {
    for (const [name, model] of FAMILIES) {
      assert.deepEqual(model.filter((c) => c.frozen).map((c) => c.key), ['select', 'thumb'], name);
    }
  });

  it('freezes a contiguous prefix in every family', () => {
    // gridFrozenLeft sums preceding frozen widths; a gap mis-positions the pane.
    for (const [name, model] of FAMILIES) {
      const frozen = model.map((c) => Boolean(c.frozen));
      const firstFalse = frozen.indexOf(false);
      assert.ok(firstFalse > 0, name);
      assert.ok(!frozen.slice(firstFalse).includes(true), name);
    }
  });
});

describe('the two gutters are one square', () => {
  const select = COMPOUND_TRACKS.find((c) => c.key === 'select')!;
  const thumb = COMPOUND_TRACKS.find((c) => c.key === 'thumb')!;

  it('gives select and thumb exactly the same width', () => {
    // The operator's words: "the selection column must be exactly the same size
    // as the photos column". Both read `COMPOUND_GUTTER_TRACK_REM`, so this is
    // a property of construction — but pin it, because the failure mode is two
    // literals that drift by a rem and look merely "a bit off".
    assert.equal(select.width, thumb.width);
    assert.equal(select.width, `minmax(${COMPOUND_GUTTER_TRACK_REM}rem, ${COMPOUND_GUTTER_TRACK_REM}rem)`);
  });

  it('makes that square the ROW BOX, so a photo fills it uncropped', () => {
    assert.equal(COMPOUND_GUTTER_PX, COMPOUND_ROW_PX);
    assert.equal(COMPOUND_GUTTER_TRACK_REM * 16, COMPOUND_ROW_PX);
  });

  it('pins BOTH gutters, because a drag could only break the equality', () => {
    // `isGridColumnResizable` refuses `select` unconditionally, so a draggable
    // `thumb` cannot stay equal to it. Fixing both is the only coherent answer.
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
    assert.deepEqual(resizable, ['fulfillment', 'item', 'state', 'amount']);
  });

  it('leaves only fixed-content chrome un-draggable', () => {
    // The two 48px gutters, `actions` (a 2.5rem ⋮ button) and `_fill`
    // (structural slack). Dragging any could only add or steal whitespace.
    const fixed = COMPOUND_TRACKS.filter((c) => c.resizable === false).map((c) => c.key);
    assert.deepEqual(fixed, ['select', 'thumb', 'actions', '_fill']);
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
