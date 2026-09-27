import test from 'node:test';
import assert from 'node:assert/strict';
import { NavFacetsQuery, NavRecentOpenBody, NavRecentsQuery } from './nav';

test('recents query: known surface, limit coerced from the query string and bounded', () => {
  assert.deepEqual(NavRecentsQuery.parse({ surface: 'support.tickets', limit: '5' }), { surface: 'support.tickets', limit: 5 });
  assert.deepEqual(NavRecentsQuery.parse({ surface: 'tech.scans' }), { surface: 'tech.scans' });
  for (const bad of [
    { surface: 'support:recent-tickets' },
    { surface: 'support.tickets', limit: '0' },
    { surface: 'support.tickets', limit: '51' },
    { surface: 'support.tickets', limit: '2.5' },
    {},
  ]) {
    assert.equal(NavRecentsQuery.safeParse(bad).success, false, JSON.stringify(bad));
  }
});

test('recents open body: numeric ids become text, label defaults to empty, identity fields are refused', () => {
  assert.deepEqual(NavRecentOpenBody.parse({ surface: 'support.tickets', entityType: 'ticket', entityId: 9600 }), {
    surface: 'support.tickets',
    entityType: 'ticket',
    entityId: '9600',
    label: '',
  });
  assert.equal(
    NavRecentOpenBody.parse({ surface: 'audit_log.trace', entityType: 'serial', entityId: '  SN-1  ', label: ' SN-1 ' }).entityId,
    'SN-1',
  );
  for (const bad of [
    // org / staff must come from the session, never the body
    { surface: 'support.tickets', entityType: 'ticket', entityId: 1, staffId: 99 },
    { surface: 'support.tickets', entityType: 'ticket', entityId: 1, organizationId: 'x' },
    { surface: 'support.tickets', entityType: 'ticket', entityId: '   ' },
    { surface: 'support.tickets', entityType: '', entityId: '1' },
    { surface: 'support.tickets', entityType: 'ticket', entityId: -4 },
    { surface: 'support.tickets', entityType: 'ticket', entityId: '1', label: 'x'.repeat(513) },
    { surface: 'nope', entityType: 'ticket', entityId: '1' },
  ]) {
    assert.equal(NavRecentOpenBody.safeParse(bad).success, false, JSON.stringify(bad));
  }
});

test('facets query: only declared contexts', () => {
  assert.equal(NavFacetsQuery.safeParse({ context: 'outbound.triage' }).success, true);
  assert.equal(NavFacetsQuery.safeParse({ context: 'outbound.orders' }).success, false);
  assert.equal(NavFacetsQuery.safeParse({ context: null }).success, false);
});
