/**
 * Floor-mouth cohort tripwire.
 *
 * Quality Control, Unbox/Triage, Picker, and Scan Out must all reach the same
 * StationComposerHost. A raw OmnichannelComposerDock is only the outline and
 * silently drops the below-outline context ring.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (file: string) => readFileSync(path.join(HERE, file), 'utf8');

test('Picker mounts the shared dumb-station mouth with its context ring', () => {
  const src = read('UpNextActionDock.tsx');

  assert.match(src, /StationComposerHost/);
  assert.match(src, /showModeRow/);
  assert.match(src, /showModeFaces=\{false\}/);
  assert.match(src, /onProgressClick/);
  assert.match(src, /displaysOpen/);
  assert.doesNotMatch(src, /<OmnichannelComposerDock\b/);
});

test('Packing mounts the shared scan pane host (no second invented mouth)', () => {
  const src = readFileSync(path.resolve(HERE, '../packer/PackOrderPanel.tsx'), 'utf8');

  assert.match(src, /StationScanPaneHost/);
  assert.match(src, /StationDisplaysPushStack/);
  assert.doesNotMatch(src, /<OmnichannelComposerDock\b/);
});

test('every floor-mouth adapter reaches StationComposerHost', () => {
  const mouths = [
    ['Unbox / Triage / Quality Control', '../receiving/workspace/line-edit/LineNotesCard.tsx'],
    ['Picker', 'UpNextActionDock.tsx'],
    ['Shipping active scan', 'ActiveOrderWorkspace.tsx'],
    ['Scan Out', '../outbound/scan-out/ScanOutComposerDock.tsx'],
  ] as const;

  for (const [station, relativePath] of mouths) {
    const source = relativePath.startsWith('../')
      ? readFileSync(path.resolve(HERE, relativePath), 'utf8')
      : read(relativePath);
    assert.match(source, /StationComposerHost/, `${station} must use the shared host`);
    assert.doesNotMatch(
      source,
      /<OmnichannelComposerDock\b/,
      `${station} must not mount the incomplete raw dock`,
    );
  }
});
