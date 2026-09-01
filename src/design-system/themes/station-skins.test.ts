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
  it('lists every registry name and keeps industrial as the default mill', () => {
    assert.equal(DEFAULT_STATION_SKIN, 'industrial');
    assert.deepEqual(STATION_SKIN_NAMES, Object.keys(STATION_SKINS));
    assert.ok(STATION_SKIN_NAMES.length >= 16);
    assert.equal(STATION_SKINS.industrial.grain, false);
    assert.equal(STATION_SKINS.industrial.group, 'mill');
  });

  it('every skin covers the station var keys and a picker group', () => {
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
  });

  it('character skins stamp data-station-skin; grain is opt-in', () => {
    const css = stationSkinCssText();
    assert.doesNotMatch(css, /url\(.*wood/i);
    for (const name of STATION_SKIN_NAMES) {
      if (name === 'industrial') continue;
      assert.match(css, new RegExp(`html\\[data-station-skin='${name}'\\]`));
      const grainSel = new RegExp(
        `html\\[data-station-skin='${name}'\\] \\.station-scan-grain`,
      );
      if (STATION_SKINS[name].grain) {
        assert.match(css, grainSel, `${name} should paint grain`);
      } else {
        assert.doesNotMatch(css, grainSel, `${name} must not paint grain`);
      }
    }
  });

  it('porcelain highlight is not white-on-white', () => {
    assert.notEqual(STATION_SKINS.porcelain.vars['bevel-highlight'], '#ffffff');
    assert.notEqual(STATION_SKINS.porcelain.vars['bevel-highlight'], '#fff');
    assert.equal(STATION_SKINS.porcelain.grain, false);
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
    assert.equal(skin.vars.well, STATION_SKINS.industrial.vars.well);
    assert.equal(skin.grain, false);
  });

  it('unknown names resolve to industrial', () => {
    assert.equal(resolveStationSkin('leather').name, 'industrial');
    assert.equal(isStationSkinName('matcha'), true);
    assert.equal(isStationSkinName('leather'), false);
  });
});
