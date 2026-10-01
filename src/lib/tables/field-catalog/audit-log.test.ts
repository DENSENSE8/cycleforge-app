/** Audit-log catalog guards, materialization and adapter behaviour — the family that replaced `/settings/audit`'s five hand-written… */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import { isDataTableChromeColumn } from '@/lib/tables/data-table-header-sort';
import {
  AUDITLOG_COMPOUND_COLUMNS,
  auditLogCompoundColumnsFor,
  auditLogSortFactFor,
} from '@/components/settings/audit-log/audit-log-grid-layout';
import {
  auditClockFace,
  auditLogCompoundView,
} from '@/components/settings/audit-log/audit-log-row-view';
import { toAuditLogRow, type AuditLogQueryRow, type AuditLogRow } from '@/lib/audit/audit-log-row';
import { AUDITLOG_FIELD_CATALOG, AUDITLOG_PRODUCT_LAYOUT } from './audit-log';
import { resolveAuditLogSlotValue } from './audit-log-resolve';


/** Fetched by the query, painted by nothing, and not a fact until one paints it. */
const UNPAINTED_DIFF_COLUMNS = ['metadata', 'before_data', 'after_data'] as const;

function row(overrides: Partial<AuditLogRow> = {}): AuditLogRow {
  return {
    id: 90211,
    created_at: '2026-09-10T23:04:12.000Z',
    actor_staff_id: 17,
    actor_name: 'David',
    actor_role: 'manager',
    source: 'receiving',
    action: 'mark_received',
    entity_type: 'receiving_line',
    entity_id: '48123',
    ip_address: '10.0.4.19',
    ...overrides,
  };
}

describe('audit-log catalog', () => {
  it('has unique ids, and every field is family-qualified and bindable', () => {
    const ids = AUDITLOG_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of AUDITLOG_FIELD_CATALOG) {
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.equal(field.family, 'audit-log', `${field.id} is not an audit-log fact`);
      assert.ok(field.id.startsWith('audit-log.'), `${field.id} is not family-qualified`);
    }
  });

  it('names the EIGHT facts the five retired cells painted, and no others', () => {
    assert.deepEqual(
      AUDITLOG_FIELD_CATALOG.map((f) => f.id),
      [
        'audit-log.entity_id',
        'audit-log.entity_type',
        'audit-log.action',
        'audit-log.source',
        'audit-log.actor',
        'audit-log.actor_role',
        'audit-log.when',
        'audit-log.ip',
      ],
    );
  });

  it('does NOT name the diff payload — that expansion was never built', () => {
    for (const field of AUDITLOG_FIELD_CATALOG) {
      const paths = Object.values(field.paths ?? {});
      for (const unpainted of UNPAINTED_DIFF_COLUMNS) {
        assert.ok(
          !paths.includes(unpainted),
          `${field.id} reads '${unpainted}', a column no cell paints`,
        );
      }
      assert.ok(
        !UNPAINTED_DIFF_COLUMNS.some((c) => field.id.endsWith(`.${c}`)),
        `${field.id} names an unpainted diff column`,
      );
    }
    // And the resolver has nothing to say about them either.
    for (const unpainted of UNPAINTED_DIFF_COLUMNS) {
      assert.equal(resolveAuditLogSlotValue(row(), `audit-log.${unpainted}`), null);
    }
  });

  it('product default parses, and the ENTITY ID is the identity', () => {
    const parsed = AUDITLOG_PRODUCT_LAYOUT;
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'audit-log.entity_id');
    // Who + from where are the two tracks…
    assert.deepEqual(
      parsed.statusBindings.map((b) => b.fieldId),
      ['audit-log.actor', 'audit-log.ip'],
    );
    // …and the two cell SECOND lines ride the item cell, never a second track.
    assert.deepEqual(
      parsed.subtitleBindings.map((b) => b.fieldId),
      ['audit-log.source', 'audit-log.actor_role'],
    );
    assert.equal(parsed.amountFieldId ?? null, null);
  });

  it('leaves the chrome-painted facts UNBOUND but still bindable', () => {
    const bound = new Set([
      AUDITLOG_PRODUCT_LAYOUT.identityFieldId,
      ...AUDITLOG_PRODUCT_LAYOUT.statusBindings.map((b) => b.fieldId),
      ...AUDITLOG_PRODUCT_LAYOUT.subtitleBindings.map((b) => b.fieldId),
    ]);
    const unbound = AUDITLOG_FIELD_CATALOG.filter((f) => !bound.has(f.id)).map((f) => f.id);
    // Title, state pill and Dates chrome paint these three — a bound track
    // beside each would print the same fact twice.
    assert.deepEqual(unbound, ['audit-log.entity_type', 'audit-log.action', 'audit-log.when']);
    for (const id of unbound) {
      const field = AUDITLOG_FIELD_CATALOG.find((f) => f.id === id);
      assert.ok(field?.slotKinds.includes('status'), `${id} cannot be opted into a track`);
    }
  });
});

describe('audit-log materialization', () => {
  it('mounts the SHARED compound skeleton WHOLE, in its order', () => {
    const chrome = AUDITLOG_COMPOUND_COLUMNS.map((c) => String(c.key)).filter(
      (k) => !k.startsWith('status:') && !k.startsWith('subtitle:'),
    );
    // No geometry cut: COMPOUND_SKELETON_FILTER_DEBT is shrink-only, so a
    // mount may relabel chrome but never drop it.
    assert.deepEqual(chrome, [...COMPOUND_COLUMN_KEYS]);
    // Compound paints subtitles INSIDE the item cell — never as tracks.
    assert.equal(
      AUDITLOG_COMPOUND_COLUMNS.filter((c) => String(c.key).startsWith('subtitle:')).length,
      0,
    );
    assert.equal(
      AUDITLOG_COMPOUND_COLUMNS.filter((c) => String(c.key).startsWith('status:')).length,
      AUDITLOG_PRODUCT_LAYOUT.statusBindings.length,
    );
  });

  it('relabels the chrome it paints facts into', () => {
    const label = (key: string) => AUDITLOG_COMPOUND_COLUMNS.find((c) => c.key === key)?.label;
    // The retired header read "Source · Action" over a cell that rendered
    // action first. The render order won.
    assert.equal(label('item'), 'Action');
    assert.equal(label('dates'), 'When');
    assert.equal(label('state'), 'Entity');
    const identity = AUDITLOG_COMPOUND_COLUMNS.find((c) => c.key === 'fulfillment');
    assert.equal(identity?.fieldId, 'audit-log.entity_id');
    // The identity header is the ENGINE's `Id` on every peer since 2026-09-15
    // (`data-table-family.ts`). "Entity id" is now the Fields-picker row
    // and the cell's hover word, not the column header.
    assert.equal(identity?.label, 'Id');
    assert.equal(identity?.type, 'id');
  });

  it('rebinds without changing track keys (keys are slot indices)', () => {
    const columns = auditLogCompoundColumnsFor({
      ...AUDITLOG_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'audit-log.when' }],
    });
    const slots = columns.filter((c) => String(c.key).startsWith('status:'));
    assert.deepEqual(
      slots.map((c) => c.key),
      ['status:1'],
    );
    assert.equal(slots[0]?.fieldId, 'audit-log.when');
  });

  it('every painted DATA header sorts; chrome stays dead', () => {
    for (const col of AUDITLOG_COMPOUND_COLUMNS) {
      if (isDataTableChromeColumn(col.key) || col.key === '_fill') {
        assert.equal(auditLogSortFactFor(col), null, `${col.key} is chrome`);
        continue;
      }
      assert.ok(
        auditLogSortFactFor(col) !== null,
        `${col.key} is a painted data track with a dead header`,
      );
    }
    assert.equal(auditLogSortFactFor({ key: 'dates' }), 'audit-log.when');
    assert.equal(auditLogSortFactFor({ key: 'item' }), 'audit-log.action');
    assert.equal(auditLogSortFactFor({ key: 'state' }), 'audit-log.entity_type');
  });
});

describe('audit-log resolver', () => {
  it('answers every catalog id off a realistic row', () => {
    for (const field of AUDITLOG_FIELD_CATALOG) {
      assert.notEqual(
        resolveAuditLogSlotValue(row(), field.id),
        null,
        `${field.id} is in the catalog and the resolver cannot read it`,
      );
    }
  });

  it('resolves the actor as a PERSON, never as a "#id" string', () => {
    assert.deepEqual(resolveAuditLogSlotValue(row(), 'audit-log.actor'), {
      kind: 'person',
      staffId: 17,
      name: 'David',
    });
    // A write with no staff behind it (a system actor) still resolves — the
    // person face draws the absence rather than printing `#null`.
    assert.deepEqual(
      resolveAuditLogSlotValue(row({ actor_staff_id: null, actor_name: null }), 'audit-log.actor'),
      { kind: 'person', staffId: null, name: null },
    );
  });

  it('resolves `when` to the absolute instant, not a face', () => {
    assert.deepEqual(resolveAuditLogSlotValue(row(), 'audit-log.when'), {
      kind: 'value',
      text: '2026-09-10T23:04:12.000Z',
    });
  });

  it('blank facts resolve to null text rather than an empty chip', () => {
    assert.deepEqual(resolveAuditLogSlotValue(row({ ip_address: null }), 'audit-log.ip'), {
      kind: 'value',
      text: null,
    });
    assert.deepEqual(resolveAuditLogSlotValue(row({ actor_role: '  ' }), 'audit-log.actor_role'), {
      kind: 'value',
      text: null,
    });
  });

  it('knows nothing about a field id from another family', () => {
    assert.equal(resolveAuditLogSlotValue(row(), 'orders.picked'), null);
  });
});

describe('audit-log row view', () => {
  it('paints the action as the title and the entity across pill + handle', () => {
    const view = auditLogCompoundView(row());
    assert.equal(view.id, '90211');
    assert.equal(view.title, 'mark_received');
    assert.equal(view.identityFace?.value, '48123');
    assert.equal(view.stateLabel, 'receiving_line');
    assert.equal(view.stateTone, 'neutral');
    // No carrier, no marketplace, no money, no photo on an audit row.
    assert.equal(view.tracking, null);
    assert.equal(view.platformValue, null);
    assert.equal(view.amount, null);
    assert.equal(view.thumbUrl, null);
  });

  it('keeps the seconds the retired timestamp cell printed', () => {
    const view = auditLogCompoundView(row());
    const clock = auditClockFace(row().created_at);
    assert.ok(clock && /:\d{2}:\d{2}\s?[AP]M$/i.test(clock), `clock face lost its seconds: ${clock}`);
    // Both DATES lines are used: the civil day on the Hash line, the clock on
    // the Calendar line. Never the day alone with the time hidden in a tip.
    assert.equal(view.delay?.faceLabel, clock);
    assert.equal(view.delay?.overdue, false);
    assert.ok(view.orderedAt?.label && !view.orderedAt.label.includes(':'));
    assert.equal(view.orderedAt?.dateKey?.length, 10);
    assert.equal(view.startedHover, `${view.orderedAt?.label} · ${clock}`);
  });

  it('never invents a title or a state for a malformed row', () => {
    const view = auditLogCompoundView(row({ action: null, entity_type: null, created_at: '' }));
    assert.equal(view.title, 'Audit #90211');
    assert.equal(view.stateLabel, 'Unknown entity');
    assert.equal(view.orderedAt, null);
    assert.equal(view.delay, null);
  });
});

describe('audit-log wire row', () => {
  it('ISO-normalizes the stamp and drops the unpainted diff payload', () => {
    const raw: AuditLogQueryRow = {
      id: 7,
      created_at: new Date('2026-09-10T23:04:12.000Z'),
      actor_staff_id: null,
      actor_name: null,
      actor_role: null,
      source: 'api',
      action: 'deny',
      entity_type: 'order',
      entity_id: '12',
      ip_address: null,
      metadata: { note: 'huge blob' },
      before_data: { qty: 1 },
      after_data: { qty: 2 },
    };
    const wire = toAuditLogRow(raw);
    assert.equal(wire.created_at, '2026-09-10T23:04:12.000Z');
    for (const unpainted of UNPAINTED_DIFF_COLUMNS) {
      assert.ok(!(unpainted in wire), `${unpainted} crossed the RSC boundary`);
    }
  });
});
