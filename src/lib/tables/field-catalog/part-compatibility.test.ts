/**
 * Part-compatibility catalog guards + resolver behaviour — Wave D's port of
 * `/admin?section=compatibility` off `AdminTable`.
 *
 * The load-bearing guard here is the `is_oem` / `fit` SPLIT. The retired cell
 * rendered `{is_oem ? 'OEM ' : ''}{fit}` into one pill, which made two facts
 * one string: unsortable apart, unsearchable apart, unbindable apart. Several
 * assertions below exist purely so a future "tidy-up" cannot merge them again
 * without turning the build red.
 *
 * Fixtures are the WIRE row: `/api/part-compatibility` returns the joined SQL
 * row verbatim (`pc.*, bm.model_number, bm.model_name, sc.sku,
 * sc.product_title`), so a camelCase fixture here would test a shape that
 * never reaches the desk.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import type { PartCompatibilityEdgeRow } from '@/lib/sourcing/part-compatibility-row';
import { partFitLabel, partOemLabel } from '@/lib/sourcing/part-compatibility-row';
import {
  PART_COMPATIBILITY_COMPOUND_COLUMNS,
  partCompatibilityCompoundColumnsFor,
  partCompatibilitySortFactFor,
  isPartCompatibilityColumnSortable,
} from '@/components/admin/sourcing/part-compatibility-grid-layout';
import { partCompatibilityCompoundView } from '@/components/admin/sourcing/part-compatibility-row-view';
import { resolvePartCompatibilityRowActions } from '@/components/admin/sourcing/part-compatibility-verbs';
import { MAX_DEFAULT_VISIBLE_TRACKS } from '../table-definition';
import {
  PART_COMPATIBILITY_FIELD_CATALOG,
  PART_COMPATIBILITY_PRODUCT_LAYOUT,
  PART_COMPATIBILITY_TABLE_LAYOUT_ID,
} from './part-compatibility';
import { resolvePartCompatibilitySlotValue } from './part-compatibility-resolve';
import { parseSlotLayout } from '../slot-layout';

function row(overrides: Partial<PartCompatibilityEdgeRow> = {}): PartCompatibilityEdgeRow {
  return {
    id: 412,
    bose_model_id: 88,
    sku_id: 1904,
    part_role: 'battery',
    is_oem: true,
    fit: 'exact',
    confidence: 'confirmed',
    source: 'manual',
    created_at: '2026-09-04T14:20:00.000Z',
    model_number: '404600',
    model_name: 'SoundLink Mini II',
    sku: 'BOSE-BAT-404600',
    product_title: 'SoundLink Mini II replacement battery',
    ...overrides,
  };
}

describe('part-compatibility catalog', () => {
  it('has unique ids, all part-compatibility-family, each bindable somewhere', () => {
    const ids = PART_COMPATIBILITY_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of PART_COMPATIBILITY_FIELD_CATALOG) {
      assert.equal(field.family, 'part-compatibility', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.ok(field.id.startsWith('part-compatibility.'), `${field.id} is not family-qualified`);
    }
  });

  it('every catalog path names a real key on the wire row', () => {
    const wire = new Set(Object.keys(row()));
    for (const field of PART_COMPATIBILITY_FIELD_CATALOG) {
      for (const path of Object.values(field.paths ?? {})) {
        assert.ok(
          wire.has(path),
          `${field.id} reads '${path}', which /api/part-compatibility never sends`,
        );
      }
    }
  });

  it('names NO never-painted fact — confidence / notes / updated_at stay non-goals', () => {
    const paths = PART_COMPATIBILITY_FIELD_CATALOG.flatMap((f) => Object.values(f.paths ?? {}));
    for (const dead of ['confidence', 'notes', 'updated_at']) {
      assert.ok(!paths.includes(dead), `${dead} was never painted — do not restore it`);
    }
  });

  it('splits the retired pill: is_oem and fit are TWO fields, neither merged', () => {
    const byPath = new Map(
      PART_COMPATIBILITY_FIELD_CATALOG.map((f) => [f.paths?.value, f] as const),
    );
    const oem = byPath.get('is_oem');
    const fit = byPath.get('fit');
    assert.ok(oem, 'is_oem must be its own bindable fact');
    assert.ok(fit, 'fit must be its own bindable fact');
    assert.notEqual(oem?.id, fit?.id);
    // One field may never read BOTH keys — that is the merge, wearing a path map.
    for (const field of PART_COMPATIBILITY_FIELD_CATALOG) {
      const paths = Object.values(field.paths ?? {});
      assert.ok(
        !(paths.includes('is_oem') && paths.includes('fit')),
        `${field.id} reads is_oem AND fit — the merged pill is back`,
      );
    }
  });

  it('product default parses against the catalog — the four scannable tracks', () => {
    const parsed = parseSlotLayout(
      PART_COMPATIBILITY_PRODUCT_LAYOUT,
      PART_COMPATIBILITY_FIELD_CATALOG,
    );
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'part-compatibility.sku');
    assert.deepEqual(parsed.statusBindings, [
      { fieldId: 'part-compatibility.model_number' },
      { fieldId: 'part-compatibility.role' },
      { fieldId: 'part-compatibility.oem' },
      { fieldId: 'part-compatibility.source' },
    ]);
    assert.deepEqual(parsed.subtitleBindings, [{ fieldId: 'part-compatibility.model' }]);
    assert.equal(parsed.amountFieldId, null);
  });

  it('binds OEM as a TRACK, so an org can scan and sort aftermarket parts', () => {
    const bound = PART_COMPATIBILITY_PRODUCT_LAYOUT.statusBindings.map((b) => b.fieldId);
    assert.ok(bound.includes('part-compatibility.oem'));
    // fit rides the state pill (chrome) and must NOT also be a track — one
    // fact painted twice is the lie-by-repetition rule.
    assert.ok(!bound.includes('part-compatibility.fit'));
  });

  it('the identity fact is the PART SKU, and only it may hold the identity slot', () => {
    const identity = PART_COMPATIBILITY_FIELD_CATALOG.filter((f) =>
      f.slotKinds.includes('identity'),
    );
    assert.deepEqual(identity.map((f) => f.id), ['part-compatibility.sku']);
    // The write gate refuses a non-`id` identity; pin that this one is `id`.
    assert.equal(identity[0].displayType, 'id');
  });

  it('linked stays a DATE fact — the DATES chrome needs an instant to sort', () => {
    const field = PART_COMPATIBILITY_FIELD_CATALOG.find(
      (f) => f.id === 'part-compatibility.linked',
    );
    assert.equal(field?.displayType, 'date');
    assert.equal(field?.paths?.value, 'created_at');
  });

  it('serves the `part-compatibility` tableId', () => {
    assert.equal(PART_COMPATIBILITY_TABLE_LAYOUT_ID, 'part-compatibility');
  });
});

describe('the mounted part-compatibility compound model', () => {
  it('mounts the shared skeleton WHOLE — no chrome cut, four status tracks', () => {
    // Skeleton order is derived from the engine, never hand-listed: a track
    // added to (or removed from) COMPOUND_COLUMN_KEYS must not need an edit here.
    const keys = PART_COMPATIBILITY_COMPOUND_COLUMNS.map((c) => c.key);
    assert.deepEqual(
      keys.filter((k) => !k.startsWith('status:') && !k.startsWith('subtitle:')),
      [...COMPOUND_COLUMN_KEYS],
    );
    const stateAt = keys.indexOf('state');
    assert.deepEqual(keys.slice(stateAt, stateAt + 5), [
      'state',
      'status:1',
      'status:2',
      'status:3',
      'status:4',
    ]);
    // Compound paints subtitles INSIDE the item cell — a subtitle track here
    // would mean the morph leaked.
    assert.ok(!keys.some((k) => k.startsWith('subtitle:')));
  });

  it('sits exactly at the dense ceiling — a fifth binding would not fit', () => {
    const visible = PART_COMPATIBILITY_COMPOUND_COLUMNS.filter((c) => c.key !== 'select');
    assert.equal(visible.length, MAX_DEFAULT_VISIBLE_TRACKS);
  });

  it('renames the chrome headers to this desk’s vocabulary', () => {
    const label = (key: string) =>
      PART_COMPATIBILITY_COMPOUND_COLUMNS.find((c) => c.key === key)?.gridLabel;
    // The identity header is the ENGINE's `Id` on every peer since
    // 2026-09-15 (`slot-table-id-header-law.ts`); this desk used to print
    // "SKU", which is now the Fields-picker word and the cell's hover word.
    // Pinned by slot-table-id-header-law.test.ts, not re-pinned here.
    assert.equal(label('fulfillment'), 'Id');
    assert.equal(label('item'), 'Part');
    assert.equal(label('dates'), 'Linked');
    assert.equal(label('state'), 'Fit');
  });

  it('every painted fact is click-to-sort; only chrome is not', () => {
    for (const key of [
      'fulfillment', 'item', 'dates', 'state',
      'status:1', 'status:2', 'status:3', 'status:4',
    ]) {
      assert.ok(
        isPartCompatibilityColumnSortable(PART_COMPATIBILITY_COMPOUND_COLUMNS, key),
        `${key} paints a fact and must sort`,
      );
    }
    for (const key of ['select', 'thumb', '_fill']) {
      assert.ok(
        !isPartCompatibilityColumnSortable(PART_COMPATIBILITY_COMPOUND_COLUMNS, key),
        `${key} is chrome and must not sort`,
      );
    }
    assert.equal(partCompatibilitySortFactFor({ key: 'state' }), 'part-compatibility.fit');
    assert.equal(partCompatibilitySortFactFor({ key: 'dates' }), 'part-compatibility.linked');
    assert.equal(partCompatibilitySortFactFor({ key: 'item' }), 'part-compatibility.part');
  });

  it('OEM and Fit sort as SEPARATE facts — the merged pill had one comparator', () => {
    const oem = PART_COMPATIBILITY_COMPOUND_COLUMNS.find(
      (c) => c.fieldId === 'part-compatibility.oem',
    );
    assert.ok(oem, 'OEM must be a mounted track');
    assert.equal(partCompatibilitySortFactFor(oem!), 'part-compatibility.oem');
    assert.notEqual(
      partCompatibilitySortFactFor(oem!),
      partCompatibilitySortFactFor({ key: 'state' }),
    );
  });

  it('a rebound layout opens the model NAME as a track without touching the skeleton', () => {
    const columns = partCompatibilityCompoundColumnsFor({
      ...PART_COMPATIBILITY_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'part-compatibility.model' }],
    });
    const model = columns.find((c) => c.fieldId === 'part-compatibility.model');
    assert.equal(model?.key, 'status:1');
    assert.equal(model?.slotDisplayType, 'text');
    assert.deepEqual(
      columns.map((c) => c.key).filter((k) => !k.startsWith('status:')),
      [...COMPOUND_COLUMN_KEYS],
    );
  });
});

describe('resolvePartCompatibilitySlotValue', () => {
  it('resolves each catalog field off the wire row', () => {
    const r = row();
    assert.deepEqual(resolvePartCompatibilitySlotValue(r, 'part-compatibility.sku'), {
      kind: 'value',
      text: 'BOSE-BAT-404600',
    });
    assert.deepEqual(resolvePartCompatibilitySlotValue(r, 'part-compatibility.part'), {
      kind: 'value',
      text: 'SoundLink Mini II replacement battery',
    });
    assert.deepEqual(resolvePartCompatibilitySlotValue(r, 'part-compatibility.model'), {
      kind: 'value',
      text: 'SoundLink Mini II',
    });
    assert.deepEqual(resolvePartCompatibilitySlotValue(r, 'part-compatibility.model_number'), {
      kind: 'value',
      text: '404600',
    });
    assert.deepEqual(resolvePartCompatibilitySlotValue(r, 'part-compatibility.role'), {
      kind: 'value',
      text: 'battery',
    });
  });

  it('resolves OEM and FIT as two independent strings, neither carrying the other', () => {
    const oem = row();
    assert.deepEqual(resolvePartCompatibilitySlotValue(oem, 'part-compatibility.oem'), {
      kind: 'value',
      text: 'OEM',
    });
    // The fit fact NEVER carries the `OEM ` prefix the retired cell glued on.
    const fit = resolvePartCompatibilitySlotValue(oem, 'part-compatibility.fit');
    assert.deepEqual(fit, { kind: 'value', text: 'Exact fit' });
    assert.ok(!String(fit && fit.kind === 'value' ? fit.text : '').includes('OEM'));

    const after = row({ is_oem: false, fit: 'salvage' });
    assert.deepEqual(resolvePartCompatibilitySlotValue(after, 'part-compatibility.oem'), {
      kind: 'value',
      text: 'Aftermarket',
    });
    assert.deepEqual(resolvePartCompatibilitySlotValue(after, 'part-compatibility.fit'), {
      kind: 'value',
      text: 'Salvage',
    });
  });

  it('enums resolve to the operator’s word, not the storage token', () => {
    assert.deepEqual(
      resolvePartCompatibilitySlotValue(row({ source: 'csv_import' }), 'part-compatibility.source'),
      { kind: 'value', text: 'CSV import' },
    );
    assert.deepEqual(
      resolvePartCompatibilitySlotValue(row({ source: 'ebay' }), 'part-compatibility.source'),
      { kind: 'value', text: 'eBay' },
    );
    // An enum nobody mapped paints itself rather than dashing the cell.
    assert.deepEqual(
      resolvePartCompatibilitySlotValue(row({ source: 'scraper' }), 'part-compatibility.source'),
      { kind: 'value', text: 'scraper' },
    );
  });

  it('linked resolves to the ABSOLUTE instant — the engine owns the civil face', () => {
    assert.deepEqual(resolvePartCompatibilitySlotValue(row(), 'part-compatibility.linked'), {
      kind: 'value',
      text: '2026-09-04T14:20:00.000Z',
    });
  });

  it('an unknown field id resolves to nothing — bindings never cross families', () => {
    assert.equal(resolvePartCompatibilitySlotValue(row(), 'auth-sessions.ip'), null);
    assert.equal(resolvePartCompatibilitySlotValue(row(), 'part-compatibility.nope'), null);
  });
});

describe('partCompatibilityCompoundView', () => {
  it('puts the PART on the title and its SKU on identity', () => {
    const view = partCompatibilityCompoundView(row());
    assert.equal(view.title, 'SoundLink Mini II replacement battery');
    assert.equal(view.identityFace?.value, 'BOSE-BAT-404600');
    assert.equal(view.id, '412');
    assert.equal(view.titleHref, '/inventory/health/sku/BOSE-BAT-404600');
  });

  it('paints the FIT alone on the state pill — no OEM prefix survives', () => {
    assert.equal(partCompatibilityCompoundView(row()).stateLabel, 'Exact fit');
    assert.equal(
      partCompatibilityCompoundView(row({ fit: 'equivalent' })).stateLabel,
      'Equivalent',
    );
    // Flipping OEM must not change the pill at all: it is a different fact.
    assert.equal(
      partCompatibilityCompoundView(row({ is_oem: false })).stateLabel,
      partCompatibilityCompoundView(row({ is_oem: true })).stateLabel,
    );
    assert.ok(!partCompatibilityCompoundView(row()).stateLabel.includes('OEM'));
  });

  it('falls back to naming the model under the title when subtitles are unbound', () => {
    assert.equal(partCompatibilityCompoundView(row()).note, 'Fits SoundLink Mini II');
    assert.equal(
      partCompatibilityCompoundView(row({ model_name: '' })).note,
      'Fits 404600',
    );
  });

  it('uses the DATES Hash line for the linked stamp rather than painting `--`', () => {
    const view = partCompatibilityCompoundView(row());
    assert.ok(view.orderedAt?.label, 'Hash line must carry the civil face');
    assert.equal(view.orderedAt?.dateKey, '2026-09-04');
    assert.equal(view.startedHover, view.orderedAt?.tip);
  });

  it('never paints a photo, a deadline or an amount — an edge has none', () => {
    const view = partCompatibilityCompoundView(row());
    assert.equal(view.thumbUrl, null);
    assert.equal(view.delay, null);
    assert.equal(view.amount, null);
  });

  it('names a title-less edge by a handle it actually has', () => {
    assert.equal(
      partCompatibilityCompoundView(row({ product_title: '' })).title,
      'BOSE-BAT-404600',
    );
    assert.equal(
      partCompatibilityCompoundView(row({ product_title: '', sku: '' })).title,
      'Edge #412',
    );
  });
});

describe('the fit / OEM label vocabulary', () => {
  it('maps every Zod enum member and self-paints an unmapped one', () => {
    assert.equal(partFitLabel('exact'), 'Exact fit');
    assert.equal(partFitLabel('equivalent'), 'Equivalent');
    assert.equal(partFitLabel('salvage'), 'Salvage');
    assert.equal(partFitLabel('press-fit'), 'press-fit');
    assert.equal(partFitLabel(null), 'Unrated fit');
  });

  it('gives the boolean two honest faces and blanks only true absence', () => {
    assert.equal(partOemLabel(true), 'OEM');
    assert.equal(partOemLabel(false), 'Aftermarket');
    assert.equal(partOemLabel(null), null);
  });
});

describe('part-compatibility row verbs', () => {
  it('Remove is a trailing-face danger verb, not an actions column', () => {
    const calls: number[] = [];
    const actions = resolvePartCompatibilityRowActions(row(), {
      onRemove: (r) => calls.push(r.id),
    });
    assert.deepEqual(actions.map((a) => a.key), ['remove']);
    assert.equal(actions[0].tone, 'danger');
    assert.equal(actions[0].face, 'trailing');
    actions[0].onSelect();
    // The verb hands the ROW to the confirm plane; it does not delete.
    assert.deepEqual(calls, [412]);
  });
});
