import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRepairTicket, formatRepairDueDate, type RepairTicketFacts } from './repair-ticket-text';

const facts: RepairTicketFacts = {
  channel: 'counter',
  customer: {
    name: 'Ada Lovelace',
    phone: '555-123-4567',
    email: 'ada@example.com',
    shipTo: '12 Main St, Apt 4, Springfield IL 62701',
  },
  devices: [
    { product: 'Bose Wave Music System', serial: 'W100', issue: 'No power', quote: '125', notes: '' },
    { product: 'Bose SoundLink Revolve', serial: 'SN-123', issue: 'Will not charge, Cracked grille', quote: '$89.00', notes: 'Keep old battery' },
  ],
  deviceIndex: 1,
  visitNotes: 'Dropped once',
  dueDate: '10/16/2026',
  priorOrderRef: null,
};

test('the subject names who to call and what it is — never an internal id', () => {
  const { subject } = buildRepairTicket(facts);
  assert.equal(subject, 'Repair · Ada Lovelace · 555-123-4567 · Bose SoundLink Revolve');
});

test('the body carries the customer, this device, and every product on the visit', () => {
  const { body } = buildRepairTicket(facts);
  for (const fact of [
    'Device 2 of 2 on this visit.',
    'Name: Ada Lovelace',
    'Phone: 555-123-4567',
    'Email: ada@example.com',
    'Ship to: 12 Main St, Apt 4, Springfield IL 62701',
    'Product: Bose SoundLink Revolve',
    'Serial: SN-123',
    'Issue: Will not charge, Cracked grille',
    'Quote: $89.00',
    'Device notes: Keep old battery',
    '1. Bose Wave Music System — serial W100 — No power — $125',
    '2. Bose SoundLink Revolve — serial SN-123 — Will not charge, Cracked grille — $89.00',
    'Visit notes: Dropped once',
    'Estimated due date: 10/16/2026',
  ]) {
    assert.ok(body.includes(fact), `missing "${fact}" in:\n${body}`);
  }
  assert.doesNotMatch(body, /\bRS[- ]?\d/);
});

test('a pickup says so; a desk intake that never asked leaves the line out', () => {
  const single = { ...facts, devices: [facts.devices[0]!], deviceIndex: 0 };
  assert.match(buildRepairTicket({ ...single, customer: { ...facts.customer, shipTo: '' } }).body, /^Ship to: none — customer picks up$/m);
  const desk = buildRepairTicket({ ...single, channel: 'desk', customer: { ...facts.customer, shipTo: null } }).body;
  assert.doesNotMatch(desk, /Ship to:|EVERYTHING DROPPED OFF|Device \d of/);
});

test('formatRepairDueDate is MM/DD/YYYY five business days out', () => {
  // Friday Aug 7 local → +5 business days = Friday Aug 14
  assert.equal(formatRepairDueDate(new Date(2026, 7, 7)), '08/14/2026');
});
