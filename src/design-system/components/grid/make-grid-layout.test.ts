/**
 * `makeGridLayout` derives what sixteen per-family `*-grid-layout.ts` modules
 * used to hand-write. These are the GOLDENS that keep the derivation honest.
 *
 * ## Why goldens and not "derived === the family's function"
 *
 * The migration was proven by exactly that equivalence — the derived template,
 * sticky offset, frozen/sortable answer and default direction matched Ready's
 * and Warranty's own functions for the full model *and every one-column-hidden
 * subset*, and five mutation probes (template ignoring the resolved list;
 * `frozenLeft` summing the wrong array; dropping the select exclusion;
 * defaultDir pinned ascending; `isFrozen` reading the wrong flag) each turned
 * that suite red.
 *
 * But those families now DELEGATE to this module, so the same assertions would
 * compare a thing to itself — green forever, proving nothing. That is the trap
 * this repo has already paid for once (a "sorts numerically" test that passed
 * with the numeric branch deleted). So the equivalence assertions were replaced
 * by the concrete strings they were producing, captured from the
 * pre-migration implementation.
 *
 * ## Why a SUBSET template is pinned too
 *
 * `frozenLeft` sums the locked columns before a key over the FULL model, while
 * `template` runs over the RESOLVED one. Mixing those up passes on the default
 * view and breaks the moment a staffer hides a column, so the golden covers a
 * hidden-column view as well as the full one.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { makeGridLayout } from './make-grid-layout';
import {
  READY_GRID_COLUMNS,
  defaultDirForReadyGridSort,
  isReadyGridFrozen,
  isReadyGridSortable,
  readyGridFrozenLeft,
  readyGridTemplate,
} from '@/components/outbound/ready/grid/ready-grid-layout';
import {
  WARRANTY_GRID_COLUMNS,
  defaultDirForWarrantyGridSort,
  isWarrantyGridFrozen,
  warrantyGridFrozenLeft,
  warrantyGridTemplate,
} from '@/components/warranty/grid/warranty-grid-layout';

const ROW_PX = 'var(--cf-queue-row-px, calc(0.75rem * var(--cf-density, 1)))';
const SELECT_TRACK = 'var(--cf-col-select, calc(2rem * var(--cf-density, 1)))';
const TITLE_TRACK = 'minmax(var(--cf-col-title, calc(12rem * var(--cf-density, 1))), 1fr)';
/** Every frozen pane here is `select · title`, so title's offset is the only sum. */
const TITLE_FROZEN_LEFT = `calc(${ROW_PX} + ${SELECT_TRACK})`;
const UNFROZEN_LEFT = `calc(${ROW_PX})`;

function track(key: string, rem: string): string {
  return `var(--cf-col-${key}, calc(${rem} * var(--cf-density, 1)))`;
}

describe('makeGridLayout — Ready', () => {
  it('pins the full grid template', () => {
    assert.equal(
      readyGridTemplate(),
      [
        SELECT_TRACK,
        TITLE_TRACK,
        track('verdict', '5.5rem'),
        track('destination', '7rem'),
        track('reasons', '10rem'),
        track('velocity', '5.5rem'),
        track('condition', '5.5rem'),
        track('tested', '6.5rem'),
        track('action', '6.5rem'),
      ].join(' '),
    );
  });

  it('drops the hidden track from a resolved view', () => {
    const withoutVelocity = READY_GRID_COLUMNS.filter((c) => c.key !== 'velocity');
    const template = readyGridTemplate(withoutVelocity);
    assert.ok(!template.includes('--cf-col-velocity'), 'hidden column still has a track');
    // One `--cf-col-<key>` per rendered track; title nests its var inside a
    // `minmax()`, so count the variables rather than splitting on `var(`.
    assert.equal(
      template.match(/--cf-col-/g)?.length,
      withoutVelocity.length,
      'wrong track count for the resolved view',
    );
  });

  it('pins the sticky offsets — title sums the select gutter, nothing else does', () => {
    assert.equal(readyGridFrozenLeft('title'), TITLE_FROZEN_LEFT);
    assert.equal(readyGridFrozenLeft('select'), UNFROZEN_LEFT);
    assert.equal(readyGridFrozenLeft('tested'), UNFROZEN_LEFT);
  });

  it('freezes select · title and nothing else', () => {
    const frozen = READY_GRID_COLUMNS.filter((c) => isReadyGridFrozen(c.key)).map((c) => c.key);
    assert.deepEqual(frozen, ['select', 'title']);
  });

  it('sorts every fact track, never the gutter / reasons / action', () => {
    const sortable = READY_GRID_COLUMNS.filter((c) => isReadyGridSortable(c.key)).map((c) => c.key);
    assert.deepEqual(sortable, [
      'title',
      'verdict',
      'destination',
      'velocity',
      'condition',
      'tested',
    ]);
  });

  it('opens tested newest-first and everything else ascending', () => {
    assert.equal(defaultDirForReadyGridSort('tested'), 'desc');
    assert.equal(defaultDirForReadyGridSort('title'), 'asc');
    assert.equal(defaultDirForReadyGridSort('condition'), 'asc');
  });
});

describe('makeGridLayout — Warranty', () => {
  it('pins the full grid template', () => {
    assert.equal(
      warrantyGridTemplate(),
      [
        SELECT_TRACK,
        TITLE_TRACK,
        track('claim', '8rem'),
        track('serial', '8rem'),
        track('customer', '8rem'),
        track('status', '6rem'),
        track('warranty', '6.5rem'),
        track('logged', '5.5rem'),
        track('ticket', '2.5rem'),
      ].join(' '),
    );
  });

  it('pins the sticky offsets', () => {
    assert.equal(warrantyGridFrozenLeft('title'), TITLE_FROZEN_LEFT);
    assert.equal(warrantyGridFrozenLeft('select'), UNFROZEN_LEFT);
    assert.equal(warrantyGridFrozenLeft('logged'), UNFROZEN_LEFT);
  });

  it('freezes select · title and nothing else', () => {
    const frozen = WARRANTY_GRID_COLUMNS.filter((c) => isWarrantyGridFrozen(c.key)).map(
      (c) => c.key,
    );
    assert.deepEqual(frozen, ['select', 'title']);
  });

  /**
   * `warranty` holds days REMAINING, so it opens ASCENDING on purpose — fewest
   * days left first is the only reason to sort that column at all. It is the
   * one place `descFirstKeys` had to be read rather than assumed from the type.
   */
  it('opens logged newest-first but the warranty clock fewest-days-first', () => {
    assert.equal(defaultDirForWarrantyGridSort('logged'), 'desc');
    assert.equal(defaultDirForWarrantyGridSort('warranty'), 'asc');
  });

  it('refuses the select gutter as a sort target even when the model forgets', () => {
    // Every family today happens to declare `sortable: false` on `select`, so
    // the exclusion in `makeGridLayout` is a FLOOR that no real column model
    // exercises — a mutation probe deleting it left the suite green. A floor
    // nothing tests is a line that quietly stops being true.
    const forgetful = makeGridLayout({
      columns: [
        { key: 'select', width: 'minmax(2rem, 2rem)', frozen: true },
        { key: 'title', width: 'minmax(8rem, 1fr)', frozen: true },
      ],
    });
    assert.equal(forgetful.isSortable('select'), false, 'the gutter is never a sort target');
    assert.equal(forgetful.isSortable('title'), true);
  });

  it('answers an unknown key without throwing', () => {
    const derived = makeGridLayout({ columns: WARRANTY_GRID_COLUMNS });
    assert.equal(derived.isFrozen('nope'), false);
    assert.equal(derived.isSortable('nope'), false);
  });
});
