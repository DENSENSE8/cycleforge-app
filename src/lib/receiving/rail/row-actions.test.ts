/**
 * Pure tests for the rail row (⋮) action registry.
 * Run: npx tsx --test src/lib/receiving/rail/row-actions.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRailRowActions, RAIL_ROW_ACTIONS } from './row-actions';
import type { RailRowActionHandlers } from './row-actions';

function handlers(over: Partial<RailRowActionHandlers> = {}): RailRowActionHandlers {
  return { select: () => {}, share: () => {}, hide: () => {}, remove: () => {}, ...over };
}

const ids = (id: 'receiving' | 'searchRecent', h: RailRowActionHandlers) =>
  buildRailRowActions(id, h).map((a) => a.id);

test('receiving: a fully-capable row reads select → share → hide → delete', () => {
  assert.deepEqual(ids('receiving', handlers()), ['select', 'share', 'hide', 'delete']);
});

test('the menu carries ACTIONS only — identity lives in the peek beside it', () => {
  const items = ids('receiving', handlers());
  for (const gone of ['open', 'copyTracking', 'copyPo']) {
    assert.ok(!items.includes(gone), `${gone} must not be in the row menu`);
  }
});

test('searchRecent drops Hide — that feed has no staff_rail_exclusions key', () => {
  assert.ok(!RAIL_ROW_ACTIONS.searchRecent.verbs.includes('hide'));
  assert.deepEqual(ids('searchRecent', handlers()), ['select', 'share', 'delete']);
});

test('a verb that cannot be performed is OMITTED, never disabled', () => {
  assert.deepEqual(ids('receiving', handlers({ select: null, share: null, hide: null })), ['delete']);
  assert.deepEqual(ids('receiving', handlers({ remove: null })), ['select', 'share', 'hide']);
  // No carton, no feed key, no permission → no menu at all, not an empty shell.
  assert.deepEqual(
    buildRailRowActions('receiving', handlers({ select: null, share: null, hide: null, remove: null })),
    [],
  );
  for (const action of buildRailRowActions('receiving', handlers())) {
    assert.equal(Object.hasOwn(action, 'disabled'), false, `${action.id} must not be disabled`);
  }
});

test('Delete is the only danger item, and Hide is never in its group', () => {
  const acts = buildRailRowActions('receiving', handlers());
  assert.deepEqual(acts.filter((a) => a.group === 'danger').map((a) => a.id), ['delete']);
  assert.equal(acts.find((a) => a.id === 'hide')!.group, 'mine');
  assert.equal(acts.find((a) => a.id === 'share')!.group, 'read');
  assert.equal(acts.find((a) => a.id === 'select')!.group, 'read');
});

test('Hide says whose list it hides from — one verb, not Dismiss AND Hide', () => {
  const acts = buildRailRowActions('receiving', handlers());
  assert.equal(acts.filter((a) => a.group === 'mine').length, 1);
  assert.equal(acts.find((a) => a.id === 'hide')!.label, 'Hide from my list');
});

test('Delete names the blast radius — the carton, not the line', () => {
  const acts = buildRailRowActions('receiving', handlers());
  assert.match(acts.find((a) => a.id === 'delete')!.label, /carton/i);
});

test('each item runs exactly the handler it was given', () => {
  const fired: string[] = [];
  const acts = buildRailRowActions('receiving', {
    select: () => fired.push('select'),
    share: () => fired.push('share'),
    hide: () => fired.push('hide'),
    remove: () => fired.push('remove'),
  });
  for (const a of acts) a.onSelect();
  assert.deepEqual(fired, ['select', 'share', 'hide', 'remove']);
});
