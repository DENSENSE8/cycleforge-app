import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { test } from 'node:test';

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
const ARBITRARY_PX_RE = /(?<![A-Za-z0-9])text-\[(\d+)px\]/g;
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
