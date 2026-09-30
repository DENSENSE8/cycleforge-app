/** Daily catalog guards + resolver behaviour — the UNION agenda family. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import { slotTableColumnsFor } from '@/components/tables/compound/slot-table-columns';
import { DAILY_COMPOUND_COLUMNS } from '@/features/home/grid/daily-table-definition';
import {
  dailyAgendaFromChecklist,
  dailyAgendaFromTask,
  type DailyAgendaRow,
} from '@/lib/daily/daily-agenda-row';
import type { TaskDeskRow } from '@/lib/tasks/task-desk-row';
import { DAILY_FAMILY, DAILY_FIELD_CATALOG, DAILY_PRODUCT_LAYOUT } from './daily';
import { TASKS_FIELD_CATALOG } from './tasks';
import { dailySlotValuesFor, resolveDailySlotValue } from './daily-resolve';
import { parseSlotLayout } from '../slot-layout';

const MARKED_AT = '2026-09-22T15:30:00.000Z';
const DEADLINE_MS = Date.parse('2026-09-24T17:00:00.000Z');

function checklistRow(overrides: Partial<DailyAgendaRow> = {}): DailyAgendaRow {
  return {
    ...dailyAgendaFromChecklist({
      id: 7,
      title: 'Front door locked',
      sortOrder: 0,
      kind: 'recurring',
      assignedStaffId: null,
      assignedStaffName: null,
      done: false,
      teamDone: 3,
      teamTotal: 5,
      markedAt: null,
    }),
    ...overrides,
  };
}

function taskAgendaRow(overrides: Partial<TaskDeskRow> = {}): DailyAgendaRow {
  const row: TaskDeskRow = {
    id: 41,
    entityType: 'receiving',
    entityId: 4412,
    note: 'Re-test the battery',
    projectName: null,
    status: 'OPEN',
    priority: 5,
    urgency: 'normal',
    assignee: { id: 3, name: 'Dana' },
    assignees: [{ id: 3, name: 'Dana' }],
    assignedBy: { id: 9, name: 'Mo' },
    assignedAtMs: Date.parse('2026-09-21T09:00:00.000Z'),
    startedAtMs: null,
    deadlineAtMs: DEADLINE_MS,
    completedAtMs: null,
    remindAtMs: null,
    lastFollowUpAtMs: null,
    nextFollowUpAtMs: null,
    ticket: null,
    links: [],
    photoCount: 0,
    videoCount: 0,
    coverPhotoId: null,
    docCount: 0,
    ...overrides,
  };
  return dailyAgendaFromTask(row);
}

/** Narrowed read of a resolved value's text — no inline shape casts. */
function valueText(v: CompoundSlotValue | null): string | null {
  return v && v.kind === 'value' ? v.text : null;
}

describe('daily catalog', () => {
  it('has unique ids, all daily-family, each bindable somewhere', () => {
    const ids = DAILY_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of DAILY_FIELD_CATALOG) {
      assert.equal(field.family, 'daily', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.ok(field.id.startsWith('daily.'), `${field.id} is not family-qualified`);
    }
  });

  it('shares NO field id with tasks, though both now paint assignments', () => {
    const tasks = new Set(TASKS_FIELD_CATALOG.map((f) => f.id));
    for (const field of DAILY_FIELD_CATALOG) {
      assert.ok(!tasks.has(field.id), `${field.id} is in both catalogs`);
    }
  });

  it('a person is never bindable into IDENTITY — the identity-purity law', () => {
    for (const id of ['daily.owner', 'daily.assignedBy']) {
      const field = DAILY_FIELD_CATALOG.find((f) => f.id === id);
      assert.ok(field, `${id} missing`);
      assert.ok(
        !field.slotKinds.includes('identity'),
        `${id} may not occupy column one — it carries a person's name`,
      );
    }
  });

  it('the TYPE word is never bindable into identity — a band is not a handle', () => {
    const type = DAILY_FIELD_CATALOG.find((f) => f.id === 'daily.type');
    assert.ok(type, 'daily.type missing — the band fact is what the merge is for');
    assert.ok(!type.slotKinds.includes('identity'), 'a type word identifies no row');
    assert.ok(type.slotKinds.length > 0, 'the band fact must still be bindable as a column');
  });

  it('every path names a real DailyAgendaRow property', () => {
    const properties = new Set(Object.keys(checklistRow()));
    for (const field of DAILY_FIELD_CATALOG) {
      for (const [key, path] of Object.entries(field.paths ?? {})) {
        assert.ok(
          properties.has(path),
          `${field.id}.${key} reads '${path}', which the agenda row does not carry`,
        );
      }
    }
  });

  it('product default parses against the catalog — compound morph, Owner bound', () => {
    const parsed = parseSlotLayout(DAILY_PRODUCT_LAYOUT, DAILY_FIELD_CATALOG);
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'daily.item');
    assert.deepEqual(
      parsed.statusBindings.map((b) => b.fieldId),
      ['daily.owner'],
    );
    assert.deepEqual(parsed.subtitleBindings, []);
    // The band caption already says which half you are reading.
    assert.ok(!parsed.statusBindings.some((b) => b.fieldId === 'daily.type'));
  });

  it('every chrome binding names a real catalog field', () => {
    for (const [key, binding] of Object.entries(DAILY_FAMILY.chrome ?? {})) {
      const fieldId = (binding as { field?: string }).field;
      if (!fieldId) continue;
      assert.ok(
        DAILY_FIELD_CATALOG.some((f) => f.id === fieldId),
        `chrome.${key} binds ${fieldId}, which the catalog does not declare`,
      );
    }
  });
});

describe('the engine materialization', () => {
  it('the product default is the shared skeleton plus the bound owner track', () => {
    const keys = DAILY_COMPOUND_COLUMNS.map((c) => c.key);
    assert.deepEqual(
      keys.filter((k) => !k.startsWith('status:')),
      [...COMPOUND_COLUMN_KEYS],
    );
    const stateAt = keys.indexOf('state');
    assert.deepEqual(keys.slice(stateAt, stateAt + 2), ['state', 'status:1']);
    assert.equal(
      DAILY_COMPOUND_COLUMNS.find((c) => c.key === 'status:1')?.fieldId,
      'daily.owner',
    );
  });

  it('binding Team opens the track the retired flat model spent a column on', () => {
    const columns = slotTableColumnsFor(DAILY_FAMILY, {
      ...DAILY_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'daily.team' }, { fieldId: 'daily.deadline' }],
    });
    const team = columns.find((c) => c.key === 'status:1');
    assert.equal(team?.fieldId, 'daily.team');
    assert.equal(team?.label, 'Team');
    assert.equal(columns.find((c) => c.key === 'status:2')?.slotDisplayType, 'date');
  });
});

describe('resolveDailySlotValue — a checklist row', () => {
  it('resolves the facts its store recorded', () => {
    const r = checklistRow({ markedAtMs: Date.parse(MARKED_AT), done: true });
    assert.equal(valueText(resolveDailySlotValue(r, 'daily.item')), '#7');
    assert.equal(valueText(resolveDailySlotValue(r, 'daily.title')), 'Front door locked');
    assert.equal(valueText(resolveDailySlotValue(r, 'daily.type')), 'Daily checklist');
    assert.equal(valueText(resolveDailySlotValue(r, 'daily.team')), '3/5');
    assert.equal(valueText(resolveDailySlotValue(r, 'daily.status')), 'Done');
    assert.ok(valueText(resolveDailySlotValue(r, 'daily.marked')));
  });

  it('dashes every fact only a task carries — never a borrowed value', () => {
    const r = checklistRow();
    for (const id of ['daily.deadline', 'daily.completed', 'daily.record', 'daily.priority']) {
      assert.equal(valueText(resolveDailySlotValue(r, id)), null, id);
    }
    const assigner = resolveDailySlotValue(r, 'daily.assignedBy');
    assert.equal(assigner?.kind === 'person' ? assigner.name : 'unexpected', null);
  });

  it('kind resolves the exception word only — recurring says nothing', () => {
    assert.equal(valueText(resolveDailySlotValue(checklistRow(), 'daily.kind')), null);
    assert.equal(
      valueText(resolveDailySlotValue(checklistRow({ cadence: 'once' }), 'daily.kind')),
      'Once',
    );
  });

  it('owner resolves the person face, and the absence honestly', () => {
    const owned = resolveDailySlotValue(
      checklistRow({ ownerId: 12, ownerName: 'Ada' }),
      'daily.owner',
    );
    assert.deepEqual(owned, { kind: 'person', staffId: 12, name: 'Ada' });
    assert.deepEqual(resolveDailySlotValue(checklistRow(), 'daily.owner'), {
      kind: 'person',
      staffId: null,
      name: null,
    });
  });

  it('an empty roster has no denominator — null, never 0/0', () => {
    assert.equal(
      valueText(
        resolveDailySlotValue(checklistRow({ teamDone: 0, teamTotal: 0 }), 'daily.team'),
      ),
      null,
    );
  });

  it('an unchecked row reports Open and no stamp', () => {
    const r = checklistRow();
    assert.equal(valueText(resolveDailySlotValue(r, 'daily.status')), 'Open');
    assert.equal(valueText(resolveDailySlotValue(r, 'daily.marked')), null);
  });
});

describe('resolveDailySlotValue — a task row', () => {
  it('resolves the facts its store recorded', () => {
    const r = taskAgendaRow();
    assert.equal(valueText(resolveDailySlotValue(r, 'daily.item')), '#41');
    assert.equal(valueText(resolveDailySlotValue(r, 'daily.type')), 'Task');
    assert.equal(valueText(resolveDailySlotValue(r, 'daily.record')), 'Carton 4412');
    assert.equal(valueText(resolveDailySlotValue(r, 'daily.priority')), 'Normal');
    assert.ok(valueText(resolveDailySlotValue(r, 'daily.deadline')), 'a task has a deadline');
    const assigner = resolveDailySlotValue(r, 'daily.assignedBy');
    assert.equal(assigner?.kind === 'person' ? assigner.name : 'unexpected', 'Mo');
  });

  it('dashes every fact only a checklist row carries — never a borrowed value', () => {
    const r = taskAgendaRow();
    assert.equal(valueText(resolveDailySlotValue(r, 'daily.team')), null, 'a task has no roster');
    assert.equal(valueText(resolveDailySlotValue(r, 'daily.kind')), null, 'a task has no cadence');
    assert.equal(valueText(resolveDailySlotValue(r, 'daily.marked')), null);
  });

  it('reads the lifecycle vocabulary, not the tick', () => {
    assert.equal(
      valueText(resolveDailySlotValue(taskAgendaRow({ status: 'IN_PROGRESS' }), 'daily.status')),
      'Active',
    );
  });

  it('urgent is the exception, and it is named', () => {
    assert.equal(
      valueText(
        resolveDailySlotValue(taskAgendaRow({ urgency: 'urgent' }), 'daily.priority'),
      ),
      'Urgent',
    );
  });
});

describe('resolveDailySlotValue', () => {
  it('unknown field id resolves null, never throws', () => {
    assert.equal(resolveDailySlotValue(checklistRow(), 'daily.ghost'), null);
    assert.equal(resolveDailySlotValue(taskAgendaRow(), 'tasks.deadline'), null);
  });
});

describe('dailySlotValuesFor', () => {
  it('keys by TRACK, so a rebind re-points the cell with no change here', () => {
    const slots = dailySlotValuesFor(taskAgendaRow(), [
      { key: 'status:1', fieldId: 'daily.record' },
      { key: 'status:2', fieldId: 'daily.type' },
      { key: 'thumb' },
    ]);
    assert.deepEqual(slots, {
      'status:1': { kind: 'value', text: 'Carton 4412' },
      'status:2': { kind: 'value', text: 'Task' },
    });
  });

  it('a mount with nothing bound resolves nothing', () => {
    assert.equal(dailySlotValuesFor(checklistRow(), [{ key: 'thumb' }]), undefined);
  });
});
