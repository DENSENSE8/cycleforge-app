/**
 * An arriving artifact TAKES the right pane.
 *
 * `SessionSurface`'s contract says it in prose — "the board is the RESTING
 * occupant; `render_artifact` pushes it aside" — and law 11 of the session
 * cohort repeats it. Nothing implemented it: the occupant store rested on
 * `board` and only ⌘B ever moved it, so a model that rendered a report painted
 * it into a pane the operator was not looking at. The report existed, was
 * valid, and was invisible.
 *
 * These tests drive the REAL arrival path — the `SESSION_ARTIFACT_EVENT` /
 * `SESSION_ARTIFACT_PENDING_EVENT` listeners `ensureSessionArtifactListener`
 * installs — over an EventTarget window stub, and assert the pane occupant that
 * `SessionSurface` switches on.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { SESSION_ARTIFACT_EVENT, SESSION_ARTIFACT_PENDING_EVENT } from '@/lib/app-events';
import { ensureSessionArtifactListener } from './useSessionArtifacts';
import { getSessionPanelOccupant, setSessionPanelOccupant } from './session-panel-occupant';

// `useSessionArtifacts` touches `window` only inside
// `ensureSessionArtifactListener`, so the stub has to exist by the time that
// runs — not at import time.
const windowStub = new EventTarget();
const prev = globalThis.window;
// @ts-expect-error test stub: only addEventListener/dispatchEvent are used
globalThis.window = windowStub;

ensureSessionArtifactListener();
const report = {
  kind: 'report',
  title: 'Packing performance',
  question: 'What is the pack floor doing today?',
  asOf: 'Sep 7, 2026, 9:00 AM PT',
  scope: 'Pack floor · today (PT)',
  headline: { value: '52', unit: 'boxes', label: 'Boxes packed' },
  kpis: [],
  sections: [],
  standards: [],
  notes: [],
  followUps: [],
};

test.after(() => {
  // @ts-expect-error restore
  globalThis.window = prev;
});

test('a valid arriving artifact promotes the pane to the artifact plane', () => {
  setSessionPanelOccupant('board');
  windowStub.dispatchEvent(new CustomEvent(SESSION_ARTIFACT_EVENT, { detail: report }));
  assert.equal(getSessionPanelOccupant(), 'artifact');
});

test('an announced-but-unfinished artifact promotes too, so the pane is never blank mid-turn', () => {
  setSessionPanelOccupant('board');
  windowStub.dispatchEvent(new CustomEvent(SESSION_ARTIFACT_PENDING_EVENT, { detail: { pending: true } }));
  assert.equal(getSessionPanelOccupant(), 'artifact');
});

test('releasing a pending slot does not yank the pane away from the operator', () => {
  setSessionPanelOccupant('board');
  windowStub.dispatchEvent(new CustomEvent(SESSION_ARTIFACT_PENDING_EVENT, { detail: { pending: false } }));
  assert.equal(getSessionPanelOccupant(), 'board');
});

test('a REJECTED payload still takes the pane — the operator must see why it was refused', () => {
  setSessionPanelOccupant('board');
  windowStub.dispatchEvent(new CustomEvent(SESSION_ARTIFACT_EVENT, { detail: { kind: 'report' } }));
  assert.equal(getSessionPanelOccupant(), 'artifact');
});
