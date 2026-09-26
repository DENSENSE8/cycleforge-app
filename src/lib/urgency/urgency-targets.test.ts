import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isUrgencyEntityType,
  urgencyEntityTypes,
  urgencyTarget,
  URGENCY_TARGETS,
} from './urgency-targets';

test('the three promotable record kinds, and nothing else', () => {
  assert.deepEqual([...urgencyEntityTypes()].sort(), ['order', 'receiving', 'support_ticket']);
});

test('an untrusted string narrows honestly', () => {
  assert.equal(isUrgencyEntityType('order'), true);
  assert.equal(isUrgencyEntityType('receiving'), true);
  assert.equal(isUrgencyEntityType('support_ticket'), true);

  // Near-misses a caller might reach for. Each must fail closed rather than
  // resolve to a neighbouring record kind.
  for (const near of ['Order', 'ORDER', 'carton', 'receiving_line', 'ticket', 'repair', '']) {
    assert.equal(isUrgencyEntityType(near), false, `${near} must not narrow`);
  }
  for (const wrong of [null, undefined, 42, {}, []]) {
    assert.equal(isUrgencyEntityType(wrong), false);
  }
});

test('urgencyTarget resolves a descriptor, or null for anything it cannot carry', () => {
  assert.equal(urgencyTarget('order')?.noun, 'order');
  assert.equal(urgencyTarget('receiving')?.noun, 'carton');
  assert.equal(urgencyTarget('support_ticket')?.noun, 'ticket');
  assert.equal(urgencyTarget('receiving_line'), null);
  assert.equal(urgencyTarget(undefined), null);
});

test('every target self-describes its storage, and the keys match the union', () => {
  for (const entityType of urgencyEntityTypes()) {
    const target = URGENCY_TARGETS[entityType];
    // The registry is keyed by the same string it stores — a mismatch would let
    // a lookup return a descriptor for a different record kind.
    assert.equal(target.entityType, entityType);
    assert.ok(target.noun.length > 0);
    assert.ok(target.storage.length > 0, `${entityType} must name where urgent lands`);
  }
});

/** The carton and the ticket carry richer scales of their own; the order does not. */
test('records that own a richer scale point at the module that owns it', () => {
  assert.equal(URGENCY_TARGETS.order.ownScale, null);
  assert.match(URGENCY_TARGETS.receiving.ownScale ?? '', /priority-override/);
  assert.match(URGENCY_TARGETS.support_ticket.ownScale ?? '', /low \| normal \| high \| urgent/);
});
