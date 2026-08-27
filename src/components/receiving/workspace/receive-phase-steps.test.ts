/**
 * Pins the ONE property that matters about the receive ticker: every string it
 * shows is derived from state the client actually holds.
 *
 * A regression here looks like a passing UI — a smooth multi-step loop that
 * narrates work nobody measured. So the tests assert on what CANNOT appear
 * (a description step when zero descriptions were written) as much as on what
 * does.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { receivePhaseSteps, SLOW_RECEIVE_MS } from './receive-phase-steps';
import type { ReceiveSummary } from './line-edit/hooks/useReceiveAction';

const summary = (over: Partial<ReceiveSummary> = {}): ReceiveSummary => ({
  markedReceived: true,
  descriptionsUpdated: 0,
  notesUpdated: false,
  localOnly: false,
  intent: 'zoho_receive',
  isUnfound: false,
  alreadyReceived: false,
  photoPolicyWaiver: null,
  ...over,
});

describe('receivePhaseSteps', () => {
  it('in flight says only what was asked for', () => {
    const steps = receivePhaseSteps({ phase: 'in_flight', intent: 'zoho_receive', elapsedMs: 0 });
    assert.equal(steps.length, 1, 'a single round trip has no observable sub-stages');
  });

  it('in flight names the slowness once it is a real observation', () => {
    const steps = receivePhaseSteps({
      phase: 'in_flight',
      intent: 'zoho_receive',
      elapsedMs: SLOW_RECEIVE_MS,
    });
    assert.equal(steps.length, 2);
    assert.match(steps[1], /longer than usual/i);
  });

  it('in flight verb follows the intent', () => {
    const scan = receivePhaseSteps({ phase: 'in_flight', intent: 'scan_only', elapsedMs: 0 });
    const undo = receivePhaseSteps({ phase: 'in_flight', intent: 'unreceive', elapsedMs: 0 });
    assert.match(scan[0], /Scanned/);
    assert.match(undo[0], /Unreceiving/);
    assert.notDeepEqual(scan, undo);
  });

  it('reconciling lists only writes the summary actually reported', () => {
    const steps = receivePhaseSteps({ phase: 'reconciling', summary: summary() });
    assert.ok(
      !steps.some((s) => /description/i.test(s)),
      'zero descriptions updated must not produce a description step',
    );
    assert.ok(!steps.some((s) => /notes/i.test(s)));
    assert.match(steps.at(-1)!, /confirm/i);
  });

  it('reconciling pluralises and includes the reported writes', () => {
    const one = receivePhaseSteps({
      phase: 'reconciling',
      summary: summary({ descriptionsUpdated: 1, notesUpdated: true }),
    });
    assert.ok(one.some((s) => s.includes('1 product description')));
    assert.ok(one.some((s) => /purchase order/i.test(s)));

    const many = receivePhaseSteps({
      phase: 'reconciling',
      summary: summary({ descriptionsUpdated: 3 }),
    });
    assert.ok(many.some((s) => s.includes('3 product descriptions')));
  });

  it('never returns an empty list', () => {
    const bare = receivePhaseSteps({
      phase: 'reconciling',
      summary: summary({ markedReceived: false }),
    });
    assert.ok(bare.length > 0, 'an empty ticker would blank the panel mid-receive');
  });
});
