/**
 * Tripwire — every Displays Action-plane host must keep Look reachable.
 *
 *   node --import tsx --test src/components/station/displays/look-display-hosts.test.ts
 *
 * Pack / Testing / Shipping used to bounce unknown ids (including `look`) to
 * the Root Index. Idle Scan-out had no Displays host at all, so the composer
 * ring opened nothing. This file asserts the bounce is gone and every mount
 * of StationDisplaysPushStack can resolve a Displays-hosted leaf.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd());

const DISPLAYS_HOSTS = [
  'src/components/receiving/workspace/LineEditPanel.tsx',
  'src/components/receiving/triage/TriagePanel.tsx',
  'src/components/packer/PackOrderPanel.tsx',
  'src/components/tech/TestingPanel.tsx',
  'src/components/tech/ActiveOrderWorkspace.tsx',
  'src/components/outbound/scan-out/ScanOutActivePanel.tsx',
  'src/components/outbound/scan-out/ScanOutIdleAwait.tsx',
  'src/features/review/packer/PackerReviewMode.tsx',
  'src/components/station/entity/EntityStationPane.tsx',
] as const;

const BOUNCE =
  /displayTabs\.some\(\(\s*t\s*\)\s*=>\s*t\.id\s*===\s*activeSideTab\)/;

function read(rel: string): string {
  const abs = join(ROOT, rel);
  assert.ok(existsSync(abs), `missing Displays host: ${rel}`);
  return readFileSync(abs, 'utf8');
}

test('Displays hosts resolve Look instead of bouncing unknown ids to tabs[0]/index', () => {
  for (const rel of DISPLAYS_HOSTS) {
    const src = read(rel);
    assert.match(
      src,
      /StationDisplaysPushStack/,
      `${rel} must mount StationDisplaysPushStack`,
    );
    assert.doesNotMatch(src, BOUNCE, `${rel} still bounces unknown Displays ids`);
    assert.match(
      src,
      /resolveDisplaysActiveTab|isDisplaysHostedLeaf/,
      `${rel} must keep Look via resolveDisplaysActiveTab or isDisplaysHostedLeaf`,
    );
  }
});

test('idle Scan-out listens for the composer ring and mounts Displays', () => {
  const src = read('src/components/outbound/scan-out/ScanOutIdleAwait.tsx');
  assert.match(src, /SCAN_OUT_OPEN_DISPLAYS_EVENT/);
  assert.match(src, /StationDisplaysPushStack/);
  assert.match(src, /listenDisplays/);
});
