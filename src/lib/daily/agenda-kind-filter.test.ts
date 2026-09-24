/**
 * AgendaKindFilter contracts — the multi-select, reorderable kind row of the
 * one task list.
 *
 *   npx tsx --test src/lib/daily/agenda-kind-filter.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AGENDA_KIND_LABEL,
  DEFAULT_AGENDA_KIND_PREFS,
  agendaKindVisible,
  filterAgendaByKinds,
  parseAgendaKindPrefs,
  reorderAgendaKinds,
  toggleAgendaKind,
} from '@/lib/daily/agenda-kind-filter';
import type { DailyAgendaRow } from '@/lib/daily/daily-agenda-row';

const row = (type: DailyAgendaRow['type']): Pick<DailyAgendaRow, 'type'> => ({ type });

describe('agenda kind prefs', () => {
  it('labels come from the band label map — chips and headers cannot disagree', () => {
    assert.equal(AGENDA_KIND_LABEL.checklist, 'Daily checklist');
    assert.equal(AGENDA_KIND_LABEL.task, 'Task');
    assert.equal(AGENDA_KIND_LABEL.ticket, 'Ticket');
  });

  it('everything shows by default', () => {
    for (const kind of ['checklist', 'task', 'ticket'] as const) {
      assert.equal(agendaKindVisible(DEFAULT_AGENDA_KIND_PREFS, kind), true);
    }
  });

  it('multi-select: two kinds can be off at once, leaving the third showing', () => {
    let prefs = DEFAULT_AGENDA_KIND_PREFS;
    prefs = toggleAgendaKind(prefs, 'checklist');
    prefs = toggleAgendaKind(prefs, 'task');
    assert.equal(agendaKindVisible(prefs, 'checklist'), false);
    assert.equal(agendaKindVisible(prefs, 'task'), false);
    assert.equal(agendaKindVisible(prefs, 'ticket'), true, 'the last one stays on');
  });

  it('the last showing kind refuses to turn off — narrow to one, never zero', () => {
    let prefs = DEFAULT_AGENDA_KIND_PREFS;
    prefs = toggleAgendaKind(prefs, 'checklist');
    prefs = toggleAgendaKind(prefs, 'task');
    const pinned = toggleAgendaKind(prefs, 'ticket');
    assert.equal(agendaKindVisible(pinned, 'ticket'), true);
  });

  it('a toggle is reversible', () => {
    const off = toggleAgendaKind(DEFAULT_AGENDA_KIND_PREFS, 'task');
    const back = toggleAgendaKind(off, 'task');
    assert.deepEqual(back.off, []);
  });

  it('reorder keeps every kind exactly once', () => {
    const prefs = reorderAgendaKinds(DEFAULT_AGENDA_KIND_PREFS, ['ticket', 'checklist', 'task']);
    assert.deepEqual(prefs.order, ['ticket', 'checklist', 'task']);
  });

  it('a dropped or duplicated drag result is refused', () => {
    assert.deepEqual(reorderAgendaKinds(DEFAULT_AGENDA_KIND_PREFS, ['ticket', 'task']).order, DEFAULT_AGENDA_KIND_PREFS.order);
    assert.deepEqual(
      reorderAgendaKinds(DEFAULT_AGENDA_KIND_PREFS, ['ticket', 'ticket', 'task']).order,
      DEFAULT_AGENDA_KIND_PREFS.order,
    );
  });

  it('rows filter by every showing kind at once', () => {
    const rows = [row('checklist'), row('task'), row('ticket'), row('checklist'), row('task')];
    assert.equal(filterAgendaByKinds(rows, DEFAULT_AGENDA_KIND_PREFS).length, 5);
    let prefs = toggleAgendaKind(DEFAULT_AGENDA_KIND_PREFS, 'checklist');
    prefs = toggleAgendaKind(prefs, 'task');
    assert.deepEqual(
      filterAgendaByKinds(rows, prefs).map((r) => r.type),
      ['ticket'],
    );
  });

  it('stored prefs survive a reload; garbage collapses to default', () => {
    const prefs = toggleAgendaKind(reorderAgendaKinds(DEFAULT_AGENDA_KIND_PREFS, ['task', 'ticket', 'checklist']), 'task');
    const revived = parseAgendaKindPrefs(JSON.stringify(prefs));
    assert.deepEqual(revived.order, prefs.order);
    assert.deepEqual(revived.off, prefs.off);
    assert.deepEqual(parseAgendaKindPrefs('{"order":["bogus"]}'), DEFAULT_AGENDA_KIND_PREFS);
    assert.deepEqual(parseAgendaKindPrefs('not json'), DEFAULT_AGENDA_KIND_PREFS);
  });
});
