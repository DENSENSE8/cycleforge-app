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

    assert.equal(ELEVATION_CLASS.raised.soft, 'shadow-elev-soft');
    assert.equal(ELEVATION_CLASS.raised.default, 'shadow-elev-raised');
    assert.equal(ELEVATION_CLASS.overlay, 'shadow-elev-overlay');
  });

  it('every role resolves to a single themed shadow-elev-* utility', () => {
    // The ladder must stay one class per role: the `--ds-elev-*` var carries
    // the ambient + key + cast layers, so a `shadow-scrim/NN` color modifier
    // (which rewrites EVERY layer to one alpha) would flatten the stack back
    // into the downward-only shadow this ladder replaced.
    for (const cls of [
      ELEVATION_CLASS.raised.soft,
      ELEVATION_CLASS.raised.default,
      ELEVATION_CLASS.overlay,
    ]) {
      assert.match(cls, /^shadow-elev-(soft|raised|overlay)$/);
      assert.doesNotMatch(cls, /scrim/);
    }
  });
});
