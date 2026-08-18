/**
 * Unbox dock keyboard entry — always-left compact procedure waist (collapse-
 * strip twin) on shared-entry steps including photo. Serial / classify own
 * Band 1 alone.
 *
 * Run: `node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        --test src/components/receiving/workspace/line-edit/unbox-dock-scan-entry.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'src');

function src(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

test('UnboxDockScanEntry is a compact collapse-strip twin — no placeholder copy', () => {
  const entry = src(
    'components/receiving/workspace/line-edit/UnboxDockScanEntry.tsx',
  );
  assert.match(entry, /ADVANCE_KEYS/, 'classify advances via Enter');
  assert.match(entry, /activeKey === 'condition'/, 'condition accepts grade');
  assert.match(entry, /activeKey === 'contents'/, 'contents ack via Enter');
  assert.match(entry, /activeKey === 'label'/, 'label ack via Enter');
  assert.match(
    entry,
    /UNBOX_PHOTO_STRIP_KEYS/,
    'photo strip keys advance via the left waist',
  );
  assert.match(entry, /ScanBandGlowHost/, 'focused face uses station glow host');
  assert.match(entry, /data-unbox-dock-scan-compact/, 'compact waist marker');
  assert.match(entry, /w-8/, 'collapse-strip width');
  assert.match(entry, /<Plus /, 'idle Plus face like CollapseStripScanCell');
  assert.match(
    entry,
    /placeholder=""/,
    'no placeholder text — glow + caret are the focus signal',
  );
  assert.doesNotMatch(
    entry,
    /Enter to continue|Enter to confirm|Enter when ready|Grade…|Scan location/,
    'banned: wide-field placeholder copy on the compact waist',
  );
  assert.doesNotMatch(
    entry,
    /ProcedureDeck|UnboxProcedureDeck/,
    'centre deck stays parked',
  );
  assert.doesNotMatch(
    entry,
    /usePhotoStepAdvanceSink/,
    'banned: silent photo sink twin — waist owns po-line sink',
  );
  assert.doesNotMatch(
    entry,
    /w-full min-w-0 flex-1/,
    'banned: flex-1 sunken field that steals Band 1 from step ACTION',
  );
});

test('UnboxStepDock mounts left waist on photo steps — serial/classify exclusive', () => {
  const dock = src(
    'components/receiving/workspace/line-edit/UnboxStepDock.tsx',
  );
  assert.match(dock, /UnboxDockScanEntry/, 'shared dock scan entry composed');
  assert.match(
    dock,
    /ownsBandAlone/,
    'serial · classify own Band 1 alone',
  );
  assert.match(
    dock,
    /activeKey === 'serial' \|\|[\s\S]*activeKey === 'classify'/,
    'serial and classify hide the shared wedge',
  );
  assert.doesNotMatch(
    dock,
    /UNBOX_PHOTO_FILL_KEYS/,
    'banned: old fill-keys that hid the waist on photos',
  );
  assert.doesNotMatch(
    dock,
    /UNBOX_PHOTO_STRIP_KEYS\.has/,
    'photo strip keys must not exclude the left waist',
  );
});

test('Sidebar focus-scan skips when dock scan owner is mounted', () => {
  const sidebar = src('components/sidebar/ReceivingSidebarPanel.tsx');
  assert.match(
    sidebar,
    /\[data-unbox-dock-scan\]/,
    'generalized dock scan marker blocks sidebar steal',
  );
  assert.match(
    sidebar,
    /\[data-unbox-serial-dock\]/,
    'legacy serial marker still honored',
  );
});

test('No UnboxDockScanEntry / UnboxDockHost under Testing', () => {
  const tech = src('components/tech/TestingPanel.tsx');
  assert.doesNotMatch(tech, /UnboxDockScanEntry|UnboxDockHost|UnboxStepDock/);
});
