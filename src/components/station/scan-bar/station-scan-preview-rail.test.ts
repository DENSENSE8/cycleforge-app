/**
 * Run: node --import tsx --test src/components/station/scan-bar/station-scan-preview-rail.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { composeStationScanBarRightContent } from './station-scan-preview-rail';

test('composeStationScanBarRightContent: Preview with no facets mounts nothing', () => {
  assert.equal(composeStationScanBarRightContent('preview', undefined, 'modes'), undefined);
});

test('composeStationScanBarRightContent: Scan always mounts the mode rail', () => {
  assert.notEqual(composeStationScanBarRightContent('scan', undefined, 'modes'), undefined);
});

test('composeStationScanBarRightContent: Preview with facets mounts the filter slot', () => {
  assert.notEqual(composeStationScanBarRightContent('preview', 'facets', 'modes'), undefined);
});
