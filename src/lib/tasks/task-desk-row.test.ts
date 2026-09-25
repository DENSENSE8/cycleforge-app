/**
 * The task row's two identities, and the doors they open.
 *
 * A ticket task carries TWO numbers — the local `support_tickets.id` it is
 * anchored to and the provider number the helpdesk answers to — and every bug
 * this file defends against is one of them standing in for the other. The
 * symptom is not a crash: `/support?ticket=312` and `SupportTicketDetail
 * ticketId={312}` both render, they just render somebody else's ticket.
 *
 * The surface split is here for the same reason: `/m` may not link into a desk
 * console (`SURFACE_LAW` §1), so the phone and the desk answer differently for
 * the arms where `/m` owns a door, and identically everywhere else.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  taskDeskRecordHref,
  taskDeskRecordLabel,
  taskDeskTitle,
  taskDeskTicketNumber,
  type TaskDeskRow,
} from './task-desk-row';

function row(overrides: Partial<TaskDeskRow> = {}): TaskDeskRow {
  return {
    id: 41,
    entityType: 'receiving',
    entityId: 4412,
    projectName: null,
    note: 'Re-test the battery',
    status: 'OPEN',
    priority: 100,
    urgency: 'normal',
    assignee: { id: 3, name: 'Dana' },
    assignees: [{ id: 3, name: 'Dana' }],
    assignedBy: { id: 9, name: 'Lee' },
    assignedAtMs: Date.parse('2026-09-22T15:00:00.000Z'),
    startedAtMs: null,
    deadlineAtMs: null,
    completedAtMs: null,
    remindAtMs: null,
    ticket: null,
    links: [],
    photoCount: 0,
    videoCount: 0,
    coverPhotoId: null,
    docCount: 0,
    ...overrides,
  };
}

const ticketRow = (overrides: Partial<TaskDeskRow> = {}) =>
  row({
    entityType: 'support_ticket',
    // The LOCAL registry id — what the row is anchored to.
    entityId: 312,
    ticket: {
      id: 312,
      provider: 'zendesk',
      subject: 'Cracked housing',
      status: 'open',
      // The number the operator quotes.
      externalId: '48120',
    },
    ...overrides,
  });

test('a ticket task is named by the number the operator quotes', () => {
  assert.equal(taskDeskRecordLabel(ticketRow()), 'Ticket 48120');
});

test('a ticket with no provider mirror falls back to the handle it does have', () => {
  const internal = ticketRow({
    ticket: { id: 312, provider: 'internal', subject: null, status: null, externalId: null },
  });
  assert.equal(taskDeskTicketNumber(internal), null);
  assert.equal(taskDeskRecordLabel(internal), 'Ticket 312');
});

test('an order and a carton are still named by their own id', () => {
  assert.equal(taskDeskRecordLabel(row()), 'Carton 4412');
  assert.equal(taskDeskRecordLabel(row({ entityType: 'order', entityId: 88 })), 'Order 88');
});

test('both ticket doors carry the PROVIDER number, never the registry id', () => {
  assert.equal(taskDeskRecordHref(ticketRow(), 'desk'), '/support?ticket=48120');
  assert.equal(taskDeskRecordHref(ticketRow(), 'phone'), '/m/t/48120');
});

test('a ticket with no provider mirror has no door at all', () => {
  const internal = ticketRow({
    ticket: { id: 312, provider: 'internal', subject: null, status: null, externalId: null },
  });
  // Null, not a link to 312 — that number means a different ticket to the
  // helpdesk, and an honest absent link beats a confident wrong one.
  assert.equal(taskDeskRecordHref(internal, 'desk'), null);
  assert.equal(taskDeskRecordHref(internal, 'phone'), null);
});

test('a carton opens the phone carton page on the phone and Unbox on the desk', () => {
  assert.equal(taskDeskRecordHref(row(), 'desk'), '/unbox?carton=4412');
  assert.equal(taskDeskRecordHref(row(), 'phone'), '/m/r/4412');
});

test('an order keeps the desk route on both surfaces — /m has no numeric-id door', () => {
  const order = row({ entityType: 'order', entityId: 88 });
  assert.equal(taskDeskRecordHref(order, 'desk'), '/dashboard?order=88');
  assert.equal(taskDeskRecordHref(order, 'phone'), '/dashboard?order=88');
});

test('a non-ticket row never reports a ticket number', () => {
  assert.equal(taskDeskTicketNumber(row()), null);
  // Not even when a stale ticket join rode along on the wrong entity type.
  assert.equal(
    taskDeskTicketNumber(
      row({ ticket: { id: 1, provider: 'zendesk', subject: null, status: null, externalId: '9' } }),
    ),
    null,
  );
});

test('project label titles the shared work; instructions remain the fallback', () => {
  assert.equal(taskDeskTitle(row({ projectName: '  Returns launch  ', note: '# Check packaging' })),
    'Returns launch');
  assert.equal(taskDeskTitle(row({ note: '# Check packaging' })), 'Check packaging');
});
