import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { test } from 'node:test';

/**
 * Guards the IconButton control-size contract (control-size axis; ratchet
 * model borrowed from raw-button.guard.test.ts).
 *
 * `IconButton` (src/design-system/primitives/IconButton.tsx) owns a fixed
 * square hit-box via `size` (xs/sm/md/lg/touch). Historically ~80 call sites
 * hand-set the box with a className `h-N w-N` (the census found 14 distinct
 * height values), so the box, centering, and tap-target drift per site. This
 * is a migration, not a one-shot codemod (each site keeps its own
 * rounded/hover/padding chrome), so the guard RATCHETS: the count of
 * IconButton call sites that hand-set a box size may only shrink. Migrate a
 * site by passing `size=` and dropping the `h-N w-N` (+ flex-centering) from
 * className.
 *
 * A genuinely bespoke box (e.g. a non-square pill toggle) is exempt with a
 * `ds-allow-control-size` marker inside the call. Use it sparingly.
 *
 * Set CTRL_SIZE_LIST=1 to print the offending sites (migration aid).
 */

const SRC_ROOT = join(process.cwd(), 'src');

// Shrink-only baseline. LOWER as call sites adopt `size=`; never raise.
// 2026-07-14: armed at 178 (the real count — ~47% of 382 IconButton call
// sites hand-set a box, confirming the census). Drops as the follow-on
// codemod migrates canonical `h-N w-N` sites to `size=`.
const OVERRIDE_BASELINE = 178;

const ESCAPE_MARKER = 'ds-allow-control-size';
const LIST = process.env.CTRL_SIZE_LIST === '1';

// A box-size utility on the BUTTON: h-N / w-N / min-h / min-w / size-N, plain
// or arbitrary (`h-[22px]`). Boundary-safe so `overflow-hidden`-style words
// and `gap-`/`px-` never match.
const BOX_SIZE_RE =
  /(?<![\w-])(?:min-)?[hw]-(?:\[[^\]]*\]|[\d.]+)|(?<![\w-])size-(?:\[[^\]]*\]|[\d.]+)/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (['.ts', '.tsx'].includes(extname(entry))) out.push(full);
  }
  return out;
}

// Extract the full `<IconButton … />` tag starting at `start`, tracking {}
// depth and string literals so a nested self-closing glyph (icon={<Check />})
// never terminates the scan early. Returns the tag text.
function extractTag(text: string, start: number): string {
  let depth = 0;
  let str: string | null = null;
  for (let i = start; i < text.length; i += 1) {
    const c = text[i];
    if (str) {
      if (c === str && text[i - 1] !== '\\') str = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') str = c;
    else if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (depth === 0 && c === '/' && text[i + 1] === '>') return text.slice(start, i + 2);
    else if (depth === 0 && c === '>' && text[i - 1] !== '/') return text.slice(start, i + 1);
  }
  return text.slice(start);
}

// Remove the balanced `icon={…}` prop so a glyph's own `h-4 w-4` className is
// not mistaken for the button's box size.
function stripIconProp(blob: string): string {
  const k = blob.indexOf('icon={');
  if (k === -1) return blob;
  let depth = 0;
  let str: string | null = null;
  let i = k + 5;
  for (; i < blob.length; i += 1) {
    const c = blob[i];
    if (str) {
      if (c === str && blob[i - 1] !== '\\') str = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') str = c;
    else if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return blob.slice(0, k) + blob.slice(i + 1);
}

// The className value(s) on the button (plain, template, cn(), or expression).
function buttonClassText(blob: string): string {
  const stripped = stripIconProp(blob);
  return [
    ...stripped.matchAll(
      /className=\s*(?:"([^"]*)"|\{`([^`]*)`\}|\{cn\(([\s\S]*?)\)\}|\{([^}]*?)\})/g,
    ),
  ]
    .map((m) => m[1] ?? m[2] ?? m[3] ?? m[4] ?? '')
    .join(' ');
}

const ALL_SOURCE_FILES = walk(SRC_ROOT);

test('IconButton box-size overrides do not grow (ratchet toward size=)', () => {
  let count = 0;
  const offenders: string[] = [];
  for (const file of ALL_SOURCE_FILES) {
    const rel = relative(SRC_ROOT, file).split('\\').join('/');
    if (rel.startsWith('design-system/') || rel.endsWith('.guard.test.ts')) continue;
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/<IconButton\b/g)) {
      const blob = extractTag(text, m.index ?? 0);
      if (blob.includes(ESCAPE_MARKER)) continue;
      if (BOX_SIZE_RE.test(buttonClassText(blob))) {
        count += 1;
        if (LIST) offenders.push(`  ${rel}:${text.slice(0, m.index).split('\n').length}`);
      }
    }
  }
  if (LIST) console.error(`control-size overrides: ${count}\n${offenders.join('\n')}`);
  assert.ok(
    count <= OVERRIDE_BASELINE,
    `IconButton box-size overrides grew to ${count} (baseline ${OVERRIDE_BASELINE}). ` +
      `Pass a \`size\` (xs/sm/md/lg/touch) and drop the \`h-N w-N\` from className, ` +
      `or mark a bespoke box \`${ESCAPE_MARKER}\`. Do not raise the baseline — LOWER it.`,
  );
});

test('keystone: the IconButton size scale stays intact and touch.ts stays retired', () => {
  const ib = readFileSync(join(SRC_ROOT, 'design-system/primitives/IconButton.tsx'), 'utf8');
  assert.ok(ib.includes('export type IconButtonSize'), 'IconButton must export IconButtonSize.');
  for (const size of ['xs', 'sm', 'md', 'lg', 'touch']) {
    assert.ok(
      new RegExp(`(?<![\\w])${size}:`).test(ib),
      `IconButton sizeClassName must define '${size}'.`,
    );
  }
  // touch.ts was folded into IconButton (`size="touch"` = the 44px tap floor);
  // it must not come back as a parallel size vocabulary.
  assert.ok(
    !existsSync(join(SRC_ROOT, 'design-system/tokens/touch.ts')),
    'tokens/touch.ts was retired — its 44px tap floor lives in IconButton size="touch".',
  );
});
