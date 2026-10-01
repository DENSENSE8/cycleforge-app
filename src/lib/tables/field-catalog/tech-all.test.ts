/** Tech-All catalog guards + resolver behaviour — wave 1.4's fifth family. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TECH_ALL_SHEET_COLUMNS,
  defaultDirForTechAllColumn,
  techAllSheetColumnsFor,
  techAllSortFactFor,
} from '@/lib/tech/tech-all-grid-layout';
import type { TechAllTriageRow } from '@/lib/tech/tech-all-triage';
import { TECH_ALL_FIELD_CATALOG, TECH_ALL_PRODUCT_LAYOUT } from './tech-all';
import { resolveTechAllSlotValue } from './tech-all-resolve';


function row(overrides: Partial<TechAllTriageRow> = {}): TechAllTriageRow {
  return {
    id: 'repair:412',
    type: 'repair',
    typeLabel: 'Repair',
    title: 'Bose Wave Radio IV',
    subtitle: 'BOSE-WAVE-IV · Dana Vo',
    stage: 'Awaiting parts',
    urgencyRank: 2,
    sortAt: '2026-08-30T09:00:00.000Z',
    ref: { kind: 'repair', repairId: 412 },
    ...overrides,
  } as TechAllTriageRow;
}

describe('tech-all catalog', () => {
  it('has unique ids, all tech-all-family, each bindable somewhere', () => {
    const ids = TECH_ALL_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of TECH_ALL_FIELD_CATALOG) {
      assert.equal(field.family, 'tech-all', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.ok(field.id.startsWith('tech-all.'), `${field.id} is not family-qualified`);
    }
  });

  it('product default parses against the catalog (sheet morph; the whole strip bound)', () => {
    const parsed = TECH_ALL_PRODUCT_LAYOUT;
    assert.equal(parsed.morph, 'sheet');
    assert.equal(parsed.identityFieldId, 'tech-all.item');
    assert.deepEqual(parsed.statusBindings, [
      { fieldId: 'tech-all.type' },
      { fieldId: 'tech-all.stage' },
      { fieldId: 'tech-all.urgency' },
    ]);
  });
});

describe('techAllSheetColumnsFor — the sheet materialization', () => {
  it("product default reproduces the retired hand model's scan order", () => {
    assert.deepEqual(
      TECH_ALL_SHEET_COLUMNS.map((c) => [c.key, c.fieldId ?? null]),
      [
        ['select', null],
        ['identity', null],
        ['status:1', 'tech-all.type'],
        ['status:2', 'tech-all.stage'],
        ['status:3', 'tech-all.urgency'],
      ],
    );
  });

  it('urgency opens ASCENDING — it is a rank, and the exception rides the fact', () => {
    // In its default slot…
    assert.equal(defaultDirForTechAllColumn(TECH_ALL_SHEET_COLUMNS, 'status:3'), 'asc');

    // …and after a rebind into a different slot, which is the whole point of
    // hanging the rule on the field rather than the track key.
    const rebound = techAllSheetColumnsFor({
      ...TECH_ALL_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'tech-all.urgency' }, { fieldId: 'tech-all.type' }],
    });
    assert.equal(rebound.find((c) => c.key === 'status:1')?.fieldId, 'tech-all.urgency');
    assert.equal(defaultDirForTechAllColumn(rebound, 'status:1'), 'asc');
  });

  it('sort facts: the structural identity track keeps its own fact', () => {
    const byKey = new Map(TECH_ALL_SHEET_COLUMNS.map((c) => [c.key, techAllSortFactFor(c)]));
    assert.equal(byKey.get('select'), null);
    assert.equal(byKey.get('identity'), 'identity');
    assert.equal(byKey.get('status:3'), 'tech-all.urgency');
  });
});

describe('resolveTechAllSlotValue', () => {
  it('resolves each catalog field off the normalized row', () => {
    const r = row();
    assert.deepEqual(resolveTechAllSlotValue(r, 'tech-all.item'), {
      kind: 'value',
      text: 'repair:412',
    });
    assert.deepEqual(resolveTechAllSlotValue(r, 'tech-all.type'), { kind: 'value', text: 'Repair' });
    assert.deepEqual(resolveTechAllSlotValue(r, 'tech-all.stage'), {
      kind: 'value',
      text: 'Awaiting parts',
    });
    assert.deepEqual(resolveTechAllSlotValue(r, 'tech-all.urgency'), { kind: 'value', text: '2' });
  });

  it('an empty stage resolves null, never an empty chip', () => {
    assert.deepEqual(resolveTechAllSlotValue(row({ stage: '' }), 'tech-all.stage'), {
      kind: 'value',
      text: null,
    });
  });

  it('unknown field id resolves null, never throws', () => {
    assert.equal(resolveTechAllSlotValue(row(), 'tech-all.ghost'), null);
  });
});
