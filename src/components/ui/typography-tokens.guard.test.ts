import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { test } from 'node:test';

import { MAX_FONT_WEIGHT } from '@/design-system/tokens/typography/weights';

/**
 * Guards the CF Type typography system (search-and-dense-ui-refactor plan §2).
 *
 * The old compact px scale (text-mini/eyebrow/micro/caption/label) was RETIRED
 * 2026-07-13 (T4) in favour of the role-bundled scale in `tailwind.config.ts`
 * (`text-role-display/title/body/data/caption/eyebrow/micro`), each bundling
 * size + line-height + tracking + weight, `rem`-based + density-aware. `cn()`
 * (src/utils/_cn.ts) teaches tailwind-merge about the role tokens so they
 * survive conflict resolution.
 *
 * These tests fail the moment someone reintroduces a raw arbitrary px size or a
 * deleted legacy token, or drops the `cn()` registration.
 */

const SRC_ROOT = join(process.cwd(), 'src');
const REPO_ROOT = process.cwd();

// The CF Type roles. Consumers pick a role; never a raw px.
const ROLE_TOKENS = [
  'role-display',
  'role-title',
  'role-body',
  'role-data',
  'role-caption',
  'role-eyebrow',
  'role-micro',
];

// The 5 legacy px tokens, deleted 2026-07-13 — must never reappear as classes.
const RETIRED_TOKENS = ['mini', 'eyebrow', 'micro', 'caption', 'label'];

// `text-[Npx]` as a standalone class (allows `:`/`-`-joined prefixes, rejects
// substrings of longer identifiers).
//
// The size is `\d+(?:\.\d+)?` — DECIMALS COUNT. An integer-only `\d+` shipped
// here until 2026-08-01 and let 73 half-pixel sites (`text-[8.5px]`,
// `text-[10.5px]`, `text-[11.5px]`, `text-[12.5px]`) accumulate in settings,
// admin, warehouse and the sidebar rails — invisible to a guard that asserts
// zero offenders. A half-pixel is not a smaller violation than a whole one; it
// is the same bypass of the density-aware `rem` scale, wearing a decimal.
const ARBITRARY_PX_RE = /(?<![A-Za-z0-9])text-\[(\d+(?:\.\d+)?)px\]/g;
// A retired legacy token as a standalone class (boundary-safe so it never
// matches e.g. `library-context-label`).
const retiredRe = (t: string) => new RegExp(`(?<![\\w-])text-${t}(?![\\w-])`, 'g');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (['.ts', '.tsx'].includes(extname(entry))) out.push(full);
  }
  return out;
}

// A pure-comment line (JSDoc `*`, `//`, `/*`) may reference the raw strings to
// document them — those are not real class usages.
function isCommentLine(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

// This guard file names the retired strings on purpose; exclude it.
const SELF = join(SRC_ROOT, 'components/ui/typography-tokens.guard.test.ts');
const ALL_SOURCE_FILES = walk(SRC_ROOT).filter((f) => f !== SELF);

test('no raw text-[Npx] — use CF Type roles or the Tailwind scale', () => {
  const offenders: string[] = [];
  for (const file of ALL_SOURCE_FILES) {
    const rel = relative(SRC_ROOT, file).split('\\').join('/');
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (isCommentLine(line)) return;
      for (const m of line.matchAll(ARBITRARY_PX_RE)) {
        offenders.push(`  ${rel}:${i + 1}  ${m[0]}`);
      }
    });
  }
  assert.deepEqual(
    offenders,
    [],
    'Raw arbitrary px bypasses the type scale. Use a CF Type role ' +
      '(text-role-body/data/caption/eyebrow/micro/title/display) for role text, ' +
      'or a Tailwind size (text-xl/2xl/3xl/4xl) for display/hero numbers. ' +
      'Offending sites:\n' + offenders.join('\n'),
  );
});

test('the retired legacy px tokens never reappear', () => {
  const offenders: string[] = [];
  for (const file of ALL_SOURCE_FILES) {
    const rel = relative(SRC_ROOT, file).split('\\').join('/');
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (isCommentLine(line)) return;
      for (const t of RETIRED_TOKENS) {
        if (retiredRe(t).test(line)) offenders.push(`  ${rel}:${i + 1}  text-${t}`);
      }
    });
  }
  assert.deepEqual(
    offenders,
    [],
    'text-mini/eyebrow/micro/caption/label were retired (T4) — use the CF Type ' +
      'role that fits the job:\n  mini/micro → text-role-micro · eyebrow → ' +
      'text-role-eyebrow · caption/label → text-role-caption · cells/IDs → ' +
      'text-role-data · body → text-role-body.\nOffending sites:\n' + offenders.join('\n'),
  );
});

/* ─── Weight cap (contextual-font-system, 2026-07-28) ──────────────────────
   600 is the ceiling. At 10–14px on a 1080p warehouse monitor, 700+ bleeds
   counters shut — it costs legibility instead of buying hierarchy, which here
   comes from color contrast, tracking, and the role scale. `next/font` no
   longer loads a 700 cut (src/lib/fonts.ts), so a surviving `font-bold` is
   synthesized faux-bold: worse than either real weight.
   Codemod: scripts/codemods/cap-font-weight.mjs. */
const HEAVY_WEIGHT_RE = /(?<![\w-])font-(black|extrabold|bold)(?![\w-])/g;

/** Printed media is a different substrate — ink on a 9px thermal label, not
 *  chrome on a monitor. Those files carry raw CSS weights on purpose. */
const WEIGHT_CAP_EXEMPT_DIRS = [join(SRC_ROOT, 'lib/print')];
const WEIGHT_CAP_EXEMPT_FILES = [join(SRC_ROOT, 'lib/repair/repair-paper-html.ts')];

test('no font weight above 600 — the cap is the type system, not a preference', () => {
  const offenders: string[] = [];
  for (const file of ALL_SOURCE_FILES) {
    if (WEIGHT_CAP_EXEMPT_DIRS.some((d) => file.startsWith(d + '/'))) continue;
    if (WEIGHT_CAP_EXEMPT_FILES.includes(file)) continue;
    const rel = relative(SRC_ROOT, file).split('\\').join('/');
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (isCommentLine(line)) return;
      // Genuine one-off (a print preview, a canvas measurement) opts out with a
      // same-line marker, matching the other DS ratchets.
      if (line.includes('ds-allow-weight')) return;
      for (const m of line.matchAll(HEAVY_WEIGHT_RE)) {
        offenders.push(`  ${rel}:${i + 1}  font-${m[1]}`);
      }
    });
  }
  assert.deepEqual(
    offenders,
    [],
    'Weights are capped at 600. Use `font-semibold`, or drop the class entirely ' +
      'when the CF Type role already bakes 600 (role-display/title/eyebrow/micro). ' +
      'Need more emphasis? Reach for contrast (text-text-default vs text-text-soft) ' +
      'or tracking — not ink. Genuine one-off: same-line `ds-allow-weight`.\n' +
      'Offending sites:\n' + offenders.join('\n'),
  );
});

test('the 700+ cuts are not loaded — a capped system must not ship the weight', () => {
  const src = readFileSync(join(SRC_ROOT, 'lib/fonts.ts'), 'utf8');
  for (const w of ['700', '800', '900']) {
    assert.ok(
      !src.includes(`'${w}'`),
      `src/lib/fonts.ts must not load the ${w} weight — the cap is ${MAX_FONT_WEIGHT}. ` +
        'Loading it is what lets it drift back in.',
    );
  }
});

test('no CF Type role bakes a weight above the cap', () => {
  // The roles are the one place a weight is applied without any class naming it,
  // so a drift here would be invisible at every call site.
  const src = readFileSync(join(REPO_ROOT, 'tailwind.config.ts'), 'utf8');
  const offenders: string[] = [];
  for (const m of src.matchAll(/'(role-[a-z]+)':\s*\[[^\]]*fontWeight:\s*'(\d+)'/g)) {
    if (Number(m[2]) > MAX_FONT_WEIGHT) offenders.push(`${m[1]} = ${m[2]}`);
  }
  assert.deepEqual(
    offenders,
    [],
    `CF Type roles must bake at most ${MAX_FONT_WEIGHT} (typography/weights.ts). ` +
      'Offending roles: ' + offenders.join(', '),
  );
});

/* ─── Family binding (three cuts of ONE macro-family) ──────────────────────── */

test('families.ts exposes exactly sans / condensed / mono', () => {
  const src = readFileSync(join(SRC_ROOT, 'design-system/tokens/typography/families.ts'), 'utf8');
  for (const slot of ['sans:', 'condensed:', 'mono:']) {
    assert.ok(src.includes(slot), `families.ts must define the '${slot}' stack.`);
  }
  // heading/display/label all aliased the sans stack — three names for one
  // decision, and a standing invitation to fork a display face. Deleted.
  for (const dead of ['heading:', 'display:', 'label:']) {
    assert.ok(
      !src.includes(dead),
      `families.ts must not reintroduce the '${dead}' slot — pick a ROLE, not a family. ` +
        'Dense chrome is text-role-eyebrow/micro (condensed is bound intrinsically).',
    );
  }
});

test('text-role-eyebrow / -micro bind the condensed cut intrinsically', () => {
  const src = readFileSync(join(REPO_ROOT, 'tailwind.config.ts'), 'utf8');
  assert.ok(
    src.includes('condensed:') && src.includes('--ds-font-condensed'),
    "tailwind.config.ts must register the condensed family on '--ds-font-condensed'.",
  );
  for (const role of ['.text-role-eyebrow', '.text-role-micro']) {
    const bound = new RegExp(
      `"${role.replace('.', '\\.')}":\\s*\\{\\s*fontFamily:\\s*"var\\(--ds-font-condensed\\)"`,
    );
    assert.ok(
      bound.test(src),
      `${role} must bind fontFamily: var(--ds-font-condensed) in the CF Type plugin. ` +
        'Contextuality here is WIDTH, and it belongs to the role — an opt-in ' +
        '`font-condensed` beside the role drifts the moment someone forgets it.',
    );
  }
});

test('cn() registers the CF Type role tokens with tailwind-merge (keystone)', () => {
  const src = readFileSync(join(SRC_ROOT, 'utils/_cn.ts'), 'utf8');
  // Without this, twMerge mis-groups e.g. `text-role-body` as a text COLOR and
  // drops it when a real text color is also present.
  assert.ok(
    src.includes('extendTailwindMerge') && src.includes("'font-size'"),
    "cn() must extend tailwind-merge's 'font-size' group with the role tokens.",
  );
  for (const token of ROLE_TOKENS) {
    assert.ok(
      src.includes(`'${token}'`),
      `cn() must register the '${token}' font-size token with tailwind-merge.`,
    );
  }
});
