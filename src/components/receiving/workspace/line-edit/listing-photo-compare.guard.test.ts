/**
 * Unbox Photos → Compare is a Displays reference leaf (listing vs bench).
 * Capture stays in the dock — never a second pointer or centre ProcedureDeck.
 *
 * Run: `node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        --test src/components/receiving/workspace/line-edit/listing-photo-compare.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'src/components/receiving/workspace/line-edit');

function src(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

test('Photos host mounts Compare leaf + parseUnboxPhotoAction knows compare', () => {
  const photos = src('PhotosDisplayHost.tsx');
  assert.match(photos, /ListingPhotoCompareHost/, 'Compare body mounted under Photos');
  assert.match(
    photos,
    /dynamic\([\s\S]*ListingPhotoCompareHost/,
    'Compare is dynamic() — not bundled with Actions',
  );
  assert.match(
    photos,
    /onOpenCompare|onActionChange\('compare'\)/,
    'Compare opens from armed rows (no TabDisplay strip)',
  );
  assert.doesNotMatch(
    photos,
    /from ['"]@\/design-system\/components['"]|<\s*TabDisplay\b/,
    'no nested Photos TabDisplay import/mount',
  );

  const actions = src('PhotosActionsArmedList.tsx');
  assert.match(actions, /id:\s*'compare'/, 'Compare is an armed row verb');

  const tabs = src('unbox-side-tabs.ts');
  assert.match(tabs, /'compare'/, 'UnboxPhotoAction includes compare');
  assert.match(
    tabs,
    /if \(raw === 'compare'\) return 'compare'/,
    'photoAction wire parse accepts compare',
  );
});

test('Compare host is reference-only — no ProcedureDeck remount', () => {
  const compare = src('ListingPhotoCompareHost.tsx');
  assert.doesNotMatch(compare, /ProcedureDeck|UnboxProcedureDeck/, 'centre deck stays parked');
  assert.doesNotMatch(compare, /ReceivingPhotoButton/, 'capture stays in the dock');
  assert.match(compare, /data-unbox-listing-compare/, 'stable test marker');
});

test('LineEditPanel opens Compare when the item_photos step is active', () => {
  const panel = readFileSync(
    join(process.cwd(), 'src/components/receiving/workspace/LineEditPanel.tsx'),
    'utf8',
  );
  assert.match(
    panel,
    /photoAction:\s*'compare'/,
    'item_photos auto-opens Photos → Compare',
  );
  assert.match(panel, /activeKey !== 'item_photos'/, 'does not loop when leaving the step');
});
