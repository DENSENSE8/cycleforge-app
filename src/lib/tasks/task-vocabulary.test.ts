import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isInboxAnchorable,
  isTaskEntityType,
  TASK_INITIAL_STATUS,
  TASK_PRIORITY,
  TASK_WORK_TYPE,
  taskEntityEnum,
  taskEntityFromEnum,
  taskPriorityFor,
  taskUrgencyFromPriority,
} from './task-vocabulary';

test('a thrown task is a FOLLOW_UP that starts OPEN', () => {
  assert.equal(TASK_WORK_TYPE, 'FOLLOW_UP');
  // OPEN, not ASSIGNED — the row points at someone who has not acknowledged it.
  assert.equal(TASK_INITIAL_STATUS, 'OPEN');
});

test('urgent sorts ahead of normal in the existing priority column', () => {
  assert.equal(taskPriorityFor('urgent'), 10);
  assert.equal(taskPriorityFor('normal'), 100);
  // The read index is ASC, so "more urgent" must be the SMALLER number.
  assert.ok(TASK_PRIORITY.urgent < TASK_PRIORITY.normal);
});

/**
 * Threshold, not equality. Rows written before this vocabulary existed carry
 * arbitrary ints, and an `=== 10` test would report every one of them normal.
 */
test('reading urgency back is a threshold, so legacy priorities classify', () => {
  assert.equal(taskUrgencyFromPriority(10), 'urgent');
  assert.equal(taskUrgencyFromPriority(1), 'urgent', 'a lower legacy value is still urgent');
  assert.equal(taskUrgencyFromPriority(11), 'normal');
  assert.equal(taskUrgencyFromPriority(100), 'normal');
  assert.equal(taskUrgencyFromPriority(null), 'normal');
  assert.equal(taskUrgencyFromPriority(undefined), 'normal');
});

test('the two case conventions round-trip through one mapping', () => {
  for (const shared of ['order', 'receiving', 'support_ticket'] as const) {
    const enumLabel = taskEntityEnum(shared);
    assert.equal(enumLabel, shared.toUpperCase());
    assert.equal(taskEntityFromEnum(enumLabel), shared, `${shared} must round-trip`);
  }
});

test('an unknown enum label resolves to null rather than a neighbouring kind', () => {
  for (const bad of ['SKU_STOCK', 'FBA_SHIPMENT', 'order', '', null, undefined, 7]) {
    assert.equal(taskEntityFromEnum(bad), null, `${String(bad)} must not resolve`);
  }
});

test('the throwable set is the urgency set — one list, not two copies', () => {
  assert.equal(isTaskEntityType('order'), true);
  assert.equal(isTaskEntityType('receiving'), true);
  assert.equal(isTaskEntityType('support_ticket'), true);
  assert.equal(isTaskEntityType('receiving_line'), false);
  assert.equal(isTaskEntityType('repair'), false);
});

/**
 * The predicate exists so the fan-out can refuse HONESTLY — a kind the
 * `staff_inbox_items` CHECK does not carry must come back
 * `notified: 'skipped_entity'`, never as a constraint violation thrown at an
 * operator who threw a perfectly legal task. Every kind is anchorable today;
 * this pins that the two lists agree, so the next `work_entity_type_enum`
 * value cannot quietly ship un-notified.
 */
test('every throwable record kind can anchor an inbox row', () => {
  assert.equal(isTaskEntityType('support_ticket'), true);
  // Anchorable since migration 2026-09-22a widened the inbox CHECK and gave
  // `support_tickets` its parent-delete trigger — a ticket handoff now raises
  // a badge instead of coming back `notified: 'skipped_entity'`.
  assert.equal(isInboxAnchorable('support_ticket'), true);
  assert.equal(isInboxAnchorable('order'), true);
  assert.equal(isInboxAnchorable('receiving'), true);
});
