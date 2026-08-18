/**
 * Staff-preferences Sync bridges — one-shot hydrate SoT.
 *
 * Continuous `hydrate*(prefs.field)` on every prefs write was the same race as
 * KPI Hide/Show metrics: a concurrent PUT's cache settle snapped local paint
 * (hotkey · clock · theme) back. QuickAccess already one-shots; hotkey /
 * time-format / theme must match.
 *
 *   node --require ./scripts/register-server-only-shim.cjs --import tsx --test \
 *     src/hooks/staff-preferences-sync.guard.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf8');
}

describe('staff-preferences Sync one-shot hydrate', () => {
  it('ScanHotkeySync hydrates once via hydratedRef', () => {
    const src = read('src/components/scan/ScanHotkeySync.tsx');
    assert.match(src, /hydratedRef/);
    assert.match(src, /if \(!prefs \|\| hydratedRef\.current\) return/);
    assert.doesNotMatch(
      src,
      /hydrateHotkey\(prefs\?\.focusScanHotkey/,
      'must not re-hydrate on every focusScanHotkey change',
    );
  });

  it('TimeFormatSync hydrates once and ignores absent server format', () => {
    const src = read('src/components/time-format/TimeFormatSync.tsx');
    assert.match(src, /hydratedRef/);
    assert.match(src, /if \(!prefs \|\| hydratedRef\.current\) return/);
    assert.match(
      src,
      /if \(prefs\.timeFormat\) hydrateTimeFormat\(prefs\.timeFormat\)/,
      'null/absent must not snap the clock back to 12h',
    );
  });

  it('TimeFormat store hydrate no-ops on null/garbage (hotkey twin)', () => {
    const src = read('src/lib/time-format/store.ts');
    assert.match(src, /if \(!isTimeFormat\(value\) \|\| value === format\) return/);
  });

  it('ThemeSync depends on theme/accent fields — not whole prefs identity', () => {
    const src = read('src/components/theme/ThemeSync.tsx');
    assert.match(src, /prefsReady/);
    assert.match(src, /\[prefsReady, theme\]/);
    assert.doesNotMatch(
      src,
      /}, \[prefs\]\)/,
      'whole-prefs dep re-touches data-theme on every staff-preferences write',
    );
  });

  it('QuickAccessSync stays one-shot (golden sibling)', () => {
    const src = read('src/components/quick-access/QuickAccessSync.tsx');
    assert.match(src, /seededRef/);
    assert.match(src, /if \(!prefs \|\| seededRef\.current\) return/);
  });
});
