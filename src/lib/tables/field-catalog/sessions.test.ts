import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import type { SessionDayRow } from '@/lib/sessions/session-day-report';
import {
  SESSIONS_COMPOUND_COLUMNS,
  sessionsCompoundColumnsFor,
} from '@/lib/sessions/sessions-grid-layout';
import { TASKS_FIELD_CATALOG } from './tasks';
import { SESSIONS_FIELD_CATALOG, SESSIONS_PRODUCT_LAYOUT } from './sessions';
import { resolveSessionsSlotValue, sessionsSlotValuesFor } from './sessions-resolve';
import { parseSlotLayout } from '../slot-layout';

function row(overrides: Partial<SessionDayRow> = {}): SessionDayRow {
  return {
    staffId: 7,
    staffName: 'Jordan',
    activeMs: 2 * 3_600_000 + 14 * 60_000,
    sessionCount: 2,
    lastSurfaceKey: 'unbox',
    lastScanType: 'unbox',
    scanTypes: ['unbox', 'pack'],
    status: 'armed',
    armed: true,
    ...overrides,
  };
}

describe('sessions catalog', () => {
  it('has unique ids, all sessions-family, each bindable', () => {
    const ids = SESSIONS_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of SESSIONS_FIELD_CATALOG) {
      assert.equal(field.family, 'sessions', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.ok(field.id.startsWith('sessions.'), `${field.id} is not family-qualified`);
    }
  });

  it('shares no field id with tasks', () => {
    const tasks = new Set(TASKS_FIELD_CATALOG.map((f) => f.id));
    for (const field of SESSIONS_FIELD_CATALOG) {
      assert.ok(!tasks.has(field.id), `${field.id} is in both catalogs`);
    }
  });

  it('product default parses — compound morph, nothing bound', () => {
    const parsed = parseSlotLayout(SESSIONS_PRODUCT_LAYOUT, SESSIONS_FIELD_CATALOG);
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'sessions.staff');
    assert.deepEqual(parsed.statusBindings, []);
  });
});

describe('sessionsCompoundColumnsFor', () => {
  it('the product default is the shared compound skeleton', () => {
    assert.deepEqual(
      SESSIONS_COMPOUND_COLUMNS.map((c) => c.key),
      [...COMPOUND_COLUMN_KEYS],
    );
    assert.ok(SESSIONS_COMPOUND_COLUMNS.every((c) => c.fieldId === undefined));
  });
});

describe('resolveSessionsSlotValue', () => {
  it('resolves catalog fields off the staff-day row', () => {
    const r = row();
    assert.deepEqual(resolveSessionsSlotValue(r, 'sessions.staff'), { kind: 'value', text: 'Jordan' });
    assert.deepEqual(resolveSessionsSlotValue(r, 'sessions.status'), { kind: 'value', text: 'Armed' });
    assert.deepEqual(resolveSessionsSlotValue(r, 'sessions.duration'), { kind: 'value', text: '2h 14m' });
    assert.equal(resolveSessionsSlotValue(r, 'sessions.ghost'), null);
  });
});

describe('sessionsSlotValuesFor', () => {
  it('the product default resolves no slots', () => {
    assert.equal(sessionsSlotValuesFor(row(), SESSIONS_COMPOUND_COLUMNS), undefined);
  });

  it('keys bound values by track', () => {
    const columns = sessionsCompoundColumnsFor({
      ...SESSIONS_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'sessions.status' }],
    });
    assert.deepEqual(sessionsSlotValuesFor(row(), columns), {
      'status:1': { kind: 'value', text: 'Armed' },
    });
  });
});
