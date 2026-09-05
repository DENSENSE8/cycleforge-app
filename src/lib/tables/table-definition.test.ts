/**
 * Table definition schema — the structural laws an author (human or model)
 * must not be able to break silently.
 *
 * Each rejection below corresponds to a rule that fails as a LAYOUT bug rather
 * than an error: a mis-ordered frozen pane pins at the wrong origin, a second
 * flex track makes slack absorption unpredictable, a fat default set turns a
 * dense queue into soup. Those are exactly the failures a validator has to
 * catch, because none of them throws on its own.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_DEFAULT_VISIBLE_TRACKS,
  defaultVisibleTrackKeys,
  parseTableDefinition,
  tableDefinitionSchema,
  type TableDefinitionColumn,
} from './table-definition';

const CAPABILITIES = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: true,
};

function definition(columns: TableDefinitionColumn[]) {
  return {
    id: 'receiving.browse',
    tableId: 'receiving',
    entityFamily: 'receiving',
    cellMapKey: 'receiving',
    ariaLabel: 'Receiving carton lines',
    testId: 'receiving-grid-body',
    surface: 'sheet',
    showDayHeaders: false,
    capabilities: CAPABILITIES,
    columns,
  };
}

const SELECT: TableDefinitionColumn = {
  key: 'select',
  width: 'minmax(2rem, 2rem)',
  sortable: false,
  frozen: true,
  resizable: false,
};
const ORDER: TableDefinitionColumn = {
  key: 'order',
  width: 'minmax(5.5rem, 5.5rem)',
  label: 'Order',
  type: 'id',
  align: 'start',
  frozen: true,
  resizable: false,
};
const TITLE: TableDefinitionColumn = {
  key: 'title',
  width: 'minmax(8rem, 1fr)',
  label: 'Product Title',
  gridLabel: 'Product',
  type: 'text',
  align: 'start',
  resizable: true,
};

function track(key: string): TableDefinitionColumn {
  return { key, width: 'minmax(4rem, 4rem)', label: key, type: 'text', hideKey: key };
}

describe('table definition schema', () => {
  it('accepts the golden shape', () => {
    const parsed = parseTableDefinition(definition([SELECT, ORDER, TITLE]));
    assert.equal(parsed.id, 'receiving.browse');
    assert.equal(parsed.columns.length, 3);
  });

  it('keeps headerForceLabel as an authored opt-out of the fit gate', () => {
    const thumb: TableDefinitionColumn = {
      key: 'thumb',
      width: 'minmax(3rem, 3rem)',
      label: 'Image',
      gridLabel: 'Image',
      type: 'image',
      headerForceLabel: true,
      frozen: true,
      sortable: false,
      resizable: false,
    };
    const parsed = parseTableDefinition(definition([SELECT, thumb, TITLE]));
    assert.equal(parsed.columns.find((c) => c.key === 'thumb')?.headerForceLabel, true);
  });

  it('rejects an unknown key — an authored payload may not smuggle fields', () => {
    // Strictness is the guarantee that makes authoring these safe: a field the
    // engine does not read must fail loudly, not be quietly dropped.
    const bad = { ...definition([SELECT, ORDER, TITLE]), renderCell: '() => <div/>' };
    assert.equal(tableDefinitionSchema.safeParse(bad).success, false);
  });

  it('rejects an id that is not <family>.<view>', () => {
    const bad = { ...definition([SELECT, ORDER, TITLE]), id: 'receiving' };
    assert.equal(tableDefinitionSchema.safeParse(bad).success, false);
  });

  it('rejects an incomplete capabilities bag', () => {
    const { dayBands: _omitted, ...partial } = CAPABILITIES;
    const bad = { ...definition([SELECT, ORDER, TITLE]), capabilities: partial };
    assert.equal(tableDefinitionSchema.safeParse(bad).success, false);
  });

  it('rejects duplicate column keys', () => {
    const bad = definition([SELECT, ORDER, TITLE, { ...track('qty'), key: 'title' }]);
    assert.equal(tableDefinitionSchema.safeParse(bad).success, false);
  });

  it('rejects a frozen pane that is not a contiguous leading prefix', () => {
    // Sticky-left offsets sum the widths of the frozen columns BEFORE a given
    // one, so a frozen column after a scrolling one pins at the wrong origin.
    const bad = definition([SELECT, { ...TITLE }, { ...ORDER }]);
    const result = tableDefinitionSchema.safeParse(bad);
    assert.equal(result.success, false);
    assert.match(String(result.error), /contiguous leading prefix/);
  });

  it('rejects a frozen column that can be hidden', () => {
    const bad = definition([SELECT, { ...ORDER, hideKey: 'order' }, TITLE]);
    const result = tableDefinitionSchema.safeParse(bad);
    assert.equal(result.success, false);
    assert.match(String(result.error), /structural/);
  });

  it('rejects a second flex track', () => {
    const bad = definition([SELECT, ORDER, TITLE, { ...track('notes'), width: 'minmax(6rem, 1fr)' }]);
    const result = tableDefinitionSchema.safeParse(bad);
    assert.equal(result.success, false);
    assert.match(String(result.error), /one flex/);
  });

  it('rejects dateFace on a non-date column', () => {
    const bad = definition([SELECT, ORDER, { ...TITLE, dateFace: 'day' }]);
    assert.equal(tableDefinitionSchema.safeParse(bad).success, false);
  });

  it('rejects a default set past the dense ceiling, and names the fix', () => {
    const fat = Array.from({ length: MAX_DEFAULT_VISIBLE_TRACKS + 1 }, (_, i) => track(`c${i}`));
    const result = tableDefinitionSchema.safeParse(definition([SELECT, ORDER, TITLE, ...fat]));
    assert.equal(result.success, false);
    assert.match(String(result.error), /tier: 'optional'/);
  });

  it('accepts the same fat set once the extras are opted-in', () => {
    const fat = Array.from({ length: MAX_DEFAULT_VISIBLE_TRACKS + 1 }, (_, i) => ({
      ...track(`c${i}`),
      tier: 'optional' as const,
    }));
    assert.doesNotThrow(() => parseTableDefinition(definition([SELECT, ORDER, TITLE, ...fat])));
  });
});

describe('defaultVisibleTrackKeys', () => {
  it('counts core tracks and never the structural select gutter', () => {
    const columns = [SELECT, ORDER, TITLE, { ...track('serial'), tier: 'optional' as const }];
    assert.deepEqual(defaultVisibleTrackKeys(columns), ['order', 'title']);
  });
});
