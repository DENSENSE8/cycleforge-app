/** Admin › Holds catalog guards, materialization, adapter and verbs — the family that replaced `/inventory/holds`' seven hand-written… */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import { isDataTableChromeColumn } from '@/lib/tables/data-table-header-sort';
import { MAX_DEFAULT_VISIBLE_TRACKS } from '@/lib/tables/table-definition';
import {
  ADMINHOLDS_COMPOUND_COLUMNS,
  adminHoldsCompoundColumnsFor,
  adminHoldsSortFactFor,
} from '@/components/inventory/holds-grid/admin-holds-grid-layout';
import {
  adminHoldsCompoundView,
  holdClockFace,
} from '@/components/inventory/holds-grid/admin-holds-row-view';
import { resolveAdminHoldsRowActions } from '@/components/inventory/holds-grid/admin-holds-verbs';
import {
  DEFAULT_HOLD_RESTORE_STATUS,
  toHeldUnitRow,
  type HeldUnitQueryRow,
  type HeldUnitRow,
} from '@/lib/inventory/held-unit-row';
import { ADMINHOLDS_FIELD_CATALOG, ADMINHOLDS_PRODUCT_LAYOUT } from './admin-holds';
import { resolveAdminHoldsSlotValue } from './admin-holds-resolve';


/** Fetched by the query, painted by nothing, and not facts until one paints them. */
const UNPAINTED_UNIT_COLUMNS = ['condition_grade', 'notes'] as const;

function row(overrides: Partial<HeldUnitRow> = {}): HeldUnitRow {
  return {
    id: 4821,
    serial_number: 'IPH13-2026-000142',
    sku: 'IPH13-128-BLK',
    hold_reason: 'damaged in handling',
    restore_status: 'TRIAGED',
    held_at: '2026-09-10T23:04:12.000Z',
    held_by_staff_id: 17,
    held_by_name: 'David',
    ...overrides,
  };
}

describe('admin-holds catalog', () => {
  it('has unique ids, and every field is family-qualified and bindable', () => {
    const ids = ADMINHOLDS_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of ADMINHOLDS_FIELD_CATALOG) {
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.equal(field.family, 'admin-holds', `${field.id} is not an admin-holds fact`);
      assert.ok(field.id.startsWith('admin-holds.'), `${field.id} is not family-qualified`);
    }
  });

  it('names the facts the seven retired cells painted, and no others', () => {
    assert.deepEqual(
      ADMINHOLDS_FIELD_CATALOG.map((f) => f.id),
      [
        // The `unit` cell was TWO facts under one header (`#id · serial`).
        'admin-holds.unit',
        'admin-holds.serial',
        'admin-holds.sku',
        'admin-holds.restore_status',
        'admin-holds.hold_reason',
        'admin-holds.held_at',
        'admin-holds.held_by',
      ],
    );
  });

  it('does NOT name the unit facts no cell painted', () => {
    for (const field of ADMINHOLDS_FIELD_CATALOG) {
      const paths = Object.values(field.paths ?? {});
      for (const unpainted of UNPAINTED_UNIT_COLUMNS) {
        assert.ok(
          !paths.includes(unpainted),
          `${field.id} reads '${unpainted}', a column no cell paints`,
        );
      }
    }
    // And the resolver has nothing to say about them either.
    for (const unpainted of UNPAINTED_UNIT_COLUMNS) {
      assert.equal(resolveAdminHoldsSlotValue(row(), `admin-holds.${unpainted}`), null);
    }
  });

  it('does NOT name the release verb — a verb is not a bindable fact', () => {
    assert.ok(
      !ADMINHOLDS_FIELD_CATALOG.some((f) => f.id.endsWith('.release')),
      'release is declared as a catalog field',
    );
    assert.equal(resolveAdminHoldsSlotValue(row(), 'admin-holds.release'), null);
  });

  it('product default parses, and the UNIT ID is the identity', () => {
    const parsed = ADMINHOLDS_PRODUCT_LAYOUT;
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'admin-holds.unit');
    // WHAT is quarantined and WHO quarantined it are the two tracks…
    assert.deepEqual(
      parsed.statusBindings.map((b) => b.fieldId),
      ['admin-holds.sku', 'admin-holds.held_by'],
    );
    // …and the reason rides the item cell's second line, never a second track.
    assert.deepEqual(
      parsed.subtitleBindings.map((b) => b.fieldId),
      ['admin-holds.hold_reason'],
    );
    assert.equal(parsed.amountFieldId ?? null, null);
  });

  it('binds at most FOUR status slots — the skeleton takes the other six', () => {
    assert.ok(
      ADMINHOLDS_PRODUCT_LAYOUT.statusBindings.length <= 4,
      `${ADMINHOLDS_PRODUCT_LAYOUT.statusBindings.length} status bindings; the whole ` +
        'compound skeleton leaves four',
    );
    const visible = ADMINHOLDS_COMPOUND_COLUMNS.filter((c) => c.key !== 'select');
    assert.ok(
      visible.length <= MAX_DEFAULT_VISIBLE_TRACKS,
      `${visible.length} default-visible tracks exceeds ${MAX_DEFAULT_VISIBLE_TRACKS}`,
    );
  });

  it('leaves the chrome-painted facts UNBOUND but still bindable', () => {
    const bound = new Set([
      ADMINHOLDS_PRODUCT_LAYOUT.identityFieldId,
      ...ADMINHOLDS_PRODUCT_LAYOUT.statusBindings.map((b) => b.fieldId),
      ...ADMINHOLDS_PRODUCT_LAYOUT.subtitleBindings.map((b) => b.fieldId),
    ]);
    const unbound = ADMINHOLDS_FIELD_CATALOG.filter((f) => !bound.has(f.id)).map((f) => f.id);
    // Title, state pill and Dates chrome paint these three — a bound track
    // beside each would print the same fact twice.
    assert.deepEqual(unbound, [
      'admin-holds.serial',
      'admin-holds.restore_status',
      'admin-holds.held_at',
    ]);
    for (const id of unbound) {
      const field = ADMINHOLDS_FIELD_CATALOG.find((f) => f.id === id);
      assert.ok(field?.slotKinds.includes('status'), `${id} cannot be opted into a track`);
    }
  });
});

describe('admin-holds materialization', () => {
  it('mounts the SHARED compound skeleton WHOLE, in its order', () => {
    const chrome = ADMINHOLDS_COMPOUND_COLUMNS.map((c) => String(c.key)).filter(
      (k) => !k.startsWith('status:') && !k.startsWith('subtitle:'),
    );
    // No geometry cut: COMPOUND_SKELETON_FILTER_DEBT is shrink-only, so a
    // mount may relabel chrome but never drop it.
    assert.deepEqual(chrome, [...COMPOUND_COLUMN_KEYS]);
    // Compound paints subtitles INSIDE the item cell — never as tracks.
    assert.equal(
      ADMINHOLDS_COMPOUND_COLUMNS.filter((c) => String(c.key).startsWith('subtitle:')).length,
      0,
    );
    assert.equal(
      ADMINHOLDS_COMPOUND_COLUMNS.filter((c) => String(c.key).startsWith('status:')).length,
      ADMINHOLDS_PRODUCT_LAYOUT.statusBindings.length,
    );
  });

  it('relabels the chrome it paints facts into', () => {
    const label = (key: string) => ADMINHOLDS_COMPOUND_COLUMNS.find((c) => c.key === key)?.label;
    assert.equal(label('item'), 'Serial');
    assert.equal(label('dates'), 'Held at');
    assert.equal(label('state'), 'Restore to');
    const identity = ADMINHOLDS_COMPOUND_COLUMNS.find((c) => c.key === 'fulfillment');
    assert.equal(identity?.fieldId, 'admin-holds.unit');
    // The identity header is the ENGINE's `Id` on every peer since 2026-09-15
    // (`data-table-family.ts`). "Unit" is now the Fields-picker row
    // and the cell's hover word, not the column header.
    assert.equal(identity?.label, 'Id');
    assert.equal(identity?.type, 'id');
  });

  it('rebinds without changing track keys (keys are slot indices)', () => {
    const columns = adminHoldsCompoundColumnsFor({
      ...ADMINHOLDS_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'admin-holds.held_at' }],
    });
    const slots = columns.filter((c) => String(c.key).startsWith('status:'));
    assert.deepEqual(
      slots.map((c) => c.key),
      ['status:1'],
    );
    assert.equal(slots[0]?.fieldId, 'admin-holds.held_at');
  });

  it('every painted DATA header sorts; chrome stays dead', () => {
    for (const col of ADMINHOLDS_COMPOUND_COLUMNS) {
      if (isDataTableChromeColumn(col.key) || col.key === '_fill') {
        assert.equal(adminHoldsSortFactFor(col), null, `${col.key} is chrome`);
        continue;
      }
      assert.ok(
        adminHoldsSortFactFor(col) !== null,
        `${col.key} is a painted data track with a dead header`,
      );
    }
    assert.equal(adminHoldsSortFactFor({ key: 'fulfillment' }), 'admin-holds.unit');
    assert.equal(adminHoldsSortFactFor({ key: 'item' }), 'admin-holds.serial');
    assert.equal(adminHoldsSortFactFor({ key: 'dates' }), 'admin-holds.held_at');
    assert.equal(adminHoldsSortFactFor({ key: 'state' }), 'admin-holds.restore_status');
  });
});

describe('admin-holds resolver', () => {
  it('answers every catalog id off a realistic row', () => {
    for (const field of ADMINHOLDS_FIELD_CATALOG) {
      assert.notEqual(
        resolveAdminHoldsSlotValue(row(), field.id),
        null,
        `${field.id} is in the catalog and the resolver cannot read it`,
      );
    }
  });

  it('resolves the holder as a PERSON, never as a "system" string', () => {
    assert.deepEqual(resolveAdminHoldsSlotValue(row(), 'admin-holds.held_by'), {
      kind: 'person',
      staffId: 17,
      name: 'David',
    });
    // A hold with no actor behind it still resolves — the person face draws
    // the absence rather than naming a staffer called "system".
    assert.deepEqual(
      resolveAdminHoldsSlotValue(
        row({ held_by_staff_id: null, held_by_name: null }),
        'admin-holds.held_by',
      ),
      { kind: 'person', staffId: null, name: null },
    );
  });

  it('resolves `held_at` to the absolute instant, not a face', () => {
    assert.deepEqual(resolveAdminHoldsSlotValue(row(), 'admin-holds.held_at'), {
      kind: 'value',
      text: '2026-09-10T23:04:12.000Z',
    });
  });

  it('resolves the EFFECTIVE restore target, as the retired cell printed it', () => {
    assert.deepEqual(resolveAdminHoldsSlotValue(row({ restore_status: null }), 'admin-holds.restore_status'), {
      kind: 'value',
      text: DEFAULT_HOLD_RESTORE_STATUS,
    });
  });

  it('blank facts resolve to null text rather than an empty chip', () => {
    assert.deepEqual(resolveAdminHoldsSlotValue(row({ sku: null }), 'admin-holds.sku'), {
      kind: 'value',
      text: null,
    });
    assert.deepEqual(resolveAdminHoldsSlotValue(row({ hold_reason: '  ' }), 'admin-holds.hold_reason'), {
      kind: 'value',
      text: null,
    });
  });

  it('knows nothing about a field id from another family', () => {
    assert.equal(resolveAdminHoldsSlotValue(row(), 'units.serial'), null);
  });
});

describe('admin-holds row view', () => {
  it('paints the serial as the title and the unit id as the handle', () => {
    const view = adminHoldsCompoundView(row());
    assert.equal(view.id, '4821');
    assert.equal(view.title, 'IPH13-2026-000142');
    assert.equal(view.identityFace?.value, '4821');
    assert.equal(view.stateLabel, 'TRIAGED');
    assert.equal(view.stateTone, 'alert');
    // No carrier, no marketplace, no money, no photo on a held unit.
    assert.equal(view.tracking, null);
    assert.equal(view.platformValue, null);
    assert.equal(view.amount, null);
    assert.equal(view.thumbUrl, null);
  });

  it('names the pill as a DESTINATION, and says when nothing was recorded', () => {
    assert.match(String(adminHoldsCompoundView(row()).stateTip), /releases back to TRIAGED/);
    const bare = adminHoldsCompoundView(row({ restore_status: null }));
    assert.equal(bare.stateLabel, DEFAULT_HOLD_RESTORE_STATUS);
    assert.match(String(bare.stateTip), /no recorded state/);
  });

  it('keeps the clock the retired timestamp cell printed', () => {
    const view = adminHoldsCompoundView(row());
    const clock = holdClockFace(row().held_at);
    assert.ok(clock && /^\d{1,2}:\d{2}\s?[AP]M$/i.test(clock), `clock face is not a clock: ${clock}`);
    // Both DATES lines are used: the civil day on the Hash line, the clock on
    // the Calendar line. Never the day alone with the time hidden in a tip.
    assert.equal(view.delay?.faceLabel, clock);
    assert.equal(view.delay?.overdue, false);
    assert.ok(view.orderedAt?.label && !view.orderedAt.label.includes(':'));
    assert.equal(view.orderedAt?.dateKey?.length, 10);
    // …and the seconds `toLocaleString()` printed survive on the hovers.
    assert.match(String(view.startedHover), /:\d{2}:\d{2}\s?[AP]M$/i);
  });

  it('never invents a title for a malformed row', () => {
    const view = adminHoldsCompoundView(row({ serial_number: '', held_at: null }));
    assert.equal(view.title, 'Unit #4821');
    assert.equal(view.orderedAt, null);
    assert.equal(view.delay, null);
    assert.equal(view.startedHover, undefined);
  });
});

describe('admin-holds verbs', () => {
  it('declares RELEASE once, as the family verb, wired to the mount handler', () => {
    const opened: HeldUnitRow[] = [];
    const actions = resolveAdminHoldsRowActions(row(), {
      onRelease: (r) => opened.push(r),
    });
    assert.deepEqual(
      actions.map((a) => a.key),
      ['release'],
    );
    const release = actions[0];
    assert.equal(release?.label, 'Release');
    // Trailing face: the desk's one verb is reachable without the ⋮, which is
    // where the retired right-aligned Release column sat.
    assert.equal(release?.face, 'trailing');
    // Not destructive — the hold was the intervention; the release undoes it.
    assert.equal(release?.tone ?? 'default', 'default');
    release?.onSelect();
    // The verb OPENS THE PLANE. It does not write: the restore-status override
    // is a payload parameter, and `CompoundRowAction` carries a fixed payload.
    assert.deepEqual(opened, [row()]);
  });
});

describe('admin-holds wire row', () => {
  it('ISO-normalizes the stamp and drops the facts nothing paints', () => {
    const raw: HeldUnitQueryRow = {
      id: 7,
      serial_number: 'SN-7',
      sku: null,
      condition_grade: 'B',
      notes: 'unit note nobody paints',
      hold_reason: 'customer dispute',
      restore_status: null,
      held_at: new Date('2026-09-10T23:04:12.000Z'),
      held_by_staff_id: null,
      held_by_name: null,
    };
    const wire = toHeldUnitRow(raw);
    assert.equal(wire.held_at, '2026-09-10T23:04:12.000Z');
    for (const unpainted of UNPAINTED_UNIT_COLUMNS) {
      assert.ok(!(unpainted in wire), `${unpainted} crossed the RSC boundary`);
    }
  });

  it('reads a missing hold stamp as absent, not as the epoch', () => {
    const wire = toHeldUnitRow({
      id: 8,
      serial_number: 'SN-8',
      sku: null,
      condition_grade: null,
      notes: null,
      hold_reason: null,
      restore_status: null,
      held_at: null,
      held_by_staff_id: null,
      held_by_name: null,
    });
    assert.equal(wire.held_at, null);
  });
});
