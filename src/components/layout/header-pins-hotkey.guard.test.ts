/**
 * Source guard: **⌘/Ctrl+1–9 pin jumps** have exactly one owner —
 * {@link HeaderPinsSwitcher} via {@link pinSlotFromKeyboardEvent} — and pin
 * slots are list order, never a stored `hotkey` field on {@link PinnedPage}.
 *
 * Sibling of `cmdk-owner.guard.test.ts` / `clipboard-hotkey-owner.guard.test.ts`:
 * one binder, labels from `pinHotkeyLabel`, no second window listener.
 *
 * Run: node --test --import tsx \
 *        src/components/layout/header-pins-hotkey.guard.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../../', import.meta.url));

const OWNER = 'components/layout/HeaderPinsSwitcher.tsx';
const HELPER = 'lib/quick-access/pin-hotkeys.ts';
const TYPES = 'lib/quick-access/types.ts';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const FILES = walk(SRC).filter((f) => !f.endsWith('header-pins-hotkey.guard.test.ts'));
const rel = (f: string) => f.slice(SRC.length);

/**
 * A pin-jump binder — must call {@link pinSlotFromKeyboardEvent} from a
 * keydown listener. Bare Digit1… handlers (e.g. To Ship filter hotkeys that
 * *reject* meta/ctrl) are not claimants.
 */
function bindsPinDigitChord(code: string): boolean {
  return (
    /pinSlotFromKeyboardEvent/.test(code)
    && /addEventListener\(\s*['"]keydown['"]/.test(code)
  );
}

test('exactly one surface binds ⌘/Ctrl+1–9 pin jumps', () => {
  const binders = FILES.filter((f) =>
    bindsPinDigitChord(stripComments(readFileSync(f, 'utf8'))),
  ).map(rel);

  assert.deepEqual(
    binders,
    [OWNER],
    `pin digit chords must have exactly one owner (${OWNER}). Found: ${binders.join(', ') || 'none'}`,
  );
});

test('pinHotkeyLabel is declared next to the slot resolver', () => {
  const helper = readFileSync(join(SRC, HELPER), 'utf8');
  assert.match(helper, /export function pinHotkeyLabel/);
  assert.match(helper, /export function pinSlotFromKeyboardEvent/);
  assert.match(helper, /MAX_PIN_HOTKEY_SLOTS/);
});

test('HeaderPinsSwitcher imports pinHotkeyLabel / pinSlotFromKeyboardEvent (no hardcoded ⌘N)', () => {
  const owner = readFileSync(join(SRC, OWNER), 'utf8');
  assert.match(owner, /pinHotkeyLabel/);
  assert.match(owner, /pinSlotFromKeyboardEvent/);
  assert.match(owner, /from '@\/lib\/quick-access\/pin-hotkeys'/);
  assert.doesNotMatch(
    stripComments(owner),
    /['"`]⌘[1-9]/,
    'row hints must come from pinHotkeyLabel, not a hardcoded ⌘N literal',
  );
});

test('PinnedPage has no hotkey field; slots come from MAX_PIN_HOTKEY_SLOTS order', () => {
  const types = readFileSync(join(SRC, TYPES), 'utf8');
  assert.match(types, /export const MAX_PIN_HOTKEY_SLOTS = 9/);
  assert.doesNotMatch(types, /MAX_HEADER_PIN_ICONS/);
  // Interface body must not declare hotkey
  assert.doesNotMatch(
    stripComments(types),
    /interface PinnedPage[\s\S]*?hotkey\s*[?:]/,
    'PinnedPage must not grow a stored hotkey — order owns the slot',
  );
});
