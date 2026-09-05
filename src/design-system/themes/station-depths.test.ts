import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_STATION_DEPTH,
  STATION_DEPTH_NAMES,
  STATION_DEPTHS,
  isStationDepthName,
  resolveStationDepth,
  stationDepthCssText,
} from './station-depths';

describe('station-depths catalog', () => {
  it('lists flat · mill · deep and keeps mill as the default', () => {
    assert.equal(DEFAULT_STATION_DEPTH, 'mill');
    assert.deepEqual(STATION_DEPTH_NAMES, ['flat', 'mill', 'deep']);
    assert.equal(STATION_DEPTHS.mill.bevelWidth, '2px');
    assert.equal(STATION_DEPTHS.mill.grain, false);
    assert.equal(STATION_DEPTHS.flat.bevelWidth, '0px');
    assert.equal(STATION_DEPTHS.deep.bevelWidth, '4px');
    assert.equal(STATION_DEPTHS.deep.grain, true);
  });

  it('CSS uses mill as :root and stamps only non-mill depths', () => {
    const css = stationDepthCssText();
    assert.match(css, /:root \{[\s\S]*--ds-station-bevel-width: 2px/);
    assert.doesNotMatch(css, /html\[data-station-depth='mill'\]/);
    assert.match(css, /html\[data-station-depth='flat'\]/);
    assert.match(css, /html\[data-station-depth='deep'\]/);
    assert.match(css, /html\[data-station-depth='deep'\] \.station-scan-grain/);
    assert.doesNotMatch(css, /data-station-skin/);
  });

  it('unknown names resolve to mill', () => {
    assert.equal(resolveStationDepth('recessed').name, 'mill');
    assert.equal(isStationDepthName('deep'), true);
    assert.equal(isStationDepthName('recessed'), false);
  });
});
