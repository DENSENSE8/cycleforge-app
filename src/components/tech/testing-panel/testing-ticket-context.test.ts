import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { resolveTestingTicketContextOpen } from './testing-ticket-context';

function row(partial: Partial<ReceivingLineRow> & { id: number }): ReceivingLineRow {
  return {
    id: partial.id,
    quantity_expected: partial.quantity_expected ?? 1,
    serials: partial.serials ?? [],
    ...partial,
  } as ReceivingLineRow;
}

describe('resolveTestingTicketContextOpen', () => {
  it('opens Ticket Displays when a ticket is already linked', () => {
    const r = resolveTestingTicketContextOpen(
      row({ id: 1, serials: [] }),
      true,
    );
    assert.equal(r.open, true);
  });

  it('opens claim create when a unit failed and no ticket', () => {
    const r = resolveTestingTicketContextOpen(
      row({
        id: 2,
        serials: [
          { id: 1, serial_number: 'A', current_status: 'ON_HOLD' },
        ] as ReceivingLineRow['serials'],
      }),
      false,
    );
    assert.equal(r.open, true);
    assert.equal(r.claimMode, 'create');
  });

  it('stays closed for untouched / all-pass with no ticket (panel opens Listing)', () => {
    const untouched = resolveTestingTicketContextOpen(
      row({ id: 3, serials: [] }),
      false,
    );
    assert.equal(untouched.open, false);

    const passed = resolveTestingTicketContextOpen(
      row({
        id: 4,
        serials: [
          { id: 1, serial_number: 'A', current_status: 'TESTED' },
        ] as ReceivingLineRow['serials'],
      }),
      false,
    );
    assert.equal(passed.open, false);
  });
});
