import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { test } from 'node:test';

/**
 * Guards the native-`title` → hover-hint migration.
 *
 * A bare `title` attribute is the browser's own tooltip: it waits about a
 * second, cannot be themed, cannot carry keycaps, never appears on touch, and
 * on a desk it is the ONE piece of chrome that does not follow the pointer like
 * everything else does. The house hint is {@link HoverTooltip} — one trigger
 * that routes a MOUSE hover to the cursor chip (`MorphCursorLayer`) and
 * everything else (focus, touch, reduced motion, prose) to the anchored
 * `role="tooltip"` bubble.
 *
 * `MorphCursorLayer.resolveTitle` already LIFTS a short title onto the chip, so
 * a leftover `title` is not invisible — it is just authored in the weakest
 * place, with no focus path and no control over length. This ratchet stops new
 * ones from appearing rather than pretending the existing ones are broken.
 *
 * ## What is legitimately still a `title`
 *
 * Three jobs, all exempt with a `ds-allow-title` marker on the same line or the
 * line above, stating why:
 *
 * 1. **Required accessible names.** `<iframe title>` is the element's name, not
 *    a tooltip. Porting one would be a bug.
 * 2. **Truncation reveal.** A clipped cell showing `title={row.sku}` discloses
 *    the full value. This is dynamic DATA, not authored help — and one
 *    anchored portal per row is exactly the cost the cursor chip exists to
 *    avoid (the layer lifts these onto the chip for free).
 * 3. **Structural triggers.** A child of `PopoverTrigger asChild` (or any
 *    clone-and-ref parent) cannot be wrapped without handing the ref to a
 *    component that does not forward one.
 *
 * ## What must NOT be a `title`
 *
 * Authored help on an icon-only control, anything teaching a chord (that is
 * {@link HotkeyTooltip} — a chord belongs in keycaps, never folded into text
 * like `"Search (⌘K)"`), and anything longer than one line.
 */

const SRC_ROOT = join(process.cwd(), 'src');

const ESCAPE_MARKER = 'ds-allow-title';

/**
 * `title=` on a lowercase (DOM) element only. `<DetailCard title="…">` and
 * friends are component props with nothing to do with tooltips, so the match
 * is qualified by the nearest opening tag below.
 */
const TITLE_RE = /\btitle=(?:\{[^}]{1,200}\}|"[^"]{1,200}")/g;

/**
 * Shrink-only. LOWER as sites port to HoverTooltip; never raise.
 *
 * 2026-09-06: armed at 68, the live count after the first sweep. That sweep
 * ported the icon-only controls whose title was their ONLY explanation
 * (`DataTableFullscreenToggle`, `InlineEditableValue`), deleted the chord
 * folded into text on the spine search row (`"Search (⌘K)"` — the row already
 * paints the word and the keycap), and marked the reviewed exemptions. The
 * remainder is dominated by truncation reveals over dynamic data, which the
 * cursor layer already lifts onto the chip; port those only if a site gains a
 * real authored hint, and mark the rest as you review them.
 *
 * 2026-09-06b: 68 → 65 after reviewing `SlicedActionDock`. Its six titles are
 * exempt on purpose: two are Radix trigger children (a wrapper would take the
 * ref Radix needs), two are menu-item rows (one portal per item is the cost
 * the cursor chip exists to delete), and two sit on ref-carrying / motion
 * segments the dock measures itself. All six already ride the chip via
 * title-lift; wrapping the primitive would put 17 consumers at risk for a
 * focus-path gain, so it is a deliberate follow-up, not an oversight.
 */
const NATIVE_TITLE_BASELINE = 65;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (extname(entry) === '.tsx' && !entry.includes('.test.')) out.push(full);
  }
  return out;
}

/** True when the nearest opening tag before `index` is a DOM element. */
function onDomElement(source: string, index: number): boolean {
  const before = source.slice(Math.max(0, index - 400), index);
  const tags = [...before.matchAll(/<([A-Za-z][\w.]*)/g)];
  const last = tags[tags.length - 1]?.[1];
  return Boolean(last) && /^[a-z]/.test(last!);
}

test('native `title` tooltips do not grow (ratchet → HoverTooltip)', () => {
  let count = 0;
  const offenders: string[] = [];
  for (const file of walk(SRC_ROOT)) {
    const source = readFileSync(file, 'utf8');
    const lines = source.split('\n');
    for (const match of source.matchAll(TITLE_RE)) {
      if (!onDomElement(source, match.index)) continue;
      const line = source.slice(0, match.index).split('\n').length - 1;
      const exempt =
        lines[line]?.includes(ESCAPE_MARKER) || lines[line - 1]?.includes(ESCAPE_MARKER);
      if (exempt) continue;
      count += 1;
      if (offenders.length < 8) {
        offenders.push(`${file.replace(`${SRC_ROOT}/`, '')}:${line + 1}  ${match[0].slice(0, 60)}`);
      }
    }
  }
  assert.ok(
    count <= NATIVE_TITLE_BASELINE,
    `Native \`title\` tooltips must not grow (baseline ${NATIVE_TITLE_BASELINE}, live ${count}). ` +
      'Authored help on a control belongs in <HoverTooltip label="…">, and a chord belongs in ' +
      '<HotkeyTooltip action="…" chord="…"> as keycaps — never folded into label text. ' +
      'If the title is an iframe accessible name, a truncation reveal for dynamic data, or a ' +
      `clone-and-ref trigger child, mark it \`${ESCAPE_MARKER}\` with the reason.\n` +
      offenders.join('\n'),
  );
});
