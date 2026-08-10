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
    assert.match(chrome, /KIOSK_MODE_SPINE_ICON_W_PX/);
    assert.match(chrome, /KIOSK_MODE_SPINE_EXPANDED_W_PX/);
    assert.match(spine, /KioskModeSpine/);

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
});
