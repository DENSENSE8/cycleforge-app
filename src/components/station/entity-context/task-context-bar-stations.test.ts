import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const ROOT = resolve(process.cwd(), 'src');
const STATION_FILES = [
  'components/receiving/workspace/LineEditPanel.tsx',
  'components/receiving/triage/TriagePanel.tsx',
  'components/tech/TestingPanel.tsx',
];

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

test('receiving stations keep location inline instead of mounting a top context bar', () => {
  for (const relativePath of STATION_FILES) {
    const source = read(relativePath);
    assert.doesNotMatch(
      source,
      /TaskContextBar/,
      `${relativePath} must not mount the retired top task context bar`,
    );
  }

  const row = read('components/receiving/workspace/PoLineRow.tsx');
  assert.match(row, /locationAction/);
  assert.match(row, /staged_location_name/);
});

test('location movement has one shared hook and one shared placement port', () => {
  const hook = read('hooks/useMoveLocation.ts');
  const port = read('components/station/location/station-location-port.ts');
  assert.match(hook, /export function useMoveLocation/);
  assert.match(hook, /resolveLocationScan/);
  assert.match(port, /export interface StationLocationPlacementPort/);
});
