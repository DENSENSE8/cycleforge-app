import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetScanDockForTests,
  getActiveScanDockPolicy,
  registerScanDockPolicy,
  subscribeScanDock,
} from './store';

const noop = () => {};

describe('scan-dock store', () => {
  beforeEach(() => {
    __resetScanDockForTests();
  });

  it('is empty until a surface publishes', () => {
    // The dock renders nothing on an unmigrated page — mounting it must be
    // inert, or every surface would have to migrate in one change.
    assert.equal(getActiveScanDockPolicy(), null);
  });

  it('the most recent publisher owns the dock', () => {
    registerScanDockPolicy({ id: 'tech:testing', onSubmit: noop });
    registerScanDockPolicy({ id: 'tech:shipping', onSubmit: noop });
    assert.equal(getActiveScanDockPolicy()?.id, 'tech:shipping');
  });

  it('unregister falls back to the previous publisher', () => {
    registerScanDockPolicy({ id: 'tech:testing', onSubmit: noop });
    const off = registerScanDockPolicy({ id: 'overlay', onSubmit: noop });
    off();
    assert.equal(getActiveScanDockPolicy()?.id, 'tech:testing');
  });

  it('re-publishing an id keeps the newer policy when the stale cleanup runs', () => {
    // A surface re-publishes on every armed-mode change. The effect cleanup for
    // the OLD policy fires after the new one registered; deleting by id there
    // would blank the dock mid-scan.
    const offOld = registerScanDockPolicy({ id: 'tech:testing', placeholder: 'old', onSubmit: noop });
    registerScanDockPolicy({ id: 'tech:testing', placeholder: 'new', onSubmit: noop });
    offOld();
    assert.equal(getActiveScanDockPolicy()?.placeholder, 'new');
  });

  it('notifies subscribers on publish and on release', () => {
    let calls = 0;
    const unsub = subscribeScanDock(() => { calls += 1; });
    const off = registerScanDockPolicy({ id: 'a', onSubmit: noop });
    assert.equal(calls, 1);
    off();
    assert.equal(calls, 2);
    unsub();
    registerScanDockPolicy({ id: 'b', onSubmit: noop });
    assert.equal(calls, 2);
  });
});
