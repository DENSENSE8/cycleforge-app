/**
 *   node --import tsx --test src/components/station/displays/display-index.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import type { SectionTab } from '@/lib/design/section-tab';
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
  assert.equal(defaultDisplayIndexGroup('listings'), 'verification');
  assert.equal(defaultDisplayIndexGroup('listing'), 'verification');
  assert.equal(defaultDisplayIndexGroup('classify'), 'verification');
  assert.equal(defaultDisplayIndexGroup('units'), 'assets');
  assert.equal(defaultDisplayIndexGroup('prebox'), 'assets');
  assert.equal(defaultDisplayIndexGroup('photos'), 'assets');
  assert.equal(defaultDisplayIndexGroup('checklist'), 'assets');
  assert.equal(defaultDisplayIndexGroup('manuals'), 'assets');
  assert.equal(defaultDisplayIndexGroup('ticket'), 'context');
  assert.equal(defaultDisplayIndexGroup('timeline'), 'context');
});

test('deriveDisplayIndexRowsFromTabs skips stripHidden only (visible checklist stays)', () => {
  const hiddenRing = deriveDisplayIndexRowsFromTabs([
    tab('ticket'),
    tab('checklist', { stripHidden: true }),
    tab('photos', { count: 3 }),
    tab('ghost', { stripHidden: true }),
  ]);
  assert.deepEqual(
    hiddenRing.map((r) => r.id),
    ['ticket', 'photos'],
  );
  assert.equal(hiddenRing.find((r) => r.id === 'photos')?.subtitle, '3 items');

  const testingChecklist = deriveDisplayIndexRowsFromTabs([tab('checklist')]);
  assert.deepEqual(
    testingChecklist.map((r) => r.id),
    ['checklist'],
  );
  assert.equal(testingChecklist[0]?.group, 'assets');
});

test('groupDisplayIndexRows omits empty groups and keeps order', () => {
  const rows: DisplayIndexRow[] = [
    { id: 'timeline', label: 'Timeline', subtitle: '', tone: 'neutral', group: 'context' },
    { id: 'listings', label: 'Listings', subtitle: 'Links', tone: 'neutral', group: 'verification' },
    { id: 'units', label: 'Units', subtitle: '1', tone: 'ok', group: 'assets' },
  ];
  const sections = groupDisplayIndexRows(rows);
  assert.deepEqual(
    sections.map((s) => s.group),
    ['verification', 'assets', 'context'],
  );
  assert.equal(sections[0]?.rows[0]?.id, 'listings');
});

test('filterDisplayIndexRows matches label · subtitle · id · group', () => {
  const rows: DisplayIndexRow[] = [
    { id: 'ticket', label: 'Ticket', subtitle: 'No ticket', tone: 'neutral', group: 'context' },
    { id: 'photos', label: 'Photos', subtitle: '10 photos', tone: 'ok', group: 'assets' },
  ];
  assert.equal(filterDisplayIndexRows(rows, '').length, 2);
  assert.equal(filterDisplayIndexRows(rows, 'no ticket')[0]?.id, 'ticket');
  assert.equal(filterDisplayIndexRows(rows, 'verification').length, 0);
  assert.ok(filterDisplayIndexRows(rows, 'assets').length === 1);
  assert.ok(filterDisplayIndexRows(rows, 'context').length === 1);
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

test('filterDisplayIndexRows matches Daily inspector topic labels', () => {
  const rows: DisplayIndexRow[] = [
    { id: 'overview', label: 'Overview', subtitle: 'Your mark & roster', tone: 'neutral', group: 'verification' },
    { id: 'ticket', label: 'Ticket', subtitle: 'Connect a ticket', tone: 'neutral', group: 'context' },
    { id: 'who-ran', label: 'Who ran it', subtitle: 'Staff who ticked today', tone: 'neutral', group: 'context' },
  ];
  assert.equal(filterDisplayIndexRows(rows, 'overview')[0]?.id, 'overview');
  assert.equal(filterDisplayIndexRows(rows, 'ticket')[0]?.id, 'ticket');
  assert.ok(filterDisplayIndexRows(rows, 'who ran').some((r) => r.id === 'who-ran'));
});
