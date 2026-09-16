import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { resolveUnboxTicketContextOpen } from './unbox-ticket-context';

function row(partial: Partial<ReceivingLineRow> & { id: number }): ReceivingLineRow {
  return {
    id: partial.id,
    quantity_expected: partial.quantity_expected ?? 1,
    serials: partial.serials ?? [],
    ...partial,
  } as ReceivingLineRow;
}

describe('resolveUnboxTicketContextOpen', () => {
  it('opens Ticket Chat when a ticket is already linked', () => {
    const r = resolveUnboxTicketContextOpen(
      row({ id: 1, receiving_source: 'zoho_po', zoho_purchaseorder_id: 'PO-1' }),
      true,
    );
    assert.equal(r.open, true);
    assert.equal(r.ticketAction, 'chat');
  });

  it('opens Ticket claim Link for an unfound carton', () => {
    const r = resolveUnboxTicketContextOpen(
      row({ id: 2, receiving_source: 'unmatched', tracking_number: '1Z999' }),
      false,
    );
    assert.equal(r.open, true);
    assert.equal(r.claimMode, 'link');
    assert.equal(r.ticketAction, 'claim');
  });

  it('stays closed for a matched PO carton with no ticket', () => {
    const r = resolveUnboxTicketContextOpen(
      row({
        id: 3,
        receiving_source: 'zoho_po',
        zoho_purchaseorder_id: 'ZOHO-PO-99',
        carton_intake_type: 'PO',
      }),
      false,
    );
    assert.equal(r.open, false);
  });
});
