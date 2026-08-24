import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetScanDockForTests,
  getActiveScanDockPolicy,
  getScanDockContentVersion,
  registerScanDockPolicy,
  scanDockModes,
  subscribeScanDock,
  subscribeScanDockContent,
  touchScanDockContent,
  type ScanDockHandlers,
  type ScanDockPolicy,
} from './store';

const noop = () => {};

function handlers(over: Partial<ScanDockHandlers> = {}): { current: ScanDockHandlers } {
  return { current: { onSubmit: noop, ...over } };
}

function policy(id: string, over: Partial<ScanDockPolicy> = {}): ScanDockPolicy {
  return { id, handlers: handlers(), ...over };
}

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
    registerScanDockPolicy(policy('tech:testing'));
    registerScanDockPolicy(policy('tech:shipping'));
    assert.equal(getActiveScanDockPolicy()?.id, 'tech:shipping');
  });

  it('unregister falls back to the previous publisher', () => {
    registerScanDockPolicy(policy('tech:testing'));
    const off = registerScanDockPolicy(policy('overlay'));
    off();
    assert.equal(getActiveScanDockPolicy()?.id, 'tech:testing');
  });

  it('re-publishing an id keeps the newer policy when the stale cleanup runs', () => {
    // A surface re-publishes when its STABLE half changes. The effect cleanup
    // for the OLD policy fires after the new one registered; deleting by id
    // there would blank the dock mid-scan.
    const offOld = registerScanDockPolicy(policy('tech:testing', { placeholder: 'old' }));
    registerScanDockPolicy(policy('tech:testing', { placeholder: 'new' }));
    offOld();
    assert.equal(getActiveScanDockPolicy()?.placeholder, 'new');
  });

  it('notifies subscribers on publish and on release', () => {
    let calls = 0;
    const unsub = subscribeScanDock(() => { calls += 1; });
    const off = registerScanDockPolicy(policy('a'));
    assert.equal(calls, 1);
    off();
    assert.equal(calls, 2);
    unsub();
    registerScanDockPolicy(policy('b'));
    assert.equal(calls, 2);
  });

  it('reads the volatile half THROUGH the ref, so a fresh callback needs no re-publish', () => {
    // This is the whole point of the split: the surface swaps its inline arrow
    // on every render, and the dock must see the new one without the store
    // being touched at all.
    const ref = handlers();
    registerScanDockPolicy(policy('unbox', { handlers: ref }));

    const seen: string[] = [];
    ref.current = { onSubmit: (v) => seen.push(`first:${v}`) };
    getActiveScanDockPolicy()?.handlers.current.onSubmit('AAA');
    ref.current = { onSubmit: (v) => seen.push(`second:${v}`) };
    getActiveScanDockPolicy()?.handlers.current.onSubmit('BBB');

    assert.deepEqual(seen, ['first:AAA', 'second:BBB']);
  });

  it('the content channel is separate from the policy channel', () => {
    // A rail repaint must NOT run through registration — a re-push is what
    // lets a background surface steal the dock by merely re-rendering.
    let policyEmits = 0;
    let contentEmits = 0;
    subscribeScanDock(() => { policyEmits += 1; });
    subscribeScanDockContent(() => { contentEmits += 1; });

    registerScanDockPolicy(policy('unbox'));
    assert.equal(policyEmits, 1);
    assert.equal(contentEmits, 0);

    touchScanDockContent();
    touchScanDockContent();
    assert.equal(policyEmits, 1, 'a repaint must not re-order the ownership stack');
    assert.equal(contentEmits, 2);
    assert.equal(getScanDockContentVersion(), 2);
  });

  it('a repaint never changes who owns the dock', () => {
    registerScanDockPolicy(policy('unbox'));
    registerScanDockPolicy(policy('overlay'));
    touchScanDockContent();
    assert.equal(getActiveScanDockPolicy()?.id, 'overlay');
  });

  it('modes default to scan-only and honour a declared list', () => {
    assert.deepEqual(scanDockModes(null), ['scan']);
    assert.deepEqual(scanDockModes(policy('a')), ['scan']);
    assert.deepEqual(scanDockModes(policy('a', { modes: [] })), ['scan']);
    assert.deepEqual(
      scanDockModes(policy('a', { modes: ['scan', 'search', 'input'] })),
      ['scan', 'search', 'input'],
    );
  });
});
