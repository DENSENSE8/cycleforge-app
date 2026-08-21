/**
 * Pins the tester catalogue against its resolver.
 *
 * The failure this catches is a dead button: a scenario listed in
 * `RECEIVE_FEEDBACK_SCENARIOS` with no arm in `receiveFeedbackState`'s switch
 * resolves to `{null, null}`, the panel unmounts, and the tester looks like it
 * simply did nothing. There is no runtime error to notice — which is exactly
 * why the list and the switch have to be checked against each other.
 *
 * The diagnostic scenarios are also run through the real verdict SoT, so a
 * fixture body that stops classifying the way its label claims (say `cooldown`
 * silently becoming a generic error) fails here rather than quietly teaching
 * whoever is refining the panel the wrong colour.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RECEIVE_FEEDBACK_SCENARIOS,
  receiveFeedbackState,
} from './receive-feedback-scenarios';
import { classifyReceiveResponse } from './classify-receive-response';
import { toneFromVerdictHue } from './inline-action-feedback-tone';

const NOW = 1_755_000_000_000;

describe('receive feedback tester scenarios', () => {
  it('every catalogued scenario resolves to a state', () => {
    for (const s of RECEIVE_FEEDBACK_SCENARIOS) {
      const state = receiveFeedbackState(s.id, NOW);
      assert.ok(
        state.receiving || state.receiveResult,
        `"${s.id}" resolves to nothing — the tester button would be dead`,
      );
    }
  });

  it('scenario ids are unique', () => {
    const ids = RECEIVE_FEEDBACK_SCENARIOS.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('an unknown id resolves to no state rather than throwing', () => {
    const state = receiveFeedbackState('not-a-scenario', NOW);
    assert.equal(state.receiving, null);
    assert.equal(state.receiveResult, null);
  });

  it('diagnostic fixtures classify to the tone their label promises', () => {
    for (const s of RECEIVE_FEEDBACK_SCENARIOS) {
      const { receiveResult } = receiveFeedbackState(s.id, NOW);
      if (receiveResult?.kind !== 'diagnostic') continue;
      const tone = toneFromVerdictHue(classifyReceiveResponse(receiveResult.response).tone);
      assert.equal(tone, s.expect, `"${s.id}" is labelled ${s.expect} but classifies as ${tone}`);
    }
  });

  it('the two unreachable verdicts come in through demoStatus, and only those', () => {
    const demos = RECEIVE_FEEDBACK_SCENARIOS.flatMap((s) => {
      const { receiveResult } = receiveFeedbackState(s.id, NOW);
      return receiveResult?.kind === 'success' && receiveResult.demoStatus
        ? [[s.id, receiveResult.demoStatus] as const]
        : [];
    });
    assert.deepEqual(
      demos,
      [
        ['reconciling', 'pending'],
        ['confirmed', 'confirmed'],
        ['sync_failed', 'failed'],
      ],
      'demoStatus is a tester-only escape hatch — a new user of it needs a reason',
    );
  });

  it('stamps `at` from the caller so each activation remounts the panel', () => {
    const a = receiveFeedbackState('complete', NOW);
    const b = receiveFeedbackState('complete', NOW + 1);
    assert.notEqual(
      (a.receiveResult as { at: number }).at,
      (b.receiveResult as { at: number }).at,
      're-picking a scenario must produce a new key, or the peel never replays',
    );
  });

  it('the slow in-flight fixture is genuinely past the threshold', () => {
    const state = receiveFeedbackState('in_flight_slow', NOW);
    assert.ok(state.receiving);
    assert.ok(NOW - state.receiving.startedAt >= 6_000);
  });
});
