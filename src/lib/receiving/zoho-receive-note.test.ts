import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildZohoReceiveNoteLine, zohoReceiveStaffName } from './zoho-receive-note';

describe('zohoReceiveStaffName', () => {
  it('uses the database name when present', () => {
    assert.equal(zohoReceiveStaffName('Kai', 7), 'Kai');
  });

  it('never falls back to Staff #N', () => {
    assert.equal(zohoReceiveStaffName('', 7), 'Kai');
    assert.equal(zohoReceiveStaffName(null, 7), 'Kai');
    assert.ok(!zohoReceiveStaffName('', 99).includes('Staff #'));
  });
});

describe('buildZohoReceiveNoteLine', () => {
  it('joins name with scan and unbox PST stamps', () => {
    const line = buildZohoReceiveNoteLine({
      staffName: 'Kai',
      scannedAt: new Date('2026-08-17T18:53:05.437Z'),
      unboxedAt: new Date('2026-08-17T20:06:49.883Z'),
    });
    assert.match(line, /^Kai · scanned /);
    assert.match(line, / · unboxed /);
    assert.ok(!line.includes('Staff #'));
  });
});
