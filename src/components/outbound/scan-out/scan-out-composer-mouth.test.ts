/**
 * Tripwire: scan-out mouth must be StationComposerHost with faces off and
 * context ring on — never a raw OmnichannelComposerDock fork / deleted mode row.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DOCK = path.join(HERE, 'ScanOutComposerDock.tsx');

test('ScanOutComposerDock mounts StationComposerHost with faces off, row on', () => {
  const src = readFileSync(DOCK, 'utf8');
  assert.match(src, /StationComposerHost/);
  assert.match(src, /showModeRow/);
  assert.match(src, /showModeFaces=\{false\}/);
  assert.doesNotMatch(src, /showModeRow=\{false\}/);
  assert.doesNotMatch(src, /<OmnichannelComposerDock\b/);
  assert.match(src, /onProgressClick/);
  assert.match(src, /dispatchScanOutOpenDisplays/);
});
