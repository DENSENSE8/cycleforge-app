/**
 * Tripwire — Displays leaf interiors follow station Color (no white/hex wells).
 *
 *   npx tsx --test src/components/station/displays/displays-leaf-interiors.test.ts
 *
 * Phase 1 scoped `[data-station-displays]` onto card chrome. Phase 2 remaps
 * canvas + soft ink and retires palette `*-50` panel wells inside leaf hosts.
 * Index tone chips and semantic amber/emerald *ink* stay.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { stationSkinCssText } from '@/design-system/themes/station-skins';

const ROOT = process.cwd();

/** Leaf hosts / builders that paint heavy Displays body chrome. */
const LEAF_HOSTS = [
  'src/components/receiving/workspace/line-edit/TicketDisplayHost.tsx',
  'src/components/receiving/workspace/line-edit/CartonMatchHub.tsx',
  'src/components/receiving/workspace/line-edit/ListingLinksTab.tsx',
  'src/components/receiving/workspace/line-edit/ListingVendorViewPanel.tsx',
  'src/components/receiving/workspace/UnitsExplosionDisplay.tsx',
  'src/components/receiving/workspace/line-edit/PhotosDisplayHost.tsx',
  'src/components/receiving/PreboxWizard.tsx',
  'src/components/tech/sku-testing/ChecklistStepRow.tsx',
  'src/components/tech/sku-testing/NoCatalogNotice.tsx',
  'src/components/station/location/StationNewLocationForm.tsx',
  'src/components/receiving/workspace/line-edit/PoLinkTab.tsx',
  'src/components/receiving/workspace/line-edit/MovePhotosBetweenPoPanel.tsx',
  'src/components/receiving/inventory/InventoryPoLineList.tsx',
  'src/components/tech/shipping/ShippingCapturedUnits.tsx',
  'src/components/support/zendesk/chat/SupportTicketDetail.tsx',
] as const;

function read(rel: string): string {
  const abs = join(ROOT, rel);
  assert.ok(existsSync(abs), `missing leaf host: ${rel}`);
  return readFileSync(abs, 'utf8');
}

test('Displays scope remaps canvas and soft ink for leaf interiors', () => {
  const css = stationSkinCssText();
  assert.match(css, /\[data-station-displays\]/);
  assert.match(css, /--ds-color-background-canvas:\s*var\(--ds-station-well\)/);
  assert.match(css, /--ds-color-text-soft:\s*var\(--ds-station-ink-muted\)/);
  assert.match(css, /--ds-color-surface-strong:\s*var\(--ds-station-slot\)/);
});

// ds-allow-raw-neutral: this tripwire names the banned class; it is not a paint.
test('Displays leaf hosts do not paint bg-white or hex wells', () => {
  for (const rel of LEAF_HOSTS) {
    const src = read(rel);
    // ds-allow-raw-neutral: assertion copy names the banned class.
    assert.doesNotMatch(src, /\bbg-white\b/, `${rel} has bg-white`);
    assert.doesNotMatch(src, /\bbg-\[#/, `${rel} has bg-[#…]`);
  }
});

test('Displays leaf panel wells dropped palette *-50 fills (chips may keep ink)', () => {
  // Row / panel fills that used to be light-theme islands.
  // Bound the token so `bg-blue-500` does not false-positive as `bg-blue-50`.
  const panel = (token: string) => new RegExp(String.raw`\b${token}(?:\/[\w.]+)?\b`);
  assert.doesNotMatch(read('src/components/tech/sku-testing/ChecklistStepRow.tsx'), panel('bg-emerald-50'));
  assert.doesNotMatch(read('src/components/tech/sku-testing/NoCatalogNotice.tsx'), panel('bg-amber-50'));
  assert.doesNotMatch(read('src/components/station/location/StationNewLocationForm.tsx'), panel('bg-amber-50'));
  assert.doesNotMatch(read('src/components/receiving/workspace/line-edit/PoLinkTab.tsx'), panel('bg-blue-50'));
  assert.doesNotMatch(read('src/components/receiving/PreboxWizard.tsx'), panel('bg-blue-50'));
  assert.doesNotMatch(
    read('src/components/receiving/workspace/line-edit/MovePhotosBetweenPoPanel.tsx'),
    panel('bg-blue-50'),
  );
  assert.doesNotMatch(read('src/components/receiving/inventory/InventoryPoLineList.tsx'), panel('bg-blue-50'));
  assert.doesNotMatch(read('src/components/tech/shipping/ShippingCapturedUnits.tsx'), panel('bg-emerald-50'));
  assert.doesNotMatch(
    read('src/components/support/zendesk/chat/SupportTicketDetail.tsx'),
    panel('bg-blue-50'),
  );
});

test('Index tone chips keep semantic amber/emerald (not retokened away)', () => {
  const src = read('src/components/station/displays/StationDisplayIndexList.tsx');
  assert.match(src, /bg-amber-50/);
  assert.match(src, /bg-emerald-50/);
});
