import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { failureModeTone } from './useFailureModes';

/** The severity→tone map is what paints the bench's fail chips, so it must be TOTAL over the severity vocabulary and must never quietly… */
describe('failureModeTone', () => {
  it('maps every severity in the vocabulary to a distinct tone', () => {
    assert.equal(failureModeTone('critical'), 'danger');
    assert.equal(failureModeTone('major'), 'warning');
    assert.equal(failureModeTone('minor'), 'muted');
  });

  it('never returns three-of-a-kind — severity has to be legible as colour', () => {
    const tones = new Set(['critical', 'major', 'minor'].map(failureModeTone));
    assert.equal(tones.size, 3);
  });

  it('degrades an unknown severity to the quietest tone, never undefined', () => {
    assert.equal(failureModeTone(''), 'muted');
    assert.equal(failureModeTone('catastrophic'), 'muted');
  });
});
