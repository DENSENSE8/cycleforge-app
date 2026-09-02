import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { masterNavItemForSession, sessionStationLabel } from './session-page-nav';

describe('masterNavItemForSession', () => {
  it('maps outbound scan type to Shipping when the surface is not Scan out', () => {
    const item = masterNavItemForSession(null, 'outbound');
    assert.equal(item?.id, 'outbound');
    assert.equal(item?.label, 'Shipping');
    assert.notEqual(item?.id, 'scan-out');
  });

  it('maps a scan-out surface to Scan out, not Shipping', () => {
    assert.equal(masterNavItemForSession('scan-out', 'outbound')?.id, 'scan-out');
    assert.equal(sessionStationLabel('scan-out', 'outbound'), 'Scan out');
  });

  it('maps unbox, pack, history, and QC to MasterNav L1', () => {
    assert.equal(masterNavItemForSession('unbox', 'unbox')?.id, 'receive');
    assert.equal(masterNavItemForSession('unbox', 'unbox')?.label, 'Unbox');
    assert.equal(masterNavItemForSession(null, 'pack')?.id, 'packer');
    assert.equal(masterNavItemForSession(null, 'pack')?.label, 'Packing');
    assert.equal(sessionStationLabel('history', null), 'Inbound');
    assert.equal(sessionStationLabel(null, 'test'), 'Quality Control');
  });
});
