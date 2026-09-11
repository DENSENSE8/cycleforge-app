import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SCAN_OUT_DESK_MAX_BACKDATE_MS,
  SCAN_OUT_DESK_SOURCE,
  SCAN_OUT_DOCK_MAX_BACKDATE_MS,
  isScanOutCreatedAtInWindow,
  parseScanOutStaffId,
  scanOutMaxBackdateMs,
} from './scan-out-desk-stamp';

describe('scan-out desk stamp', () => {
  it('widens the backdate window only for desk-selection', () => {
    assert.equal(scanOutMaxBackdateMs(undefined), SCAN_OUT_DOCK_MAX_BACKDATE_MS);
    assert.equal(scanOutMaxBackdateMs('gun'), SCAN_OUT_DOCK_MAX_BACKDATE_MS);
    assert.equal(scanOutMaxBackdateMs(SCAN_OUT_DESK_SOURCE), SCAN_OUT_DESK_MAX_BACKDATE_MS);
  });

  it('accepts a stamp inside the desk window and rejects one past it', () => {
    const now = Date.parse('2026-09-11T17:00:00.000Z');
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const fourMonthsAgo = new Date(now - 120 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(
      isScanOutCreatedAtInWindow(weekAgo, now, SCAN_OUT_DESK_MAX_BACKDATE_MS),
      true,
    );
    assert.equal(
      isScanOutCreatedAtInWindow(weekAgo, now, SCAN_OUT_DOCK_MAX_BACKDATE_MS),
      false,
    );
    assert.equal(
      isScanOutCreatedAtInWindow(fourMonthsAgo, now, SCAN_OUT_DESK_MAX_BACKDATE_MS),
      false,
    );
  });

  it('parses a positive staff id and drops junk', () => {
    assert.equal(parseScanOutStaffId(12), 12);
    assert.equal(parseScanOutStaffId('12'), 12);
    assert.equal(parseScanOutStaffId(0), null);
    assert.equal(parseScanOutStaffId(-1), null);
    assert.equal(parseScanOutStaffId('x'), null);
  });
});
