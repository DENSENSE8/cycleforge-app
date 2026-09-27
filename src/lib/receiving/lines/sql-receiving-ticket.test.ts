/**
 * Run: `npx tsx --test src/lib/receiving/lines/sql-receiving-ticket.test.ts`
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sqlCartonLinkedSupportTicketLateralJoin,
  sqlLinkedSupportTicketLateralJoin,
  sqlReceivingCartonZendeskTicketColumn,
  sqlReceivingZendeskTicketColumn,
} from './sql-receiving-ticket';

test('sqlReceivingZendeskTicketColumn prefers linked_ticket over denormalized columns', () => {
  const col = sqlReceivingZendeskTicketColumn();
  assert.match(col, /linked_ticket\.ticket_label/);
  assert.match(col, /rl\.zendesk_ticket/);
  assert.match(col, /r\.zendesk_ticket/);
});

test('sqlLinkedSupportTicketLateralJoin resolves RECEIVING_LINE, RECEIVING, and SHIPMENT links', () => {
  const join = sqlLinkedSupportTicketLateralJoin();
  assert.match(join, /RECEIVING_LINE/);
  assert.match(join, /RECEIVING/);
  assert.match(join, /SHIPMENT/);
  assert.match(join, /support_tickets st/);
});

test('sqlCartonLinkedSupportTicketLateralJoin resolves RECEIVING and SHIPMENT for lineless cartons', () => {
  const join = sqlCartonLinkedSupportTicketLateralJoin();
  assert.match(join, /RECEIVING/);
  assert.match(join, /SHIPMENT/);
  assert.doesNotMatch(join, /RECEIVING_LINE/);
});

test('sqlReceivingCartonZendeskTicketColumn prefers linked_ticket over receiving_carton column', () => {
  const col = sqlReceivingCartonZendeskTicketColumn();
  assert.match(col, /linked_ticket\.ticket_label/);
  assert.match(col, /r\.zendesk_ticket/);
  assert.doesNotMatch(col, /rl\.zendesk_ticket/);
});
