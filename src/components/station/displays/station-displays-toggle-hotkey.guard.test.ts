/**
 * Station Displays toggle chord — ⌘/Ctrl+] has exactly one owner
 * (`StationDisplaysEdgeToggle` via `displays-toggle-hotkey.ts`).
 *
 * Pins:
 *   1. Edge toggle wires the hook and composes the label helper (no hand-typed
 *      ⌘] that can drift from the listener).
 *   2. Desk History / To-ship inspectors keep ⌘\ + bare ] and do NOT claim
 *      meta+BracketRight (Displays ≠ inspector chord split).
 *   3. No second meta+BracketRight binder under station/displays/.
 *
 *   node --import tsx --test src/components/station/displays/station-displays-toggle-hotkey.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const read = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));

const HOTKEY = 'src/components/station/displays/displays-toggle-hotkey.ts';
const EDGE = 'src/components/station/displays/StationDisplaysEdgeToggle.tsx';
const UNBOX_HEADER = 'src/components/receiving/unbox/UnboxWorkspaceHeader.tsx';
const OUTBOUND_HEADER = 'src/components/dashboard/OutboundWorkspaceHeader.tsx';
const DISPLAYS_DIR = 'src/components/station/displays';

describe('Station Displays toggle hotkey (⌘])', () => {
  it('hotkey module owns match + label + hook', () => {
    const src = read(HOTKEY);
    assert.match(src, /STATION_DISPLAYS_TOGGLE_CHORD_CODE = 'BracketRight'/);
    assert.match(src, /function matchesStationDisplaysToggleHotkey/);
    assert.match(src, /export function stationDisplaysToggleHotkeyLabel/);
    assert.match(src, /export function useStationDisplaysToggleHotkey/);
    assert.match(src, /hasOpenOverlay/);
    // Modifier chord — must NOT bail on typing targets (⌘K rule).
    assert.doesNotMatch(src, /isTypingTarget|isEditable/);
  });

  it('edge toggle wires the hook and composes the label helper', () => {
    const src = read(EDGE);
    assert.match(src, /useStationDisplaysToggleHotkey\(onClick\)/);
    assert.match(src, /stationDisplaysToggleHotkeyLabel\(\)/);
    // No raw chord face that can drift from the helper.
    assert.doesNotMatch(src, /Open displays \(⌘\]\)/);
    assert.doesNotMatch(src, /Hide displays \(⌘\]\)/);
    assert.doesNotMatch(src, /Ctrl\+\]/);
  });

  it('desk inspector headers keep ⌘\\ + bare ] and never claim meta+BracketRight', () => {
    for (const rel of [UNBOX_HEADER, OUTBOUND_HEADER]) {
      const src = read(rel);
      assert.match(src, /Backslash/, `${rel} binds ⌘\\`);
      assert.match(
        src,
        /!e\.metaKey && !e\.ctrlKey && !e\.altKey && e\.key === '\]'/,
        `${rel} binds bare ]`,
      );
      assert.doesNotMatch(
        src,
        /BracketRight/,
        `${rel} must not claim BracketRight (Station Displays owns ⌘])`,
      );
      assert.doesNotMatch(
        src,
        /\(e\.metaKey \|\| e\.ctrlKey\).*\]/,
        `${rel} must not bind meta+]`,
      );
    }
  });

  it('only the hotkey module + edge toggle bind BracketRight under station/displays', () => {
    const files = readdirSync(join(process.cwd(), DISPLAYS_DIR)).filter(
      (f) => f.endsWith('.ts') || f.endsWith('.tsx'),
    );
    const claimants: string[] = [];
    for (const f of files) {
      if (f.endsWith('.guard.test.ts') || f.endsWith('.test.ts')) continue;
      const src = read(join(DISPLAYS_DIR, f));
      if (!src.includes('BracketRight') && !src.includes("code === 'BracketRight'")) {
        continue;
      }
      if (
        f === 'displays-toggle-hotkey.ts' ||
        f === 'StationDisplaysEdgeToggle.tsx' ||
        f === 'index.ts'
      ) {
        continue;
      }
      claimants.push(f);
    }
    assert.deepEqual(
      claimants,
      [],
      `unexpected BracketRight binders under station/displays: ${claimants.join(', ')}`,
    );
  });
});
