import test from 'node:test';
import assert from 'node:assert/strict';
import type { StationConfig } from './contract';
import { cherryPickBlocks, findBlockInstance, listBlockInstances, restoreConfig } from './version-ops';

const v3: StationConfig = {
  slots: {
    trigger: [{ id: 'blk_scan', block: 'scan_band', display: { surface: 'unbox' } }],
    queue: [
      { id: 'blk_queue', block: 'rail_feed', source: { id: 'receiving.unbox_queue' } },
      { id: 'blk_list', block: 'checklist', source: { id: 'receiving.carton_lines' }, actions: ['receiving.set_condition'] },
    ],
  },
};

const v7: StationConfig = {
  slots: {
    trigger: [{ id: 'blk_scan', block: 'scan_band', display: { surface: 'triage' } }],
    queue: [{ id: 'blk_queue', block: 'rail_feed', source: { id: 'receiving.unbox_queue', filters: { status: 'ALL' } } }],
  },
};

test('listBlockInstances walks slots in canonical order with positions', () => {
  const ids = listBlockInstances(v3).map((b) => `${b.slot}:${b.index}:${b.instance.id}`);
  assert.deepEqual(ids, ['trigger:0:blk_scan', 'queue:0:blk_queue', 'queue:1:blk_list']);
  assert.deepEqual(listBlockInstances({ slots: 'legacy' }), []);
  assert.equal(findBlockInstance(v3, 'blk_list')?.index, 1);
  assert.equal(findBlockInstance(v3, 'nope'), null);
});

test('restoreConfig is a deep copy, never the same object', () => {
  const copy = restoreConfig(v3);
  assert.deepEqual(copy, v3);
  assert.notEqual(copy, v3);
  assert.notEqual(copy.slots, v3.slots);
});

test('cherry-pick replaces an instance present in both, in place', () => {
  // v7 is live; take the scan band's config from v3.
  const { config, picked, missing } = cherryPickBlocks(v7, v3, ['blk_scan']);
  assert.deepEqual(picked, ['blk_scan']);
  assert.deepEqual(missing, []);
  const slots = config.slots as Exclude<StationConfig['slots'], 'legacy'>;
  assert.deepEqual(slots.trigger, [{ id: 'blk_scan', block: 'scan_band', display: { surface: 'unbox' } }]);
  // Untouched slot survives verbatim.
  assert.deepEqual(slots.queue, (v7.slots as Exclude<StationConfig['slots'], 'legacy'>).queue);
});

test('cherry-pick appends an instance the base lost, into the slot it had', () => {
  const { config, picked } = cherryPickBlocks(v7, v3, ['blk_list']);
  assert.deepEqual(picked, ['blk_list']);
  const queue = (config.slots as Exclude<StationConfig['slots'], 'legacy'>).queue!;
  assert.equal(queue.length, 2);
  assert.equal(queue[1].id, 'blk_list');
  assert.deepEqual(queue[1].actions, ['receiving.set_condition']);
});

test('cherry-pick reports ids the source does not have, and picks the rest', () => {
  const { picked, missing } = cherryPickBlocks(v7, v3, ['ghost', 'blk_list']);
  assert.deepEqual(missing, ['ghost']);
  assert.deepEqual(picked, ['blk_list']);
});

test('a legacy base becomes a slot map; a legacy source has nothing to pick', () => {
  const fromLegacy = cherryPickBlocks({ slots: 'legacy' }, v3, ['blk_scan']);
  assert.deepEqual(fromLegacy.config, { slots: { trigger: v3.slots !== 'legacy' ? v3.slots.trigger : [] } });
  const intoLegacy = cherryPickBlocks(v3, { slots: 'legacy' }, ['blk_scan']);
  assert.deepEqual(intoLegacy.missing, ['blk_scan']);
  assert.deepEqual(intoLegacy.config, v3);
});

test('inputs are never mutated', () => {
  const baseSnapshot = JSON.stringify(v7);
  const fromSnapshot = JSON.stringify(v3);
  cherryPickBlocks(v7, v3, ['blk_scan', 'blk_list']);
  assert.equal(JSON.stringify(v7), baseSnapshot);
  assert.equal(JSON.stringify(v3), fromSnapshot);
});
