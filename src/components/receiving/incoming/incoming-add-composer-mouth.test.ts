/**
 * Tripwire: Incoming add extract foot must be StationComposerHost (Unbox mouth),
 * faces off + row on — never a raw OmnichannelComposerDock, flush bar, or
 * extra desk well (`bg-transparent` / canvas pad). Eval: `pnpm run eval:station scan-out`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COMPOSER = path.join(HERE, 'IncomingAddExtractComposer.tsx');
const LAYOUT = path.join(
  HERE,
  '../../../design-system/components/TriageScrollLayout.tsx',
);

test('IncomingAddExtractComposer mounts StationComposerHost with faces off, row on', () => {
  const src = readFileSync(COMPOSER, 'utf8');
  assert.match(src, /StationComposerHost/);
  assert.match(src, /showModeFaces=\{false\}/);
  assert.match(src, /forceMode="unbox"/);
  assert.match(src, /chrome="raised"/);
  assert.doesNotMatch(src, /showModeRow=\{false\}/);
  assert.doesNotMatch(src, /<OmnichannelComposerDock\b/);
  assert.doesNotMatch(src, /appearance=["']flush["']/);
  assert.doesNotMatch(src, /bg-transparent/);
  assert.doesNotMatch(src, /bg-surface-canvas/);
});

test('TriageScrollLayout footer does not add extra bottom pad under the mouth', () => {
  const src = readFileSync(LAYOUT, 'utf8');
  assert.match(src, /footer \?/);
  assert.doesNotMatch(src, /triageMeasureClass\(align\), 'shrink-0 pb-5'/);
});
