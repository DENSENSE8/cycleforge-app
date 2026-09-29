import assert from 'node:assert/strict';
import test from 'node:test';
import { clampMagneticOffset, magneticActionEnabled } from './MagneticActionField';

test('magnetic displacement is capped symmetrically', () => {
  assert.equal(clampMagneticOffset(4, 18), 4);
  assert.equal(clampMagneticOffset(40, 18), 18);
  assert.equal(clampMagneticOffset(-40, 18), -18);
});

test('magnetic behavior requires an enabled fine pointer without reduced motion', () => {
  assert.equal(magneticActionEnabled({ finePointer: true, reducedMotion: false, disabled: false }), true);
  assert.equal(magneticActionEnabled({ finePointer: false, reducedMotion: false, disabled: false }), false);
  assert.equal(magneticActionEnabled({ finePointer: true, reducedMotion: true, disabled: false }), false);
  assert.equal(magneticActionEnabled({ finePointer: true, reducedMotion: false, disabled: true }), false);
});
