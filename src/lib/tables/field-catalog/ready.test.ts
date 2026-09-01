/**
 * Ready catalog guards + resolver behaviour — wave 1.1's mirror of
 * `pickup.test.ts`. The catalog is persisted-id vocabulary, so the guards are
 * the ones that fail as silent config bugs otherwise: duplicate ids, a product
 * default that does not parse against its own catalog, a field bindable
 * nowhere. The materialization smoke pins the port contract's core-view parity
 * — the promise that the port reproduced the retired hand model before it
 * improved anything — and the resolver tests pin the row → paint contract per
 * field.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  READY_SHEET_COLUMNS,
  readySheetColumnsFor,
  readySortFactFor,
} from '@/components/outbound/ready/grid/ready-grid-layout';
import type { AllocationHit } from '@/lib/channel-allocation/types';
import { READY_FIELD_CATALOG, READY_PRODUCT_LAYOUT } from './ready';
import { resolveReadySlotValue } from './ready-resolve';
import { parseSlotLayout } from '../slot-layout';

function hit(overrides: Partial<AllocationHit> = {}): AllocationHit {
  return {
    testingResultId: 91,
    entityType: 'SERIAL_UNIT',
    entityId: 4412,
    skuCatalogId: 12,
    sku: 'BOSE-WAVE-IV',
    serialNumber: '9M52B2C4',
    fnsku: 'X001ABCDEF',
    asin: 'B00TESTASIN',
    title: 'Bose Wave Radio IV',
    conditionGrade: 'USED_A',
    unitStatus: 'TESTED',
    verdict: 'PASS',
    testedBy: 7,
    testedByName: 'Dana Vo',
    testedAt: '2026-08-30T15:04:00.000Z',
    disposition: 'FBA',
    allocationState: 'READY',
    reasons: ['HIGH_VELOCITY', 'AMAZON_OOS'],
    score: 88,
    velocityTier: 'A',
    ...overrides,
  };
}

describe('ready catalog', () => {
  it('has unique ids, all ready-family, each bindable somewhere', () => {
    const ids = READY_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of READY_FIELD_CATALOG) {
      assert.equal(field.family, 'ready', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
    }
  });

  it('carries no field whose id is a bare track name — the forbidden pattern', () => {
    // `READY_GRID_COLUMNS` mounted `{ key: 'tested' }`. A catalog id is
    // `<family>.<fact>`; a bare `tested` would be that track wearing a new hat.
    for (const field of READY_FIELD_CATALOG) {
      assert.ok(field.id.startsWith('ready.'), `${field.id} is not family-qualified`);
    }
  });

  it('product default parses against the catalog (sheet morph; the core view in the status band)', () => {
    const parsed = parseSlotLayout(READY_PRODUCT_LAYOUT, READY_FIELD_CATALOG);
    assert.equal(parsed.morph, 'sheet');
    assert.equal(parsed.identityFieldId, 'ready.unit');
    assert.deepEqual(parsed.statusBindings, [
      { fieldId: 'ready.verdict' },
      { fieldId: 'ready.destination' },
      { fieldId: 'ready.condition' },
      { fieldId: 'ready.tested' },
    ]);
    assert.deepEqual(parsed.subtitleBindings, []);
  });
});

describe('readySheetColumnsFor — the sheet materialization', () => {
  it("product default reproduces the retired hand model's CORE view scan order", () => {
    // select · title · verdict · destination · cond · tested · action — what the
    // flat model shipped ON by default (its tier:'optional' reasons/velocity
    // columns are now unbound catalog facts).
    assert.deepEqual(
      READY_SHEET_COLUMNS.map((c) => [c.key, c.fieldId ?? null]),
      [
        ['select', null],
        ['title', null],
        ['status:1', 'ready.verdict'],
        ['status:2', 'ready.destination'],
        ['status:3', 'ready.condition'],
        ['status:4', 'ready.tested'],
        ['action', null],
      ],
    );
  });

  it('the structural action track stays last however many facts are bound', () => {
    const columns = readySheetColumnsFor({
      ...READY_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'ready.reasons' }, { fieldId: 'ready.velocity' }],
      subtitleBindings: [{ fieldId: 'ready.condition' }],
    });
    assert.deepEqual(
      columns.map((c) => c.key),
      ['select', 'title', 'subtitle:1', 'status:1', 'status:2', 'action'],
    );
    assert.equal(columns.at(-1)?.key, 'action');
  });

  it('keeps exactly one flex track (the structural title)', () => {
    const flex = READY_SHEET_COLUMNS.filter((c) => c.width.includes('1fr'));
    assert.deepEqual(flex.map((c) => c.key), ['title']);
  });

  it('sort facts: title is structural, slot tracks map to their bound field, reasons never sorts', () => {
    const byKey = new Map(READY_SHEET_COLUMNS.map((c) => [c.key, readySortFactFor(c)]));
    assert.equal(byKey.get('select'), null);
    assert.equal(byKey.get('action'), null);
    assert.equal(byKey.get('title'), 'title');
    assert.equal(byKey.get('status:1'), 'ready.verdict');
    assert.equal(byKey.get('status:4'), 'ready.tested');

    // The unsortable rule belongs to the FACT, not to a track key — a rebind
    // carries it. A chip list has no single value to order by.
    const reasonsBound = readySheetColumnsFor({
      ...READY_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'ready.reasons' }],
    });
    const reasonsTrack = reasonsBound.find((c) => c.fieldId === 'ready.reasons');
    assert.ok(reasonsTrack);
    assert.equal(readySortFactFor(reasonsTrack), null);
  });
});

describe('resolveReadySlotValue', () => {
  it('resolves each catalog field off the wire row', () => {
    const h = hit();
    assert.deepEqual(resolveReadySlotValue(h, 'ready.unit'), {
      kind: 'value',
      text: 'BOSE-WAVE-IV',
    });
    assert.deepEqual(resolveReadySlotValue(h, 'ready.verdict'), {
      kind: 'value',
      text: 'Passed',
    });
    assert.deepEqual(resolveReadySlotValue(h, 'ready.destination'), {
      kind: 'value',
      text: 'FBA',
    });
    assert.deepEqual(resolveReadySlotValue(h, 'ready.reasons'), {
      kind: 'value',
      text: 'High velocity · Amazon OOS',
    });
    assert.deepEqual(resolveReadySlotValue(h, 'ready.velocity'), { kind: 'value', text: 'A' });
    assert.equal(resolveReadySlotValue(h, 'ready.condition')?.kind, 'value');
    assert.ok(
      (resolveReadySlotValue(h, 'ready.tested') as { text: string | null }).text,
      'a tested stamp resolves to text',
    );
  });

  it('destination falls back to the allocation state the cell actually shows', () => {
    assert.deepEqual(
      resolveReadySlotValue(hit({ disposition: null, allocationState: 'FBA_STAGED' }), 'ready.destination'),
      { kind: 'value', text: 'In FBA' },
    );
  });

  it('honest absence: blanks resolve to null text, never a fake value', () => {
    const empty = hit({
      verdict: null,
      conditionGrade: null,
      velocityTier: null,
      testedAt: null,
      reasons: [],
    });
    assert.deepEqual(resolveReadySlotValue(empty, 'ready.velocity'), { kind: 'value', text: null });
    assert.deepEqual(resolveReadySlotValue(empty, 'ready.condition'), { kind: 'value', text: null });
    assert.deepEqual(resolveReadySlotValue(empty, 'ready.tested'), { kind: 'value', text: null });
    assert.deepEqual(resolveReadySlotValue(empty, 'ready.reasons'), { kind: 'value', text: null });
    // A verdict row always exists — an unrecognised code reads as "Recorded",
    // which is what happened, not a guess at pass/fail.
    assert.deepEqual(resolveReadySlotValue(empty, 'ready.verdict'), {
      kind: 'value',
      text: 'Recorded',
    });
  });

  it('the unit handle falls through the identifier trail and never blanks', () => {
    assert.deepEqual(resolveReadySlotValue(hit({ sku: null }), 'ready.unit'), {
      kind: 'value',
      text: '9M52B2C4',
    });
    assert.deepEqual(
      resolveReadySlotValue(hit({ sku: null, serialNumber: null, fnsku: null, asin: null }), 'ready.unit'),
      { kind: 'value', text: 'id 4412' },
    );
  });

  it('unknown field id resolves null, never throws', () => {
    assert.equal(resolveReadySlotValue(hit(), 'ready.ghost'), null);
  });
});
