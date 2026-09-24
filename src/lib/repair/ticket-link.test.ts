import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyRepairTicketLink } from './ticket-link';

test('no links and no ticket number → none', () => {
  assert.deepEqual(classifyRepairTicketLink([], null), { state: 'none' });
  assert.deepEqual(classifyRepairTicketLink([], '   '), { state: 'none' });
});

test('no links and a walk-in fallback or hand-typed text → none, never a send target', () => {
  assert.deepEqual(classifyRepairTicketLink([], 'RS-0042'), { state: 'none' });
  assert.deepEqual(classifyRepairTicketLink([], '12a4'), { state: 'none' });
  assert.deepEqual(classifyRepairTicketLink([], '##123'), { state: 'none' });
});

test('no links but a Zendesk-looking number → unverified (trimmed), not linked', () => {
  assert.deepEqual(classifyRepairTicketLink([], ' 4521 '), { state: 'unverified', ticketNumber: '4521' });
  assert.deepEqual(classifyRepairTicketLink([], '#4521'), { state: 'unverified', ticketNumber: '#4521' });
});

test('one linked Zendesk ticket → linked', () => {
  const rows = [{ supportTicketId: 7, zendeskTicketId: 4521 }];
  assert.deepEqual(classifyRepairTicketLink(rows, null), { state: 'linked', zendeskTicketId: 4521 });
  assert.deepEqual(classifyRepairTicketLink(rows, 'RS-0042'), { state: 'linked', zendeskTicketId: 4521 });
  assert.deepEqual(classifyRepairTicketLink(rows, '#4521'), { state: 'linked', zendeskTicketId: 4521 });
});

test('duplicate rows for the same support ticket count once', () => {
  const rows = [
    { supportTicketId: 7, zendeskTicketId: null },
    { supportTicketId: 7, zendeskTicketId: 4521 },
    { supportTicketId: 7, zendeskTicketId: 4521 },
  ];
  assert.deepEqual(classifyRepairTicketLink(rows, '4521'), { state: 'linked', zendeskTicketId: 4521 });
});

test('linked ticket disagreeing with the typed number → ambiguous listing both', () => {
  const rows = [{ supportTicketId: 7, zendeskTicketId: 4521 }];
  assert.deepEqual(classifyRepairTicketLink(rows, '4522'), {
    state: 'ambiguous',
    zendeskTicketIds: [4521, 4522],
  });
});

test('one internal-only ticket → internal, even with a typed number', () => {
  const rows = [{ supportTicketId: 9, zendeskTicketId: null }];
  assert.deepEqual(classifyRepairTicketLink(rows, null), { state: 'internal', supportTicketId: 9 });
  assert.deepEqual(classifyRepairTicketLink(rows, '4521'), { state: 'internal', supportTicketId: 9 });
});

test('more than one support ticket → ambiguous with their Zendesk ids', () => {
  const rows = [
    { supportTicketId: 7, zendeskTicketId: 4521 },
    { supportTicketId: 8, zendeskTicketId: 4600 },
    { supportTicketId: 9, zendeskTicketId: null },
  ];
  assert.deepEqual(classifyRepairTicketLink(rows, '4521'), {
    state: 'ambiguous',
    zendeskTicketIds: [4521, 4600],
  });
});
