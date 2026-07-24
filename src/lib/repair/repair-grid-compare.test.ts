import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import { compareRepairGridRows } from './repair-grid-compare';

function row(partial: Partial<RSRecord> & { id: number }): RSRecord {
  return {
    created_at: '2026-06-01T12:00:00.000Z',
    updated_at: '2026-06-01T12:00:00.000Z',
    ticket_number: '',
    contact_info: '',
    product_title: '',
    price: '',
    issue: '',
    serial_number: '',
    status: 'Pending Repair',
    source_order_id: null,
    customer_name: null,
    customer_phone: null,
    ...partial,
  } as RSRecord;
}

describe('compareRepairGridRows', () => {
  it('sorts product title A–Z / Z–A', () => {
    const a = row({ id: 1, product_title: 'Alpha Amp' });
    const b = row({ id: 2, product_title: 'Zebra Mixer' });
    assert.ok(compareRepairGridRows(a, b, 'title', 'asc') < 0);
    assert.ok(compareRepairGridRows(a, b, 'title', 'desc') > 0);
  });

  it('sorts customer name, falling back to contact_info segment', () => {
    const a = row({ id: 1, customer_name: 'Aaron Adams' });
    const b = row({ id: 2, contact_info: 'Zoe Zimmer, 555-111-2222' });
    assert.ok(compareRepairGridRows(a, b, 'customer', 'asc') < 0);
    assert.ok(compareRepairGridRows(a, b, 'customer', 'desc') > 0);
  });

  it('sorts price numerically (not lexically)', () => {
    const nine = row({ id: 1, price: '9' });
    const ninety = row({ id: 2, price: '$90.00' });
    assert.ok(compareRepairGridRows(nine, ninety, 'price', 'asc') < 0);
    assert.ok(compareRepairGridRows(nine, ninety, 'price', 'desc') > 0);
  });

  it('puts walk-in (no source order) last in both directions', () => {
    const linked = row({ id: 1, source_order_id: '123456' });
    const walkIn = row({ id: 2, source_order_id: null });
    assert.ok(compareRepairGridRows(linked, walkIn, 'order', 'asc') < 0);
    assert.ok(compareRepairGridRows(linked, walkIn, 'order', 'desc') < 0);
  });

  it('puts a missing ticket last in both directions', () => {
    const filled = row({ id: 1, ticket_number: 'RS-0001' });
    const empty = row({ id: 2, ticket_number: '' });
    assert.ok(compareRepairGridRows(filled, empty, 'ticket', 'asc') < 0);
    assert.ok(compareRepairGridRows(filled, empty, 'ticket', 'desc') < 0);
  });

  it('sorts by created date (asc = oldest first, desc = newest first)', () => {
    const older = row({ id: 1, created_at: '2026-06-01T12:00:00.000Z' });
    const newer = row({ id: 2, created_at: '2026-07-01T12:00:00.000Z' });
    assert.ok(compareRepairGridRows(older, newer, 'date', 'asc') < 0);
    assert.ok(compareRepairGridRows(older, newer, 'date', 'desc') > 0);
  });

  it('tiebreaks on id (stable order)', () => {
    const a = row({ id: 1, product_title: 'Same' });
    const b = row({ id: 2, product_title: 'Same' });
    assert.ok(compareRepairGridRows(a, b, 'title', 'asc') < 0);
    assert.ok(compareRepairGridRows(b, a, 'title', 'asc') > 0);
  });
});
