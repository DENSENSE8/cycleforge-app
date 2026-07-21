import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ELEVATION_CLASS,
  elevationClass,
  shadows,
  type ElevationRole,
} from './shadows';

describe('shadows SoT', () => {
  it('exports raw box-shadow token strings', () => {
    assert.equal(shadows.none, 'none');
    assert.match(shadows.lg, /^0 /);
    assert.match(shadows.glassOverlay, /^0 /);
  });

  it('role ladder is flat < raised < overlay; raised has soft/default', () => {
    const roles: ElevationRole[] = ['flat', 'raised', 'overlay'];
    assert.deepEqual(roles, ['flat', 'raised', 'overlay']);

    assert.equal(elevationClass('flat'), '');
    assert.equal(elevationClass('raised', 'soft'), ELEVATION_CLASS.raised.soft);
    assert.equal(elevationClass('raised'), ELEVATION_CLASS.raised.default);
    assert.equal(elevationClass('raised', 'default'), ELEVATION_CLASS.raised.default);
    assert.equal(elevationClass('overlay'), ELEVATION_CLASS.overlay);

    assert.match(ELEVATION_CLASS.raised.soft, /^shadow-sm /);
    assert.match(ELEVATION_CLASS.raised.soft, /scrim\/5$/);
    assert.match(ELEVATION_CLASS.raised.default, /^shadow-lg /);
    assert.match(ELEVATION_CLASS.raised.default, /scrim\/10$/);
    assert.match(ELEVATION_CLASS.overlay, /^shadow-xl /);
    assert.match(ELEVATION_CLASS.overlay, /scrim\/20$/);
  });
});
