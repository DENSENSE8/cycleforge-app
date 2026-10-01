import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_STATION_SKIN,
  STATION_SKIN_GROUP_ORDER,
  STATION_SKIN_NAMES,
  STATION_SKIN_VAR_KEYS,
  STATION_SKINS,
  isStationSkinName,
  resolveStationSkin,
  stationSkinCssText,
} from './station-skins';

describe('station-skins catalog', () => {
  it('lists every registry name and keeps porcelain as the readable default', () => {
    assert.equal(DEFAULT_STATION_SKIN, 'porcelain');
    assert.deepEqual(STATION_SKIN_NAMES, Object.keys(STATION_SKINS));
    assert.ok(STATION_SKIN_NAMES.length >= 15);
    assert.equal(STATION_SKINS.porcelain.group, 'material');
  });

  it('every skin covers the station var keys including ink and a picker group', () => {
    for (const name of STATION_SKIN_NAMES) {
      const skin = STATION_SKINS[name];
      assert.equal(skin.name, name);
      assert.ok(STATION_SKIN_GROUP_ORDER.includes(skin.group), name);
      for (const key of STATION_SKIN_VAR_KEYS) {
        assert.ok(skin.vars[key], `${name} missing --ds-station-${key}`);
      }
      assert.ok(skin.preview.header);
      assert.ok(skin.preview.well);
      assert.ok(skin.preview.plate);
      assert.ok(skin.preview.slot);
    }
    assert.ok(STATION_SKIN_VAR_KEYS.includes('ink'));
    assert.ok(STATION_SKIN_VAR_KEYS.includes('ink-muted'));
  });

  it('character skins stamp data-station-skin; Displays scope remaps canvas + ink', () => {
    const css = stationSkinCssText();
    assert.doesNotMatch(css, /url\(.*wood/i);
    assert.doesNotMatch(css, /\.station-scan-grain/);
    assert.match(css, /\[data-station-displays\]/);
    assert.match(css, /--ds-station-ink/);
    assert.match(css, /--ds-color-background-canvas:\s*var\(--ds-station-well\)/);
    assert.match(css, /--ds-color-text-soft:\s*var\(--ds-station-ink-muted\)/);
    for (const name of STATION_SKIN_NAMES) {
      if (name === DEFAULT_STATION_SKIN) continue;
      assert.match(css, new RegExp(`html\\[data-station-skin='${name}'\\]`));
    }
  });

  it('porcelain highlight is not white-on-white and carries dark ink', () => {
    assert.notEqual(STATION_SKINS.porcelain.vars['bevel-highlight'], '#ffffff');
    assert.notEqual(STATION_SKINS.porcelain.vars['bevel-highlight'], '#fff');
    assert.match(STATION_SKINS.porcelain.vars.ink, /#1a1714/i);
  });

  it('high-vis keeps the mouth calm and the plate loud', () => {
    assert.equal(STATION_SKINS['high-vis'].vars.bar, STATION_SKINS['high-vis'].vars.well);
    assert.notEqual(STATION_SKINS['high-vis'].vars.plate, STATION_SKINS['high-vis'].vars.well);
    assert.match(STATION_SKINS['high-vis'].vars.plate, /#d4c20a/i);
  });

  it('house color tints the plate from operator accent, not the bevels', () => {
    const skin = STATION_SKINS['house-color'];
    assert.match(skin.vars.plate, /--ds-color-accent-bg/);
    assert.doesNotMatch(skin.vars['bevel-shadow'], /accent/);
    assert.doesNotMatch(skin.vars['bevel-highlight'], /accent/);
    assert.equal(skin.vars.well, STATION_SKINS.porcelain.vars.well);
    assert.equal(skin.vars.ink, STATION_SKINS.porcelain.vars.ink);
  });

  it('coal ink is light for dark plates', () => {
    assert.match(STATION_SKINS.coal.vars.ink, /#f4efe8/i);
  });

  it('unknown names resolve to porcelain', () => {
    assert.equal(resolveStationSkin('leather').name, 'porcelain');
    assert.equal(isStationSkinName('matcha'), true);
    assert.equal(isStationSkinName('leather'), false);
  });
});
