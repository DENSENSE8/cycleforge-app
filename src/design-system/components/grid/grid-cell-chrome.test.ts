import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  LEDGER_GRID_CELL_INSET,
  LEDGER_GRID_FROZEN_CELL,
  LEDGER_GRID_ROW_CONTAIN,
  LEDGER_GRID_WIDTH_VAR,
  LEDGER_GRID_ROW_WIDTH_CLASS,
  ledgerGridCell,
  ledgerGridRowShellClass,
  ledgerGridWidthVarValue,
} from './grid-cell-chrome';

/**
 * Shared spreadsheet cell chrome — composed identically by sticky headers,
 * leaf rows, and group summaries. Locks the helper so the three can never drift.
 *
 * 1B: vertical `border-r` is retired — BOTTOM row rules live on the airtable
 * CSS skin / row shell. The `rule` arg stays API-compatible but is a no-op.
 */
describe('ledgerGridCell — shared spreadsheet cell chrome', () => {
  it('default cell: horizontal inset, vertically centered, no vertical rule (1B)', () => {
    const cls = ledgerGridCell();
    assert.ok(cls.includes(LEDGER_GRID_CELL_INSET), 'carries the horizontal inset');
    assert.ok(!cls.includes('border-r'), 'no vertical column rule (1B)');
    assert.ok(cls.includes('items-center'), 'centers content in the stretched track');
  });

  it('rule: false stays without a vertical rule (API compat)', () => {
    assert.ok(!ledgerGridCell({ rule: false }).includes('border-r'), 'no rule when rule=false');
  });

  it('control gutter drops the horizontal inset (inset: none)', () => {
    assert.ok(
      !ledgerGridCell({ inset: 'none' }).includes(LEDGER_GRID_CELL_INSET),
      'inset:none omits the px inset for narrow select/status gutters',
    );
    assert.ok(!ledgerGridCell({ inset: 'none' }).includes('border-r'), 'inset:none still has no vertical rule');
  });

  it('grid inset clips overflow at the cell edge (spreadsheet discipline)', () => {
    assert.ok(ledgerGridCell({ inset: 'grid' }).includes('overflow-hidden'), 'airtable cells are bounded');
    assert.ok(!ledgerGridCell({ inset: 'cell' }).includes('overflow-hidden'), 'board cells stay unclipped');
  });

  it('uses a Tier-1 density-aware step, not an inset-* intent', () => {
    assert.doesNotMatch(ledgerGridCell(), /\binset-(chip|field|cozy|card|empty)\b/);
  });
});

describe('ledgerGridRowShellClass / frozen / width var', () => {
  it('desktop shell stretches cells and drops the inter-cell gap', () => {
    const desktop = ledgerGridRowShellClass(false);
    assert.ok(desktop.includes('items-stretch'), 'cells stretch full-height');
    assert.ok(!desktop.includes('gap-x'), 'no inter-cell gap — cells butt together (spreadsheet)');
    assert.ok(desktop.includes('grid'), 'desktop is a CSS grid');
    assert.ok(
      desktop.includes(LEDGER_GRID_ROW_CONTAIN),
      'desktop rows isolate layout so a cell mutation cannot reflow siblings',
    );
    assert.ok(
      !LEDGER_GRID_ROW_CONTAIN.includes('paint'),
      'contain:paint would clip sticky frozen identity cells',
    );
  });

  /**
   * The guard the old assertion could not be.
   *
   * `assert.ok(cls.includes(LEDGER_GRID_WIDTH_VAR))` passed for the entire life
   * of the bug: the class NAME was on every row while no CSS rule existed to
   * give it a width, because it was built as a Tailwind arbitrary value inside
   * a template literal and the scanner never emitted it. A class string is not
   * a style. This reads the stylesheet and asserts the rule is really there.
   */
  it('the shared row width is a REAL css rule, not just a class name', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
    const rule = new RegExp(
      `\\.${LEDGER_GRID_ROW_WIDTH_CLASS}\\s*\\{[^}]*width:\\s*var\\(${LEDGER_GRID_WIDTH_VAR}\\)`,
    );
    assert.match(
      css.replace(/\s+/g, ' '),
      new RegExp(rule.source.replace(/\\s\*/g, ' ?')),
      `globals.css must define .${LEDGER_GRID_ROW_WIDTH_CLASS} { width: var(${LEDGER_GRID_WIDTH_VAR}) } — ` +
        'without it every row falls back to width:auto and the grid loses horizontal scroll.',
    );
  });

  it('mobile shell stays a stacked flex column', () => {
    assert.ok(ledgerGridRowShellClass(true).includes('flex-col'), 'mobile stacks');
  });

  it('scrollMinContent row shell shares the grid width var (locked columns)', () => {
    const cls = ledgerGridRowShellClass(false, { scrollMinContent: true });
    assert.ok(cls.includes(LEDGER_GRID_ROW_WIDTH_CLASS), 'shared width class locks tracks across rows');
    assert.ok(!cls.includes('w-max'), 'never w-max — that drifted columns per product title');
    assert.ok(
      !ledgerGridRowShellClass(false).includes(LEDGER_GRID_ROW_WIDTH_CLASS),
      'board keeps w-full min-w-0',
    );
    assert.equal(
      ledgerGridWidthVarValue(41.25),
      'max(100%, calc(41.25rem * var(--cf-density, 1)))',
    );
    assert.equal(
      ledgerGridWidthVarValue(41.25, 900),
      'max(100%, calc(41.25rem * var(--cf-density, 1)), 900px)',
      'live resized px lifts the width-var floor beside the density-scaled rem sum',
    );
  });

  it('frozen sticky class pins cells during h-scroll', () => {
    assert.ok(LEDGER_GRID_FROZEN_CELL.includes('sticky'));
    assert.ok(LEDGER_GRID_FROZEN_CELL.includes('bg-inherit'));
  });
});
