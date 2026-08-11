/**
 * Kiosk V2 flush chrome — shared pane-header hairline + far-left mode spine.
 *
 * Catalog and Repair Details must compose the same `KIOSK_PANE_HEADER_BAND` so
 * the top hairline Y reads continuous across columns. Module selection is a
 * left push spine — never a bottom pill / floating dock. Spine open/close lives
 * in the Catalog (or Pickup detail) header, never inside the spine column.
 *
 * Contract: `.claude/rules/display/kiosk-shell.md`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('Kiosk V2 flush chrome', () => {
  it('exports a shared pane-header band with one bottom hairline', () => {
    const chrome = read('src/app/kiosk/kiosk-chrome.ts');
    assert.match(chrome, /export const KIOSK_PANE_HEADER_BAND/);
    assert.match(chrome, /h-14/);
    assert.match(chrome, /border-b border-border-soft/);
    assert.match(chrome, /cornerClass\('flush'\)/);
    // Flush leading: spine toggle aligns with Catalog flush back cell (not px-4).
    assert.match(chrome, /pl-0 pr-4/);
    assert.doesNotMatch(chrome, /KIOSK_PANE_HEADER_BAND[\s\S]*?px-4/);
    assert.match(chrome, /KIOSK_PANE_HEADER_TITLE[\s\S]*?first:pl-4/);
  });

  it('exports a shared pane-footer band twin of the header hairline', () => {
    const chrome = read('src/app/kiosk/kiosk-chrome.ts');
    assert.match(chrome, /export const KIOSK_PANE_FOOTER_BAND/);
    assert.match(chrome, /KIOSK_PANE_FOOTER_BAND[\s\S]*?h-14/);
    assert.match(chrome, /KIOSK_PANE_FOOTER_BAND[\s\S]*?border-t border-border-soft/);
    // Same soft seam token as the header — never hairline weight on the floor.
    assert.doesNotMatch(
      chrome,
      /KIOSK_PANE_FOOTER_BAND[\s\S]*?border-border-hairline/,
    );
  });

  it('Catalog and Repair Details headers compose the shared band', () => {
    const shell = read('src/app/kiosk/KioskShell.tsx');
    const repair = read('src/app/kiosk/v2/KioskRepairPane.tsx');
    assert.match(shell, /KIOSK_PANE_HEADER_BAND/);
    assert.match(repair, /KIOSK_PANE_HEADER_BAND/);
    // Sales/pickup shell title also shares the band when not repair-owned.
    assert.doesNotMatch(shell, /border-b border-border-soft p-5/);
    assert.doesNotMatch(repair, /border-b border-border-soft bg-surface-card p-5/);
  });

  it('mode nav is a left push spine — never a bottom pill dock', () => {
    const shell = read('src/app/kiosk/KioskShell.tsx');
    const chrome = read('src/app/kiosk/kiosk-chrome.ts');
    const spine = read('src/app/kiosk/KioskModeSpine.tsx');

    assert.match(shell, /KioskModeSpine/);
    assert.match(chrome, /KIOSK_MODE_SPINE_COLLAPSED_W_PX = 0/);
    assert.match(chrome, /KIOSK_MODE_SPINE_EXPANDED_W_PX/);
    assert.match(spine, /KioskModeSpine/);
    assert.match(spine, /KIOSK_MODE_SPINE_COLLAPSED_W_PX/);
    // Default closed — counter floor starts with Catalog, spine off-screen.
    assert.match(shell, /useState\(false\)/);

    assert.doesNotMatch(shell, /KIOSK_MODE_DOCK/);
    assert.doesNotMatch(chrome, /KIOSK_MODE_DOCK/);
    assert.doesNotMatch(shell, /rounded-full/);
    assert.doesNotMatch(shell, /fixed bottom-0/);
    assert.doesNotMatch(shell, /backdrop-blur/);
    assert.doesNotMatch(spine, /fixed bottom-0/);
    assert.doesNotMatch(spine, /rounded-full/);
  });

  it('spine toggle lives in the pane header, not inside the spine column', () => {
    const shell = read('src/app/kiosk/KioskShell.tsx');
    const spine = read('src/app/kiosk/KioskModeSpine.tsx');
    const toggle = read('src/app/kiosk/KioskSpineToggle.tsx');

    assert.match(toggle, /export function KioskSpineToggle/);
    assert.match(shell, /KioskSpineToggle/);
    assert.match(shell, /spineToggle/);
    // Spine is destinations only — no open/close IconButton / pane header.
    assert.doesNotMatch(spine, /from ['"]\.\/KioskSpineToggle['"]/);
    assert.doesNotMatch(spine, /IconButton/);
    assert.doesNotMatch(spine, /KIOSK_PANE_HEADER_BAND/);
    assert.doesNotMatch(spine, /onExpandedChange/);
  });

  it('kiosk catalog mounts ProductSelector flush appearance', () => {
    const shell = read('src/app/kiosk/KioskShell.tsx');
    assert.match(shell, /appearance=["']flush["']/);
  });

  it('kiosk catalog is a split: category+cart sidebar · products browse stage', () => {
    const shell = read('src/app/kiosk/KioskShell.tsx');
    const selector = read('src/components/repair/ProductSelector.tsx');

    assert.match(shell, /layout=["']kiosk-split["']/);
    assert.match(shell, /catalogPhase/);
    assert.match(shell, /onContinue/);
    assert.match(shell, /onAddAnotherItem/);
    assert.match(selector, /data-kiosk-catalog-split/);
    assert.match(selector, /data-kiosk-catalog-sidebar/);
    assert.match(selector, /categoryLevelsByParent/);
    assert.match(selector, /renderAccordionSiblingLevel/);
    assert.match(selector, /CATEGORY_ROOT_KEY/);
    assert.match(selector, /data-kiosk-product-browse/);
    assert.match(selector, /data-kiosk-cart-tray/);
    assert.match(selector, /Add another item/);
    assert.match(selector, /data-kiosk-add-another/);
    assert.match(selector, /data-kiosk-continue/);
    assert.match(selector, /KIOSK_PANE_FOOTER_BAND/);
    assert.match(selector, /data-kiosk-footer-band/);
    // Products grid must not live inside the sidebar host — browse stage only.
    const sidebarFn = selector.slice(
      selector.indexOf('renderCategoryAccordion'),
      selector.indexOf('renderStackedCategories'),
    );
    assert.doesNotMatch(sidebarFn, /data-kiosk-product-browse/);
  });

  it('repair checkout floor composes the shared footer band', () => {
    const repair = read('src/app/kiosk/v2/KioskRepairPane.tsx');
    assert.match(repair, /KIOSK_PANE_FOOTER_BAND/);
    assert.match(repair, /data-kiosk-footer-band/);
    assert.doesNotMatch(repair, /FlushTerminalFooter/);
  });
});
