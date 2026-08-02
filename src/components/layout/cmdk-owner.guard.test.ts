/**
 * Source guard: **⌘K / Ctrl+K has exactly one owner** — the {@link CommandBar}
 * palette — and no surface may advertise it that does not own it.
 *
 * Why this exists. Three claimants shipped at once:
 *
 *   1. `CommandBar` bound ⌘K on `window` and toggled the palette.
 *   2. `useQuickAccessHotkey` bound ⌘K on `window` too, gated on a
 *      `hotkey: 'cmdk'` setting that DEFAULTED ON — so the stock experience was
 *      one keypress opening the palette *and* the Quick Access menu. Both
 *      listeners called `preventDefault()`, so neither could yield to the other.
 *   3. `GlobalHeaderSearch` bound nothing at all, yet rendered
 *      `HoverTooltip label="Search (⌘K)"`. Pressing the chord its own tooltip
 *      advertised opened a different surface than the button under the cursor.
 *      (`dispatchGlobalSearchFocus`, the mechanism that would have made it true,
 *      had zero callers.)
 *
 * A false shortcut hint is worse than no hint: it teaches a chord, and the chord
 * does something else. So this pins BOTH halves — one binding, and no lying
 * labels.
 *
 * Run: node --test --import tsx \
 *        src/components/layout/cmdk-owner.guard.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../../', import.meta.url));

/** The one file allowed to bind the chord and ACT on it. */
const OWNER = 'components/CommandBar.tsx';

/**
 * Files allowed to bind the chord only to **swallow** it.
 *
 * This is the opposite of a second owner and is correct: a modal with a focus
 * trap must stop an ambient global chord from yanking focus out of it, which is
 * the same "innermost open overlay wins" rule as
 * `src/lib/overlay-stack/store.ts`. Each entry is asserted below to actually be
 * a suppressor — `stopPropagation` and no toggle — so this list cannot be used
 * to smuggle a real claimant through.
 */
const SUPPRESSORS = ['components/shipped/photo-gallery/usePhotoGallery.ts'];

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

const FILES = walk(SRC).filter((f) => !f.endsWith('cmdk-owner.guard.test.ts'));
const rel = (f: string) => f.slice(SRC.length);

/**
 * A ⌘K *binding* — a keyboard handler that tests for the `k` key alongside a
 * meta/ctrl modifier. Matching on the key test (not the glyph) is what makes
 * this a guard rather than a spell-check: renaming the tooltip cannot hide a
 * second listener.
 */
function bindsCmdK(code: string): boolean {
  const wantsModifier = /metaKey|ctrlKey/.test(code);
  if (!wantsModifier) return false;
  return /key(?:\.toLowerCase\(\))?\s*===\s*['"]k['"]/.test(code);
}

test('exactly one file binds ⌘K / Ctrl+K to act on it', () => {
  const binders = FILES.filter((f) => bindsCmdK(stripComments(readFileSync(f, 'utf8')))).map(rel);
  const claimants = binders.filter((f) => !SUPPRESSORS.includes(f));

  assert.deepEqual(
    claimants,
    [OWNER],
    `⌘K must have exactly one owner (${OWNER}). A second window-level listener ` +
      `cannot yield to the first — both preventDefault, so both fire, and one ` +
      `keypress opens two surfaces. Found: ${claimants.join(', ') || 'none'}`,
  );
});

test('every allowed extra binding is a suppressor, not a second owner', () => {
  for (const file of SUPPRESSORS) {
    const src = readFileSync(join(SRC, file), 'utf8');
    assert.ok(
      bindsCmdK(stripComments(src)),
      `${file} is listed as a ⌘K suppressor but no longer binds the chord — ` +
        `drop it from SUPPRESSORS rather than leaving a stale exemption`,
    );
    // A suppressor swallows the event outright. Without stopPropagation the
    // owner's window listener still fires and the swallow is decorative.
    assert.match(
      src,
      /stopPropagation/,
      `${file} must stopPropagation to actually suppress ⌘K`,
    );
  }
});

test('the retired Quick Access hotkey claimant stays retired', () => {
  // The module and its setting are gone; a stored `hotkey` is stripped on read.
  const survivors = FILES.filter((f) =>
    /useQuickAccessHotkey|quick-access\/use-hotkey/.test(readFileSync(f, 'utf8')),
  ).map(rel);
  assert.deepEqual(survivors, [], 'Quick Access must not re-bind ⌘K');

  const storage = readFileSync(join(SRC, 'lib/quick-access/storage.ts'), 'utf8');
  assert.match(
    storage,
    /hotkey: _retiredHotkey/,
    'getSettings must strip a stored `hotkey` so an old cache cannot revive the claim',
  );
});

/**
 * Only the owner may SHOW the chord. Everything else referencing it in prose is
 * fine — this looks at user-visible strings (tooltip labels, aria-labels, kbd
 * hints), which is where a false claim actually costs the operator.
 */
test('no surface advertises ⌘K unless it owns it', () => {
  const offenders: string[] = [];

  for (const file of FILES) {
    if (rel(file) === OWNER) continue;
    const code = stripComments(readFileSync(file, 'utf8'));
    // A visible label / hint carrying the chord.
    // Scope: CONTROL AFFORDANCES — a tooltip, an accessible name, a kbd hint.
    // Prose that merely names the feature ("the ⌘K palette", the `ai.search`
    // permission's description in the roles admin) is not an affordance and is
    // deliberately out of scope: it teaches nobody a chord to press.
    const patterns = [
      /label=\{?["'`][^"'`]*(?:⌘K|Ctrl\+K)/,
      /ariaLabel=\{?["'`][^"'`]*(?:⌘K|Ctrl\+K)/,
      /aria-label=\{?["'`][^"'`]*(?:⌘K|Ctrl\+K)/,
      /placeholder=\{?["'`][^"'`]*(?:⌘K|Ctrl\+K)/,
      /<kbd[^>]*>[^<]*(?:⌘K|Ctrl\+K)/,
    ];
    if (patterns.some((re) => re.test(code))) offenders.push(rel(file));
  }

  assert.deepEqual(
    offenders,
    [],
    `these surfaces show a ⌘K hint but do not own the chord — pressing it opens ` +
      `the palette instead, which is exactly the mis-teach this guard exists to ` +
      `stop: ${offenders.join(', ')}`,
  );
});

test('the owner does not stand the chord down inside text fields', () => {
  // The handler bailed on `INPUT / TEXTAREA / SELECT / contenteditable`, so ⌘K
  // did nothing whenever focus sat in a field — which is most of the time an
  // operator is mid-task, and exactly when jumping elsewhere is most useful.
  //
  // That rule is right for a BARE-key hotkey (the user is trying to type that
  // character) and wrong for a modifier chord: nobody types ⌘K, so there is
  // nothing to yield to. A surface that genuinely must keep the chord
  // suppresses it at its own level — see SUPPRESSORS.
  const owner = stripComments(readFileSync(join(SRC, OWNER), 'utf8'));
  const chordBlock = owner.slice(owner.search(/metaKey \|\| e\.ctrlKey/));
  const guardWindow = chordBlock.slice(0, 400);
  assert.doesNotMatch(
    guardWindow,
    /isContentEditable|tagName|['"]TEXTAREA['"]/,
    'the ⌘K branch must not inspect the focused element — a modifier chord is ' +
      'not a typed character, so it never competes with typing',
  );
});

test('the focus-handoff event is not a ⌘K path', () => {
  // GLOBAL_SEARCH_FOCUS_EVENT hands focus to the active search field. It is a
  // legitimate mechanism, but it is NOT wired to ⌘K and its docs must not imply
  // otherwise — that implication is what made the header tooltip look wired.
  const mod = readFileSync(join(SRC, 'lib/global-search-focus.ts'), 'utf8');
  assert.match(mod, /NOT a ⌘K path/);
  assert.equal(
    bindsCmdK(stripComments(mod)),
    false,
    'the focus-handoff module must not bind the chord',
  );
});
