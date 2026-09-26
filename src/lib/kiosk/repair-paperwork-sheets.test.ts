/**
 * The walk-in's paperwork as behaviour: one agreement per unit on the counter,
 * each stating THAT unit's serials and issue, none for a linked repair.
 *
 * Run: npx tsx --test src/lib/kiosk/repair-paperwork-sheets.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import type { KioskCartLine, RepairPayload } from './cart-line';
import { repairDevicesFromLines } from './repair-devices';
import { repairPaperworkSheets } from './repair-paperwork-sheets';

function repairLine(id: string, payload: Partial<RepairPayload>): KioskCartLine {
  return {
    id,
    type: 'REPAIR',
    title: 'Wave Music System',
    quantity: 1,
    unitAmountCents: 16800,
    payload: { productModel: 'Wave Music System', serialNumber: '', price: '168.00', ...payload },
  };
}

test('one sheet per unit, each with its own serials and issue; a linked repair has none', () => {
  const lines = [
    repairLine('a', { serialNumber: 'W100', repairReasons: ['No power'] }),
    repairLine('b', { serialNumber: 'W200, CD300', repairReasons: ['CD skips', 'Display dim'] }),
    repairLine('linked', { serialNumber: 'OLD1', linkedRepairId: 41, linkedTicketNumber: 'RS-41' }),
  ];

  const sheets = repairPaperworkSheets({
    customer: { name: 'Ada Lovelace', phone: '5551234567', email: '' },
    visitNotes: 'Customer waiting',
    devices: repairDevicesFromLines(lines),
    ticketNumber: 812,
  });

  assert.deepEqual(
    sheets.map((s) => s.lineId),
    ['a', 'b'],
  );
  assert.equal(sheets[0]!.props.serialNumber, 'W100');
  assert.equal(sheets[0]!.props.issue, 'No power');
  assert.equal(sheets[1]!.props.serialNumber, 'W200, CD300');
  assert.equal(sheets[1]!.props.issue, 'CD skips, Display dim');
  // Visit facts are shared by every sheet.
  for (const sheet of sheets) {
    assert.equal(sheet.props.name, 'Ada Lovelace');
    assert.equal(sheet.props.contact, '555-123-4567');
    assert.equal(sheet.props.ticketNumber, 812);
  }
});

test('a unit with no reasons states the visit notes; a unit with no serial states a dash', () => {
  const [sheet] = repairPaperworkSheets({
    customer: { name: '', phone: '', email: '' },
    visitNotes: 'Rattles when moved',
    devices: repairDevicesFromLines([repairLine('a', { serialNumber: ' , ' })]),
    ticketNumber: '',
  });
  assert.equal(sheet!.props.issue, 'Rattles when moved');
  assert.equal(sheet!.props.serialNumber, '—');
});
