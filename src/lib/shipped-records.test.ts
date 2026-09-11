import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isShippedDeskRow } from '@/lib/shipped-records';

describe('isShippedDeskRow', () => {
  it('keeps a row with scan-out staff and timestamp', () => {
    assert.equal(
      isShippedDeskRow({
        ship_confirmed_at: '2026-09-09 10:11:12',
        shipped_out_by: 1,
      }),
      true,
    );
  });

  it('rejects IN STAGING — packed but never scanned out', () => {
    assert.equal(
      isShippedDeskRow({
        ship_confirmed_at: null,
        shipped_out_by: null,
      }),
      false,
    );
  });

  it('rejects a timestamp without a staff id', () => {
    assert.equal(
      isShippedDeskRow({
        ship_confirmed_at: '2026-09-09 10:11:12',
        shipped_out_by: null,
      }),
      false,
    );
  });

  it('rejects the sentinel timestamp "1"', () => {
    assert.equal(
      isShippedDeskRow({
        ship_confirmed_at: '1',
        shipped_out_by: 1,
      }),
      false,
    );
  });
});
