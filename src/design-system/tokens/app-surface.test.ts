import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_WASH,
  resolveWash,
  WASH_NAMES,
  WASH_PRESETS,
  appChromeBandHairlineClass,
  appChromeClass,
  appChromeMutedClass,
  appCanvasClass,
  appWorkCanvasClass,
  appWorkCanvasEdgeClass,
  appWashClass,
} from './app-surface';

describe('app-surface SoT', () => {
  it('resolveWash defaults unknown names to mint', () => {
    assert.equal(resolveWash(undefined), DEFAULT_WASH);
    assert.equal(resolveWash(null), 'mint');
    assert.equal(resolveWash('nope'), 'mint');
    assert.equal(resolveWash('dawn'), 'dawn');
  });

  it('exports every named wash preset with preview stops', () => {
    for (const name of WASH_NAMES) {
      const preset = WASH_PRESETS[name];
      assert.equal(preset.id, name);
      assert.ok(preset.label.length > 0);
      assert.ok(preset.previewFrom.startsWith('#'));
      assert.ok(preset.previewTo.startsWith('#'));
    }
  });

  it('surface role classes are stable strings for shell hosts', () => {
    assert.equal(appChromeClass, 'bg-surface-card');
    assert.equal(appChromeMutedClass, 'bg-surface-card/95');
    assert.equal(appCanvasClass, 'bg-surface-canvas');
    assert.equal(appWashClass, 'app-wash');
    assert.equal(appWorkCanvasEdgeClass, 'border border-border-soft');
    assert.match(appChromeBandHairlineClass, /--ds-color-border-default/);
    assert.match(appWorkCanvasClass, /rounded-tl-2xl/);
    assert.match(appWorkCanvasClass, /border-border-soft/);
    assert.doesNotMatch(appWorkCanvasClass, /border-border-hairline/);
    assert.doesNotMatch(appWorkCanvasClass, /shadow-sm/);
  });
});
