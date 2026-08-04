import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isTestingApiView,
  isTestingSurfacePath,
  resolveLiveReceivingMode,
  stripCrossSurfaceParams,
} from '@/lib/surface-isolation';

test('resolveLiveReceivingMode is path-first for graduated routes', () => {
  const sp = new URLSearchParams('');
  assert.equal(resolveLiveReceivingMode('/receiving/history', sp), 'history');
  assert.equal(resolveLiveReceivingMode('/unbox', sp), 'receive');
  assert.equal(resolveLiveReceivingMode('/triage', sp), 'triage');
  assert.equal(resolveLiveReceivingMode('/incoming', sp), 'incoming');
  assert.equal(resolveLiveReceivingMode('/pickup', sp), 'pickup');
});

test('resolveLiveReceivingMode: /incoming?lane=docked → history', () => {
  assert.equal(
    resolveLiveReceivingMode('/incoming', new URLSearchParams('lane=docked')),
    'history',
  );
  assert.equal(
    resolveLiveReceivingMode('/incoming', new URLSearchParams('lane=pipeline')),
    'incoming',
  );
});

test('resolveLiveReceivingMode falls back to ?mode= on legacy /receiving', () => {
  assert.equal(
    resolveLiveReceivingMode('/receiving', new URLSearchParams('mode=history')),
    'history',
  );
});

test('isTestingApiView recognises testing feeds only', () => {
  assert.equal(isTestingApiView('testing'), true);
  assert.equal(isTestingApiView('needs-test'), true);
  assert.equal(isTestingApiView('recent'), false);
});

// The receiving direction moved to the route-param specs — a graduated surface
// drops `view`/`testTab` because it never declared them, not because this
// function lists them. Asserted at its new owner, in routing/route-params.test.ts.
test('stripCrossSurfaceParams no longer strips on receiving paths', () => {
  const params = new URLSearchParams('view=testing&testTab=returns&recvId=1');
  const next = stripCrossSurfaceParams('/unbox', params);
  assert.equal(next.toString(), params.toString());
});

test('stripCrossSurfaceParams removes receiving mode on testing paths', () => {
  const params = new URLSearchParams('view=testing&mode=triage&unboxview=queue');
  const next = stripCrossSurfaceParams('/test', params);
  assert.equal(next.get('view'), 'testing');
  assert.equal(next.get('mode'), null);
  assert.equal(next.get('unboxview'), null);
});

test('isTestingSurfacePath matches /test and legacy /tech', () => {
  assert.equal(isTestingSurfacePath('/test'), true);
  assert.equal(isTestingSurfacePath('/tech'), true);
  assert.equal(isTestingSurfacePath('/unbox'), false);
});
