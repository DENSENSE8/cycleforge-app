/**
 * Left context-rail toggle chord — ⌘/Ctrl+B has exactly one owner
 * (`ContextPanelLayout` via `context-panel-toggle-hotkey.ts`).
 *
 * Pins:
 *   1. Layout wires the hook with toggle + hasPanel gate.
 *   2. Click hosts compose the label helper (no hand-typed ⌘B).
 *   3. MasterNav spine does NOT bind KeyB / advertise ⌘B.
 *   4. Station Displays keeps BracketRight — never KeyB.
 *
 *   node --import tsx --test src/components/sidebar/context-panel-toggle-hotkey.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const read = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));

const HOTKEY = 'src/components/sidebar/context-panel-toggle-hotkey.ts';
const LAYOUT = 'src/components/sidebar/ContextPanelLayout.tsx';
const LEFT_DOCK = 'src/components/sidebar/tech/left-dock-toggle.tsx';
const MASTER_NAV = 'src/components/layout/SidebarCollapseControl.tsx';
const DISPLAYS_HOTKEY = 'src/components/station/displays/displays-toggle-hotkey.ts';

describe('Context panel toggle hotkey (⌘B)', () => {
  it('hotkey module owns label + hook on KeyB without shift/alt', () => {
    const src = read(HOTKEY);
    assert.match(src, /CONTEXT_PANEL_TOGGLE_CHORD_CODE = 'KeyB'/);
    assert.match(src, /export function contextPanelToggleHotkeyLabel/);
    assert.match(src, /export function useContextPanelToggleHotkey/);
    assert.match(src, /hasOpenOverlay/);
    assert.match(src, /e\.shiftKey \|\| e\.altKey/);
    assert.doesNotMatch(src, /isTypingTarget|isEditable/);
  });

  it('ContextPanelLayout is the single listener owner', () => {
    const src = read(LAYOUT);
    assert.match(src, /useContextPanelToggleHotkey\(toggle, hasPanel\)/);
    assert.match(src, /expand=\{expand\}/);
    assert.match(src, /toggle=\{toggle\}/);
    // Must not also bind KeyB on click hosts.
    assert.doesNotMatch(src, /addEventListener\('keydown'/);
  });

  it('left-dock click hosts compose the chord label helper', () => {
    const src = read(LEFT_DOCK);
    assert.match(src, /contextPanelToggleHotkeyLabel/);
    assert.match(src, /withContextPanelChord/);
    assert.doesNotMatch(src, /Hide sidebar \(⌘B\)/);
    assert.doesNotMatch(src, /Ctrl\+B/);
    assert.doesNotMatch(src, /addEventListener\('keydown'/);
  });

  it('MasterNav spine stays click-only and does not claim ⌘B', () => {
    const src = read(MASTER_NAV);
    assert.doesNotMatch(src, /KeyB/);
    assert.doesNotMatch(src, /contextPanelToggleHotkeyLabel/);
    assert.doesNotMatch(src, /⌘B|Ctrl\+B/);
    assert.doesNotMatch(src, /addEventListener\('keydown'/);
    // Noun split from context-rail "sidebar".
    assert.match(src, /Show navigation|Hide navigation/);
  });

  it('Station Displays toggle stays on BracketRight, not KeyB', () => {
    const src = read(DISPLAYS_HOTKEY);
    assert.match(src, /BracketRight/);
    assert.doesNotMatch(src, /KeyB/);
  });
});
