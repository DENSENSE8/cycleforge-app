import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SPECIAL_BIN_BARCODES,
  specialBinBarcodesForOverview,
} from '@/lib/inventory/special-bins';
import { buildBinsOverviewWhere } from '@/lib/neon/location-queries';

describe('specialBinBarcodesForOverview', () => {
  it('includes built-in specials', () => {
    const list = specialBinBarcodesForOverview();
    assert.ok(list.includes('RETURNS-TEST'));
    assert.ok(list.includes('TECH-PARTS'));
    assert.ok(list.includes('UNSORTED'));
    assert.equal(SPECIAL_BIN_BARCODES.length, 3);
  });

  it('folds in a returns override', () => {
    const list = specialBinBarcodesForOverview('RMA-QC');
    assert.ok(list.includes('RMA-QC'));
    assert.ok(list.includes('RETURNS-TEST'));
  });
});

describe('buildBinsOverviewWhere', () => {
  it('requires row+col when no specials', () => {
    const params: unknown[] = [90];
    const { where, specialParamIdx } = buildBinsOverviewWhere({ params });
    assert.equal(specialParamIdx, 0);
    assert.ok(where.some((w) => w.includes('row_label IS NOT NULL')));
    assert.ok(where.some((w) => w.includes('col_label IS NOT NULL')));
    assert.ok(where.some((w) => w.includes("location_kind IN ('SHELF', 'POSITION')")), 'rack shelves/positions are stock places');
  });

  it('allows special barcodes without row/col', () => {
    const params: unknown[] = [90];
    const { where, specialParamIdx } = buildBinsOverviewWhere({
      params,
      specialBarcodes: ['RETURNS-TEST', 'TECH-PARTS'],
      orgId: '00000000-0000-0000-0000-000000000001' as never,
    });
    assert.equal(specialParamIdx, 2);
    assert.ok(where.some((w) => w.includes('barcode = ANY')));
    assert.ok(where.some((w) => w.includes('organization_id')));
    assert.deepEqual(params[1], ['RETURNS-TEST', 'TECH-PARTS']);
  });

  it('filters and searches by the DERIVED room, never the copied text column', () => {
    const params: unknown[] = [90];
    const { where } = buildBinsOverviewWhere({ params, room: ' Zone 1 - New ', q: 'zone' });
    assert.ok(where.includes("COALESCE(room.label, NULLIF(BTRIM(l.room), '')) = $2"), 'room filter reads the derived room');
    assert.ok(where.some((w) => w.includes("COALESCE(room.label, NULLIF(BTRIM(l.room), '')) ILIKE $3")), 'search reads the derived room');
    assert.ok(!where.some((w) => /(?<!BTRIM\()l\.room\b/.test(w)), 'no bare l.room predicate remains');
    assert.deepEqual(params.slice(1), ['Zone 1 - New', '%zone%']);
  });
});
