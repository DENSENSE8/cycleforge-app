/**
 * Pins the feedback tone contract.
 *
 * FOUR STATES, plus `context` for a hinged accessory with no verdict.
 * The map's completeness is the thing worth asserting — a nameless fifth
 * state used to force a className fill on Button.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUTTON_VARIANTS } from '@/design-system/primitives/button-variants';
import {
  INLINE_ACTION_FEEDBACK_TONE,
  toneFromVerdictHue,
  type InlineActionFeedbackTone,
} from './inline-action-feedback-tone';

const TONES: InlineActionFeedbackTone[] = [
  'loading',
  'success',
  'warning',
  'error',
  'context',
];

describe('inline feedback tone machine', () => {
  it('carries every named state', () => {
    assert.deepEqual(Object.keys(INLINE_ACTION_FEEDBACK_TONE).sort(), [...TONES].sort());
  });

  it('every state paints a surface and names a CTA intent', () => {
    for (const tone of TONES) {
      const p = INLINE_ACTION_FEEDBACK_TONE[tone];
      for (const key of ['border', 'bg', 'bar', 'title', 'icon', 'body', 'meta'] as const) {
        assert.ok(p[key].length > 0, `${tone}.${key} is empty`);
      }
      assert.ok(
        p.cta in BUTTON_VARIANTS,
        `${tone}.cta "${p.cta}" is not a Button variant — a call site would have to override the fill by hand`,
      );
    }
  });

  it('each state is visually distinct from the others', () => {
    const backgrounds = TONES.map((t) => INLINE_ACTION_FEEDBACK_TONE[t].bg);
    assert.equal(new Set(backgrounds).size, TONES.length, 'two states share a background tint');
  });

  it('loading offers no colored commit', () => {
    assert.equal(INLINE_ACTION_FEEDBACK_TONE.loading.cta, 'secondary');
  });

  it('context offers no colored commit', () => {
    assert.equal(INLINE_ACTION_FEEDBACK_TONE.context.cta, 'secondary');
  });

  it('maps the verdict SoT hues onto the vocabulary', () => {
    assert.equal(toneFromVerdictHue('emerald'), 'success');
    assert.equal(toneFromVerdictHue('amber'), 'warning');
    assert.equal(toneFromVerdictHue('rose'), 'error');
  });
});
