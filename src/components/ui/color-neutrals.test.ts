import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { test } from 'node:test';

/**
 * Guards the raw-neutral → semantic-token migration (2026-07-04 theme audit,
 * Wave 3 — the "great token codemod").
 *
 * Neutral chrome comes from the theme registry's semantic aliases
 * (`bg-surface-card`, `text-text-default`, `border-border-soft`, …, bound to
 * `--ds-color-*` vars in src/design-system/themes/registry.ts) — never raw
 * neutral Tailwind utilities (`bg-white`, `text-gray-900`, `border-slate-200`).
 * Raw neutrals bypass the theme registry: they only look right in light mode
 * and force the dark-scheme remap (globals.css) to grow forever.
 *
 * ~11,600 raw neutrals were converted (codemod + context sweeps). The count is
 * now ZERO: themed tokens take alpha modifiers (function colors → color-mix),
 * media/overlay chrome uses the fixed stage/scrim/glass vocabulary, mid-dark
 * fills use the surface-inverse ladder, and the deliberately-literal remainder
 * (print ink, identity-hue registries, photo-overlay badges) carries explicit
 * `ds-allow-raw-neutral` markers.
 *
 * This guard RATCHETS the count — it must stay at zero. A genuinely-needed raw
 * neutral is exempt with a `ds-allow-raw-neutral` comment (same line or the
 * line above) stating WHY. `text-white` is out of scope (text on saturated
 * fills is scheme-independent), as are chart/dataviz hex arrays.
 */

const SRC_ROOT = join(process.cwd(), 'src');

const ESCAPE_MARKER = 'ds-allow-raw-neutral';
const RAW_NEUTRAL_RE =
  /(?<![\w/-])(?:[\w-]+:)*(?:bg|text|border(?:-[tbrlxyse])?|divide|ring)-(?:white|black|(?:gray|slate|zinc|stone|neutral)-\d{2,3})(?:\/\d{1,3})?(?![\w-])/g;

/** Deliberately out of scope (scheme-independent vocabulary). */
const OUT_OF_SCOPE = /(?:text|ring|border(?:-[tbrlxyse])?|divide)-white|(?:text|ring)-black/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (
      ['.ts', '.tsx'].includes(extname(entry)) &&
      !entry.endsWith('.guard.test.ts') &&
      entry !== 'color-neutrals.test.ts'
    ) {
      out.push(full);
    }
  }
  return out;
}

const ALL_SOURCE_FILES = walk(SRC_ROOT);

test('raw neutral utility classes do not grow (ratchet → theme-registry tokens)', () => {
  let count = 0;
  const offenders = new Map<string, number>();
  for (const file of ALL_SOURCE_FILES) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const matches = line.match(RAW_NEUTRAL_RE);
      if (!matches) return;
      if (line.includes(ESCAPE_MARKER) || (i > 0 && lines[i - 1].includes(ESCAPE_MARKER))) return;
      for (const m of matches) {
        if (OUT_OF_SCOPE.test(m)) continue;
        count += 1;
        offenders.set(m, (offenders.get(m) ?? 0) + 1);
      }
    });
  }
  const top = [...offenders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  assert.equal(
    count,
    0,
    `Raw neutral utility classes must stay at 0 (live ${count}). ` +
      `Use the theme-registry tokens instead: bg-surface-card/canvas/sunken/hover/strong, ` +
      `text-text-default/muted/soft/faint, border-border-hairline/soft/default (also as ring-/divide-). ` +
      `If a raw neutral is genuinely needed (alpha wash, deliberate dark chrome), add a ` +
      `\`${ESCAPE_MARKER}\` comment. ` +
      `Top offenders: ${top.map(([k, v]) => `${k}×${v}`).join(', ')}`,
  );
});
