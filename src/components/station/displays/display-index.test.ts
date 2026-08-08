/**
 *   node --import tsx --test src/components/station/displays/display-index.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import type { SectionTab } from '@/design-system/components';
import {
  STATION_DISPLAY_INDEX,
  defaultDisplayIndexGroup,
  deriveDisplayIndexRowsFromTabs,
  filterDisplayIndexRows,
  groupDisplayIndexRows,
  summarizeDisplayIndexGroup,
  type DisplayIndexRow,
} from './display-index';

const Icon = () => null;

function tab(id: string, opts?: Partial<SectionTab>): SectionTab {
  return {
    id,
    label: id[0]!.toUpperCase() + id.slice(1),
    icon: Icon,
    content: null,
    ...opts,
  };
}

test('STATION_DISPLAY_INDEX sentinel is index', () => {
  assert.equal(STATION_DISPLAY_INDEX, 'index');
});

test('defaultDisplayIndexGroup maps known leaves', () => {
  assert.equal(defaultDisplayIndexGroup('ticket'), 'verification');
  assert.equal(defaultDisplayIndexGroup('units'), 'assets');
  assert.equal(defaultDisplayIndexGroup('timeline'), 'context');
  assert.equal(defaultDisplayIndexGroup('manuals'), 'context');
});

test('deriveDisplayIndexRowsFromTabs skips checklist + stripHidden', () => {
  const rows = deriveDisplayIndexRowsFromTabs([
    tab('ticket'),
    tab('checklist', { stripHidden: true }),
    tab('photos'),
    tab('ghost', { stripHidden: true }),
  ]);
  assert.deepEqual(
    rows.map((r) => r.id),
    ['ticket', 'photos'],
  );
  assert.equal(rows.every((r) => r.tone === 'neutral'), true);
  assert.equal(rows.find((r) => r.id === 'ticket')?.group, 'verification');
});

test('groupDisplayIndexRows omits empty groups and keeps order', () => {
  const rows: DisplayIndexRow[] = [
    { id: 'timeline', label: 'Timeline', subtitle: '', tone: 'neutral', group: 'context' },
    { id: 'ticket', label: 'Ticket', subtitle: 'Claim', tone: 'action', group: 'verification' },
    { id: 'units', label: 'Units', subtitle: '1', tone: 'ok', group: 'assets' },
  ];
  const sections = groupDisplayIndexRows(rows);
  assert.deepEqual(
    sections.map((s) => s.group),
    ['verification', 'assets', 'context'],
  );
  assert.equal(sections[0]?.rows[0]?.id, 'ticket');
});

test('filterDisplayIndexRows matches label · subtitle · id · group', () => {
  const rows: DisplayIndexRow[] = [
    { id: 'ticket', label: 'Ticket', subtitle: 'Claim needed', tone: 'action', group: 'verification' },
    { id: 'photos', label: 'Photos', subtitle: '10 photos', tone: 'ok', group: 'verification' },
  ];
  assert.equal(filterDisplayIndexRows(rows, '').length, 2);
  assert.equal(filterDisplayIndexRows(rows, 'claim')[0]?.id, 'ticket');
  assert.equal(filterDisplayIndexRows(rows, 'assets').length, 0);
  assert.ok(filterDisplayIndexRows(rows, 'verification').length === 2);
});

test('summarizeDisplayIndexGroup speaks only for ACTION rows', () => {
  const row = (id: string, tone: DisplayIndexRow['tone']): DisplayIndexRow => ({
    id,
    label: id,
    subtitle: '',
    tone,
    group: 'context',
  });
  assert.equal(summarizeDisplayIndexGroup([row('a', 'action')]).label, '1 pending');
  assert.equal(
    summarizeDisplayIndexGroup([row('a', 'action'), row('b', 'action')]).label,
    '2 pending',
  );
  // All-ok and mixed ok/neutral say NOTHING — "Clear" is noise and "Incomplete"
  // was false for reference rows (Support · Tracking · Timeline never complete).
  assert.equal(summarizeDisplayIndexGroup([row('a', 'ok')]).label, '');
  assert.equal(summarizeDisplayIndexGroup([row('a', 'ok'), row('b', 'neutral')]).label, '');
  assert.equal(summarizeDisplayIndexGroup([]).label, '');
});

