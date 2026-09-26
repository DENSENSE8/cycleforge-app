/** Pins the ONE property that matters about the receive ticker: */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { receivePhaseSteps, SLOW_RECEIVE_MS } from './receive-phase-steps';

describe('receivePhaseSteps', () => {
  it('says only what was asked for', () => {
    const steps = receivePhaseSteps({ intent: 'zoho_receive', elapsedMs: 0 });
    assert.equal(steps.length, 1, 'a single round trip has no observable sub-stages');
  });

  it('names the slowness once it is a real observation', () => {
    const steps = receivePhaseSteps({ intent: 'zoho_receive', elapsedMs: SLOW_RECEIVE_MS });
    assert.equal(steps.length, 2);
    assert.match(steps[1], /longer than usual/i);
  });

  it('the verb follows the intent', () => {
    const scan = receivePhaseSteps({ intent: 'scan_only', elapsedMs: 0 });
    const undo = receivePhaseSteps({ intent: 'unreceive', elapsedMs: 0 });
    assert.match(scan[0], /Scanned/);
    assert.match(undo[0], /Unreceiving/);
    assert.notDeepEqual(scan, undo);
  });

  it('never claims the inventory system is being waited on', () => {
    const steps = [
      ...receivePhaseSteps({ intent: 'zoho_receive', elapsedMs: 0 }),
      ...receivePhaseSteps({ intent: 'zoho_receive', elapsedMs: SLOW_RECEIVE_MS }),
    ];
    assert.ok(
      !steps.some((s) => /inventory system|confirm/i.test(s)),
      'the request no longer waits on an external receive — saying so would be the invented story',
    );
  });

  it('never returns an empty list', () => {
    const bare = receivePhaseSteps({ intent: 'local_receive', elapsedMs: 0 });
    assert.ok(bare.length > 0, 'an empty ticker would blank the panel mid-receive');
  });
});
