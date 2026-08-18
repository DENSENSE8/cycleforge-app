/**
 * Source guard: **⌘⇧V has exactly one owner** — {@link ClipboardHistoryHost} —
 * and the label and the binding ship together.
 *
 * This is `cmdk-owner.guard.test.ts`'s rule applied to the clipboard chord. That
 * guard's whole origin story is three claimants for ⌘K plus a header tooltip
 * advertising a chord it did not bind, and the lesson generalises: a false
 * shortcut hint is worse than no hint, because it teaches a chord that does
 * something else.
 *
 * It also pins the two things that make THIS chord different from ⌘K:
 *
 *  1. **It stands down inside text fields.** ⌘⇧V is paste-without-formatting in
 *     Chrome, Safari and most editors. ⌘K has no native meaning, which is why
 *     its owner is forbidden from inspecting the focused element and this one is
 *     required to.
 *  2. **The binder is not the button.** `StaffAccountFooter` mounts only inside
 *     the lazily-mounted spine, so a chord bound there would be dead until the
 *     operator opened the spine — the exact friction the chord removes.
 *
 * Run: node --test --import tsx \
 *        src/components/quick-access/clipboard-hotkey-owner.guard.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../../', import.meta.url));

/** The one file allowed to bind the chord. */
const OWNER = 'components/quick-access/ClipboardHistoryHost.tsx';

/** The app-wide mount point — must NOT be the spine footer. */
const HOST_MOUNT = 'components/layout/ResponsiveLayout.tsx';

const FOOTER = 'components/sidebar/master-nav/StaffAccountFooter.tsx';

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

const FILES = walk(SRC).filter((f) => !f.endsWith('clipboard-hotkey-owner.guard.test.ts'));
const rel = (f: string) => f.slice(SRC.length);

/**
 * A ⌘⇧V *binding* — a handler testing the `v` key alongside a meta/ctrl AND a
 * shift modifier. Matching the key test rather than the glyph is what makes this
 * a guard rather than a spell-check.
 *
 * Both comparison directions count: an early-bail binder (`if (key !== 'v')
 * return`) is every bit as much a claimant as a positive `=== 'v'` branch, and
 * matching only the latter would let a second owner in through a style choice.
 */
function bindsClipboardChord(code: string): boolean {
  if (!/metaKey|ctrlKey/.test(code)) return false;
  if (!/shiftKey/.test(code)) return false;
  return /key(?:\.toLowerCase\(\))?\s*[!=]==\s*['"]v['"]/.test(code);
}

test('exactly one file binds ⌘⇧V', () => {
  const binders = FILES.filter((f) =>
    bindsClipboardChord(stripComments(readFileSync(f, 'utf8'))),
  ).map(rel);

  assert.deepEqual(
    binders,
    [OWNER],
    `⌘⇧V must have exactly one owner (${OWNER}). Two window-level listeners ` +
      `both preventDefault, so one keypress opens two surfaces — the exact ` +
      `defect cmdk-owner.guard.test.ts exists to stop. Found: ${binders.join(', ') || 'none'}`,
  );
});

test('the owner stands the chord down inside editable elements', () => {
  const owner = readFileSync(join(SRC, OWNER), 'utf8');
  assert.match(
    stripComments(owner),
    /contenteditable|isEditableTarget/,
    'unlike ⌘K, this chord HAS a native meaning (paste-without-formatting), so ' +
      'it must yield to the field the operator is typing in',
  );
});

test('the chord label is imported from the binder, never re-typed', () => {
  const owner = readFileSync(join(SRC, OWNER), 'utf8');
  assert.match(
    owner,
    /export const CLIPBOARD_HISTORY_HOTKEY_LABEL/,
    'the binder must export the label it binds',
  );

  const offenders: string[] = [];
  for (const file of FILES) {
    if (rel(file) === OWNER) continue;
    const code = stripComments(readFileSync(file, 'utf8'));
    // A literal ⌘⇧V (any spacing) in a file that does not import the constant
    // is a hint that can drift away from the binding.
    if (/⌘\s*⇧\s*V/.test(code) && !/CLIPBOARD_HISTORY_HOTKEY_LABEL/.test(code)) {
      offenders.push(rel(file));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these surfaces hardcode the chord instead of importing ` +
      `CLIPBOARD_HISTORY_HOTKEY_LABEL, so a rebinding would leave a stale hint: ` +
      `${offenders.join(', ')}`,
  );
});

test('the panel has ONE desktop mount, and the spine footer is not it', () => {
  const footer = readFileSync(join(SRC, FOOTER), 'utf8');
  assert.doesNotMatch(
    stripComments(footer),
    /<ClipboardHistoryPopover/,
    `${FOOTER} must not mount the panel — it is a trigger only. Two mounts means ` +
      `two independent open states over one panel, and the footer's copy would be ` +
      `unreachable whenever the spine is closed.`,
  );
  assert.match(
    stripComments(footer),
    /openClipboardHistory\(\)/,
    'the footer row must ask the host to open',
  );
});

test('the host is mounted app-wide, not inside the lazily-mounted spine', () => {
  const layout = stripComments(readFileSync(join(SRC, HOST_MOUNT), 'utf8'));
  assert.match(
    layout,
    /<ClipboardHistoryHost \/>/,
    `${HOST_MOUNT} must mount ClipboardHistoryHost. SidebarNavColumn mounts on ` +
      `FIRST open over an unpersisted navOpen=false, so a host mounted in the ` +
      `spine would leave the chord dead on every fresh page load.`,
  );
});
