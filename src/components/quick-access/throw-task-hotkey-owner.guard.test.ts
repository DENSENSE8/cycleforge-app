/**
 * Source guard: **⌘⇧U has exactly one owner** — {@link ThrowTaskHost} — and the
 * label and the binding ship together.
 *
 * The sibling of `clipboard-hotkey-owner.guard.test.ts`, which is itself
 * `cmdk-owner.guard.test.ts`'s rule applied to a second chord. The origin story
 * generalises: three claimants for ⌘K plus a header tooltip advertising a chord
 * it did not bind. A false shortcut hint is worse than no hint.
 *
 * It also pins the two properties this chord depends on:
 *
 *  1. **It stands down inside text fields.** The reason differs from ⌘⇧V's — that
 *     chord yields because paste-without-formatting is a native meaning that must
 *     win, and ⌘⇧U has no native meaning at all. This one yields because the
 *     panel autofocuses its own scan field, so firing it mid-note takes the caret
 *     out of a half-written sentence on a bench. Same requirement, different
 *     argument; the guard pins the behaviour either way.
 *  2. **The binder is not the button.** `StaffAccountFooter` mounts only inside
 *     the lazily-mounted spine, so a chord bound there would be dead until the
 *     operator opened the spine — the exact friction the chord removes.
 *
 * Run: node --test --import tsx \
 *        src/components/quick-access/throw-task-hotkey-owner.guard.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../../', import.meta.url));

/** The one file allowed to bind the chord. */
const OWNER = 'components/quick-access/ThrowTaskHost.tsx';

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

const FILES = walk(SRC).filter((f) => !f.endsWith('throw-task-hotkey-owner.guard.test.ts'));
const rel = (f: string) => f.slice(SRC.length);

/**
 * A ⌘⇧U *binding* — a handler testing the `u` key alongside a meta/ctrl AND a
 * shift modifier. Matching the key test rather than the glyph is what makes this
 * a guard rather than a spell-check.
 *
 * Both comparison directions count: an early-bail binder (`if (key !== 'u')
 * return`) is every bit as much a claimant as a positive `=== 'u'` branch.
 */
function bindsThrowChord(code: string): boolean {
  if (!/metaKey|ctrlKey/.test(code)) return false;
  if (!/shiftKey/.test(code)) return false;
  return /key(?:\.toLowerCase\(\))?\s*[!=]==\s*['"]u['"]/.test(code);
}

test('exactly one file binds ⌘⇧U', () => {
  const binders = FILES.filter((f) =>
    bindsThrowChord(stripComments(readFileSync(f, 'utf8'))),
  ).map(rel);

  assert.deepEqual(
    binders,
    [OWNER],
    `⌘⇧U must have exactly one owner (${OWNER}). Two window-level listeners ` +
      `both preventDefault, so one keypress opens two surfaces. ` +
      `Found: ${binders.join(', ') || 'none'}`,
  );
});

test('the chord is modifier-gated, so a keyboard wedge can never fire it', () => {
  const owner = stripComments(readFileSync(join(SRC, OWNER), 'utf8'));
  assert.match(
    owner,
    /metaKey \|\| e\.ctrlKey/,
    'a wedge emits bare characters and Enter, never with Meta/Ctrl held — the ' +
      'modifier is what makes this surface safe to mount on a scan bench',
  );
});

test('the owner stands the chord down inside editable elements', () => {
  const owner = readFileSync(join(SRC, OWNER), 'utf8');
  assert.match(
    stripComments(owner),
    /contenteditable|isEditableTarget/,
    'the panel autofocuses its own scan field, so firing this mid-note would ' +
      'take the caret out of a half-written sentence',
  );
});

test('the chord label is imported from the binder, never re-typed', () => {
  const owner = readFileSync(join(SRC, OWNER), 'utf8');
  assert.match(
    owner,
    /export const THROW_TASK_HOTKEY_LABEL/,
    'the binder must export the label it binds',
  );

  const offenders: string[] = [];
  for (const file of FILES) {
    if (rel(file) === OWNER) continue;
    const code = stripComments(readFileSync(file, 'utf8'));
    if (/⌘\s*⇧\s*U/.test(code) && !/THROW_TASK_HOTKEY_LABEL/.test(code)) {
      offenders.push(rel(file));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these surfaces hardcode the chord instead of importing ` +
      `THROW_TASK_HOTKEY_LABEL, so a rebinding would leave a stale hint: ` +
      `${offenders.join(', ')}`,
  );
});

test('the panel has ONE desktop mount, and the spine footer is not it', () => {
  const footer = stripComments(readFileSync(join(SRC, FOOTER), 'utf8'));
  assert.doesNotMatch(
    footer,
    /<ThrowTaskPanel/,
    `${FOOTER} must not mount the panel — it is a trigger only. Two mounts means ` +
      `two independent open states over one panel, and the footer's copy would be ` +
      `unreachable whenever the spine is closed.`,
  );
  assert.match(footer, /openThrowTask\(\)/, 'the footer row must ask the host to open');
});

test('the host is mounted app-wide, not inside the lazily-mounted spine', () => {
  const layout = stripComments(readFileSync(join(SRC, HOST_MOUNT), 'utf8'));
  assert.match(
    layout,
    /<ThrowTaskHost \/>/,
    `${HOST_MOUNT} must mount ThrowTaskHost. SidebarNavColumn mounts on FIRST ` +
      `open over an unpersisted navOpen=false, so a host mounted in the spine ` +
      `would leave the chord dead on every fresh page load.`,
  );
});

test('the throw surface is not a sixth GlobalHeader icon', () => {
  // The actions cluster is rule-capped at five (find · goal · work order ·
  // inbox · assistant); a persistent top-right icon is earned by FREQUENCY.
  // Same ruling that moved clipboard history into the spine ⋯ drawer.
  const header = stripComments(
    readFileSync(join(SRC, 'components/layout/GlobalHeaderActions.tsx'), 'utf8'),
  );
  assert.doesNotMatch(header, /ThrowTask|openThrowTask/, 'the throw surface is a chord + a ⋯ row, not a header icon');
});
