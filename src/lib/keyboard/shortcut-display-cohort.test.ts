/**
 * Tripwire — shortcut-display cohort (keyboard `?` → inside-right Linear overlays).
 *
 * Run: node --import tsx --test src/lib/keyboard/shortcut-display-cohort.test.ts
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  SHORTCUT_DISPLAY_ENGINE,
  SHORTCUT_DISPLAY_ENGINE_CONTRACT,
  SHORTCUT_DISPLAY_FORBIDDEN,
  SHORTCUT_DISPLAY_KNOWN_DEBT,
  SHORTCUT_DISPLAY_PAINT_LAW,
  assertShortcutKnownDebtRatchet,
  discoverShortcutDisplay,
  shortcutEngineContractSource,
  shortcutEngineForbiddenSource,
} from './shortcut-display-cohort';

const ROOT = join(process.cwd());

function read(rel: string): string {
  const abs = join(ROOT, rel);
  assert.ok(existsSync(abs), `missing ${rel}`);
  return readFileSync(abs, 'utf8');
}

describe('shortcut-display cohort (SoT = KeyboardKey inside-right overlays)', () => {
  it('engine files exist', () => {
    assert.ok(existsSync(join(ROOT, SHORTCUT_DISPLAY_ENGINE.keyboardKey)));
    assert.ok(existsSync(join(ROOT, SHORTCUT_DISPLAY_ENGINE.cheatSheet)));
    assert.ok(existsSync(join(ROOT, SHORTCUT_DISPLAY_ENGINE.statusBar)));
    assert.ok(existsSync(join(ROOT, SHORTCUT_DISPLAY_ENGINE.columnActionRow)));
    assert.ok(existsSync(join(ROOT, SHORTCUT_DISPLAY_ENGINE.inlineHotkeys)));
    assert.ok(existsSync(join(ROOT, 'src/hooks/useSelectionActionHotkeys.ts')));
  });

  it('KeyboardKey is gray face + black letter SoT', () => {
    const src = read(SHORTCUT_DISPLAY_ENGINE.keyboardKey);
    assert.match(src, SHORTCUT_DISPLAY_ENGINE_CONTRACT.opaqueKeycap);
    assert.match(src, SHORTCUT_DISPLAY_ENGINE_CONTRACT.softKeyRim);
    assert.match(src, SHORTCUT_DISPLAY_ENGINE_CONTRACT.blackLetter);
    assert.match(src, SHORTCUT_DISPLAY_ENGINE_CONTRACT.keyElevation);
    assert.match(src, SHORTCUT_DISPLAY_ENGINE_CONTRACT.squaredKeycap);
    assert.doesNotMatch(src, SHORTCUT_DISPLAY_FORBIDDEN.whiteTeachingFace);
    assert.doesNotMatch(src, SHORTCUT_DISPLAY_FORBIDDEN.mutedTeachingLetter);
  });

  it('status bar reveals KeyboardKey inside-right overlay after `?`', () => {
    const src = read(SHORTCUT_DISPLAY_ENGINE.statusBar);
    assert.match(src, SHORTCUT_DISPLAY_ENGINE_CONTRACT.hotkeyGlyph);
    assert.match(src, SHORTCUT_DISPLAY_ENGINE_CONTRACT.keyboardKeyImport);
    assert.match(src, SHORTCUT_DISPLAY_ENGINE_CONTRACT.gatedReveal);
    assert.match(src, SHORTCUT_DISPLAY_ENGINE_CONTRACT.statusBarHook);
    assert.match(src, SHORTCUT_DISPLAY_ENGINE_CONTRACT.insideRightOverlay);
    assert.match(src, SHORTCUT_DISPLAY_ENGINE_CONTRACT.actionWrap);
    assert.match(src, SHORTCUT_DISPLAY_ENGINE_CONTRACT.hotkeyCapTestId);
    assert.doesNotMatch(src, SHORTCUT_DISPLAY_FORBIDDEN.hotkeyPopover);
    assert.doesNotMatch(src, SHORTCUT_DISPLAY_FORBIDDEN.staffQuestionOpensSheet);
    assert.doesNotMatch(src, SHORTCUT_DISPLAY_FORBIDDEN.footQuestionButton);
    assert.doesNotMatch(src, SHORTCUT_DISPLAY_FORBIDDEN.translucentOverlay);
    assert.doesNotMatch(src, SHORTCUT_DISPLAY_FORBIDDEN.iconRightKeySlot);
    assert.doesNotMatch(src, SHORTCUT_DISPLAY_FORBIDDEN.reservedHotkeySlot);
    assert.doesNotMatch(src, SHORTCUT_DISPLAY_FORBIDDEN.outsideAnchor);
    assert.doesNotMatch(src, SHORTCUT_DISPLAY_FORBIDDEN.revealGapWiden);
  });

  it('column action row reveals KeyboardKey inside-right overlay after `?`', () => {
    const src = read(SHORTCUT_DISPLAY_ENGINE.columnActionRow);
    assert.match(src, SHORTCUT_DISPLAY_ENGINE_CONTRACT.hotkeyGlyph);
    assert.match(src, SHORTCUT_DISPLAY_ENGINE_CONTRACT.keyboardKeyImport);
    assert.match(src, SHORTCUT_DISPLAY_ENGINE_CONTRACT.gatedReveal);
    assert.match(src, SHORTCUT_DISPLAY_ENGINE_CONTRACT.statusBarHook);
    assert.match(src, SHORTCUT_DISPLAY_ENGINE_CONTRACT.insideRightOverlay);
    assert.match(src, SHORTCUT_DISPLAY_ENGINE_CONTRACT.actionWrap);
    assert.match(src, SHORTCUT_DISPLAY_ENGINE_CONTRACT.hotkeyCapTestId);
    assert.doesNotMatch(src, SHORTCUT_DISPLAY_FORBIDDEN.hotkeyPopover);
    assert.doesNotMatch(src, SHORTCUT_DISPLAY_FORBIDDEN.staffQuestionOpensSheet);
    assert.doesNotMatch(src, SHORTCUT_DISPLAY_FORBIDDEN.footQuestionButton);
    assert.doesNotMatch(src, SHORTCUT_DISPLAY_FORBIDDEN.translucentOverlay);
  });

  it('hook owns bind + reveal; ignores key-repeat; cheat sheet yields + KeyboardKey', async () => {
    const hook = read(SHORTCUT_DISPLAY_ENGINE.inlineHotkeys);
    // X1: the toggle seam is proven by importing it (was a grep for its export line).
    const mod = await import('@/hooks/useSelectionStatusBarHotkeys');
    assert.equal(typeof mod.toggleSelectionInlineHotkeys, 'function');
    assert.match(hook, SHORTCUT_DISPLAY_ENGINE_CONTRACT.ignoreKeyRepeat);
    const src = read(SHORTCUT_DISPLAY_ENGINE.cheatSheet);
    assert.match(src, SHORTCUT_DISPLAY_ENGINE_CONTRACT.cheatSheetYields);
    assert.match(src, SHORTCUT_DISPLAY_ENGINE_CONTRACT.ignoreKeyRepeat);
    assert.match(src, SHORTCUT_DISPLAY_ENGINE_CONTRACT.keyboardKeyImport);
  });

  it('paint law documents inside-right overlay + refuse layout moves', () => {
    assert.match(SHORTCUT_DISPLAY_PAINT_LAW.overview, /overlay/i);
    assert.match(SHORTCUT_DISPLAY_PAINT_LAW.overview, /inside/i);
    assert.match(SHORTCUT_DISPLAY_PAINT_LAW.refuse, /refuse/i);
    assert.match(SHORTCUT_DISPLAY_PAINT_LAW.refuse, /outside/i);
  });

  it('shortcutEngineContractSource greps the same files the tripwire already reads', () => {
    assert.equal(
      shortcutEngineContractSource('opaqueKeycap'),
      SHORTCUT_DISPLAY_ENGINE.keyboardKey,
    );
    assert.equal(
      shortcutEngineContractSource('ignoreKeyRepeat'),
      SHORTCUT_DISPLAY_ENGINE.inlineHotkeys,
    );
    assert.equal(
      shortcutEngineContractSource('cheatSheetYields'),
      SHORTCUT_DISPLAY_ENGINE.cheatSheet,
    );
    assert.equal(
      shortcutEngineContractSource('hotkeyGlyph'),
      SHORTCUT_DISPLAY_ENGINE.statusBar,
    );
    assert.equal(
      shortcutEngineForbiddenSource('mutedTeachingLetter'),
      SHORTCUT_DISPLAY_ENGINE.keyboardKey,
    );
    assert.equal(
      shortcutEngineForbiddenSource('staffQuestionOpensSheet'),
      SHORTCUT_DISPLAY_ENGINE.statusBar,
    );
  });

  it('discover KEEP paths exist; known-debt ratchet holds', () => {
    const report = discoverShortcutDisplay(ROOT);
    for (const k of report.keep) {
      assert.ok(existsSync(join(ROOT, k.path)), `KEEP missing ${k.path} (${k.id})`);
    }
    const ratchet = assertShortcutKnownDebtRatchet(report);
    assert.deepEqual(
      ratchet.extra,
      [],
      `NEW shortcut-display drift — do not append to KNOWN_DEBT to go green:\n${ratchet.extra.join('\n')}`,
    );
    assert.deepEqual(
      ratchet.stale,
      [],
      `Debt cleared — remove from SHORTCUT_DISPLAY_KNOWN_DEBT:\n${ratchet.stale.join('\n')}`,
    );
    assert.ok(SHORTCUT_DISPLAY_KNOWN_DEBT.length >= 1);
    assert.equal(report.delete.length, 0);
  });
});
