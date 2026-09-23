/**
 *   node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *     --test src/lib/counter/kiosk-visit-history.test.ts
 *
 * DB-free. Every case below is a pure function the History face depends on for
 * a decision a bug would make silently wrong: which axis a typed search means,
 * whether a page boundary is trustworthy, and — the one worth breaking a build
 * over — which fields a tablet may write onto a SUBMITTED visit.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clampKioskVisitLimit,
  encodeKioskVisitCursor,
  kioskHistoryKey,
  parseKioskHistoryKey,
  parseKioskVisitCursor,
  parseKioskVisitSearch,
  KIOSK_VISIT_PAGE_MAX,
} from './list-kiosk-visits';
import { collectDisallowedEditFields } from './edit-visit';
import { benchActionAsPart, normalizeUnitRepairParts } from './visit-provenance';

describe('search parsing — one box, every axis the counter might mean', () => {
  it('reads a bare phone as digits, capped at the last ten', () => {
    const parsed = parseKioskVisitSearch('(555) 867-5309');
    assert.equal(parsed?.digits, '5558675309');
    assert.equal(parsed?.numeric, null, 'a formatted phone is not a visit id');
  });

  it('keeps only the trailing ten digits of an over-long number', () => {
    assert.equal(parseKioskVisitSearch('1-555-867-5309')?.digits, '5558675309');
  });

  it('reads RS-1042 as repair 1042 and as a ticket probe', () => {
    const parsed = parseKioskVisitSearch('rs-1042');
    assert.equal(parsed?.numeric, 1042);
    assert.equal(parsed?.ticket, 'RS-1042');
  });

  it('reads a bare number as both an id and a last-four probe', () => {
    const parsed = parseKioskVisitSearch('5309');
    assert.equal(parsed?.numeric, 5309);
    assert.equal(parsed?.digits, '5309');
  });

  it('reads a word as a name probe and never as an id', () => {
    const parsed = parseKioskVisitSearch('Jane Doe');
    assert.equal(parsed?.name, 'Jane Doe');
    assert.equal(parsed?.numeric, null);
    assert.equal(parsed?.digits, '');
  });

  it('treats blank input as no search at all', () => {
    assert.equal(parseKioskVisitSearch('   '), null);
    assert.equal(parseKioskVisitSearch(null), null);
  });
});

describe('keyset cursor — a page boundary the counter can trust', () => {
  it('round-trips an instant, a book and an id', () => {
    const cursor = encodeKioskVisitCursor('2026-09-22T18:04:05.000Z', 'repair', 4412);
    assert.deepEqual(parseKioskVisitCursor(cursor), {
      createdAt: '2026-09-22T18:04:05.000Z',
      source: 'repair',
      id: 4412,
    });
  });

  it('refuses a malformed cursor instead of throwing', () => {
    assert.equal(parseKioskVisitCursor('garbage'), null);
    assert.equal(parseKioskVisitCursor('2026-09-22T18:04:05.000Z|visit|0'), null);
    assert.equal(parseKioskVisitCursor('not-a-date|visit|12'), null);
    assert.equal(parseKioskVisitCursor(''), null);
  });

  // The two books number independently: a cursor that forgot which one it was
  // cut from would resume the page in the middle of the wrong record.
  it('refuses a cursor that does not name a book', () => {
    assert.equal(parseKioskVisitCursor('2026-09-22T18:04:05.000Z|4412'), null);
    assert.equal(parseKioskVisitCursor('2026-09-22T18:04:05.000Z|orders|4412'), null);
  });

  it('keys a row by its book, so the two id spaces cannot collide', () => {
    assert.equal(kioskHistoryKey('repair', 19), 'repair:19');
    assert.deepEqual(parseKioskHistoryKey('visit:19'), { source: 'visit', id: 19 });
    assert.equal(parseKioskHistoryKey('19'), null);
    assert.equal(parseKioskHistoryKey('order:19'), null);
  });
});

describe('page size — a tablet never asks for the whole book', () => {
  it('clamps above the ceiling and below one', () => {
    assert.equal(clampKioskVisitLimit(5000), KIOSK_VISIT_PAGE_MAX);
    assert.equal(clampKioskVisitLimit(0), 1);
    assert.equal(clampKioskVisitLimit(-3), 1);
  });

  it('falls back to the default for nonsense', () => {
    assert.equal(clampKioskVisitLimit('abc'), 25);
    assert.equal(clampKioskVisitLimit(undefined), 25);
  });
});

describe('edit allowlist — money and finality are not on this surface', () => {
  it('accepts the three device fields and the three customer fields', () => {
    assert.deepEqual(
      collectDisallowedEditFields({
        staffId: 7,
        pin: '1234',
        customer: { name: 'Jane', phone: '5558675309', email: 'j@example.com' },
        devices: [{ repairId: 12, serialNumber: 'SN-1', issue: 'no sound', notes: 'left ear' }],
      }),
      [],
    );
  });

  it('refuses a price edit by naming it, rather than stripping it', () => {
    assert.deepEqual(
      collectDisallowedEditFields({ staffId: 7, pin: '1234', price: '120.00' }),
      ['price'],
    );
  });

  it('refuses a status or total smuggled onto a device row', () => {
    assert.deepEqual(
      collectDisallowedEditFields({
        staffId: 7,
        pin: '1234',
        devices: [{ repairId: 12, status: 'Done', price: '0' }],
      }),
      ['devices[0].status', 'devices[0].price'],
    );
  });

  it('refuses an unknown customer field', () => {
    assert.deepEqual(
      collectDisallowedEditFields({ staffId: 7, pin: '1234', customer: { creditLimit: 9000 } }),
      ['customer.creditLimit'],
    );
  });
});

describe('parts — read from whichever book recorded them', () => {
  it('normalizes a unit-repair parts_used array', () => {
    assert.deepEqual(
      normalizeUnitRepairParts([
        { sku: 'SPK-11', description: 'Speaker driver', qty: 2, cost: 1899 },
        { sku: 'CBL-3' },
      ]),
      [
        { description: 'Speaker driver', sku: 'SPK-11', quantity: 2, source: 'unit_repair' },
        { description: 'CBL-3', sku: 'CBL-3', quantity: null, source: 'unit_repair' },
      ],
    );
  });

  it('drops jsonb that is not a parts array rather than throwing', () => {
    assert.deepEqual(normalizeUnitRepairParts(null), []);
    assert.deepEqual(normalizeUnitRepairParts({ sku: 'X' }), []);
    assert.deepEqual(normalizeUnitRepairParts(['not-an-object']), []);
  });

  it('turns a bench action into a part only when it names one', () => {
    assert.deepEqual(benchActionAsPart({ part_name: 'Hinge', new_sku: 'HNG-2' }), {
      description: 'Hinge',
      sku: 'HNG-2',
      quantity: null,
      source: 'action',
    });
    assert.equal(benchActionAsPart({ part_name: null, new_sku: null }), null);
  });
});
