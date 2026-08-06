import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { test } from 'node:test';
import { cornerClass, nestedCorner, type CornerRole } from './radius';

/**
 * Guards the corner-radius system (structure cloned from
 * spacing-tokens.guard.test.ts).
 *
 * The radius scale is 100% Tailwind STOCK — `tailwind.config.ts` deliberately
 * does not extend `borderRadius`. Semantic corners come from
 * `cornerClass(role)` / `nestedCorner(outer, padStep)` in `tokens/radius.ts`.
 *
 * This is a RATCHET, not a migration: the ~3,900 existing `rounded-*` classes
 * are correct and are not offenders. Only two things fail here —
 *   1. a NEW arbitrary-value radius (`rounded-[…]`), which bypasses the scale;
 *   2. re-introducing a custom `borderRadius` key in tailwind.config.ts.
 */

const SRC_ROOT = join(process.cwd(), 'src');

/**
 * Arbitrary-value radius utilities. Matches `rounded-[20px]`,
 * `!rounded-[24px]`, `md:rounded-[5px]`, and the side variants
 * (`rounded-t-[…]`, `rounded-bl-[…]`). The `(?<![\w-])` boundary keeps
 * lookalike class fragments out; a leading `!` or a `variant:` prefix still
 * matches because neither `!` nor `:` is a word character.
 */
const ARBITRARY_RADIUS_RE = /(?<![\w-])rounded(?:-(?:[tblr]|[tb][lr]|[xy]))?-\[[^\]]+\]/g;

/** Same-line escape for a genuine one-off (a device-specific mobile shape). */
const ALLOW_MARKER = 'ds-allow-radius';

/**
 * Known arbitrary-radius sites, by file → count. **This map only shrinks.**
 * Never raise a number or add a key to make a change land: migrate to
 * `cornerClass(role)` (or add a same-line `ds-allow-radius` for a real one-off).
 *
 * The mobile-redesign entries are a deliberate 18/24/28/32px shape language
 * that has no stock equivalent — they are the most likely to earn a permanent
 * `ds-allow-radius` rather than a migration.
 */
const KNOWN_ARBITRARY: Record<string, number> = {
  'components/mobile/redesign/Receive.tsx': 3,
  'components/mobile/redesign/PrepackedProductSheet.tsx': 2,
  'components/ui/BottomSheet.tsx': 1,
  'components/po-gmail/PoMailboxPreviewPanel.tsx': 1,
  'components/mobile/redesign/ScanInput.tsx': 1,
  'components/mobile/redesign/DesignSystem.tsx': 1,
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (['.ts', '.tsx'].includes(extname(entry))) out.push(full);
  }
  return out;
}

/** A pure-comment line may name the banned pattern to document it. */
function isCommentLine(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

// This guard file names the banned pattern on purpose; exclude it.
const SELF = join(SRC_ROOT, 'design-system/tokens/radius-tokens.guard.test.ts');
const ALL_SOURCE_FILES = walk(SRC_ROOT).filter((f) => f !== SELF);

test('no NEW arbitrary-value radius — the ratchet only shrinks', () => {
  const counts: Record<string, number> = {};
  const sites: Record<string, string[]> = {};

  for (const file of ALL_SOURCE_FILES) {
    const rel = relative(SRC_ROOT, file).split('\\').join('/');
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (isCommentLine(line)) return;
      if (line.includes(ALLOW_MARKER)) return;
      for (const m of line.matchAll(ARBITRARY_RADIUS_RE)) {
        counts[rel] = (counts[rel] ?? 0) + 1;
        (sites[rel] ??= []).push(`  ${rel}:${i + 1}  ${m[0]}`);
      }
    });
  }

  const regressions: string[] = [];
  for (const [file, n] of Object.entries(counts)) {
    const allowed = KNOWN_ARBITRARY[file] ?? 0;
    if (n > allowed) {
      regressions.push(
        `  ${file}: ${n} arbitrary radii, baseline ${allowed}\n${sites[file].join('\n')}`,
      );
    }
  }
  assert.deepEqual(
    regressions,
    [],
    'An arbitrary-value radius bypasses the scale. Use cornerClass(role) — ' +
      'chip 4 · row 6 · control 8 · field 12 · card 16 · canvas 24 · pill — or ' +
      'nestedCorner(outer, padStep) for a box inside a rounded container. A ' +
      `genuine one-off may carry a same-line ${ALLOW_MARKER} comment. ` +
      'NEVER raise a KNOWN_ARBITRARY count to land a change:\n' +
      regressions.join('\n'),
  );

  // Shrink-only: a file that has been cleaned must drop out of the map, so the
  // baseline can never quietly drift back up.
  const stale = Object.keys(KNOWN_ARBITRARY).filter(
    (file) => (counts[file] ?? 0) < KNOWN_ARBITRARY[file],
  );
  assert.deepEqual(
    stale,
    [],
    'These files now have FEWER arbitrary radii than their baseline — lower ' +
      'or remove their KNOWN_ARBITRARY entries so the ratchet holds:\n  ' +
      stale.map((f) => `${f}: actual ${counts[f] ?? 0}, baseline ${KNOWN_ARBITRARY[f]}`).join('\n  '),
  );
});

test('keystone: the radius scale stays 100% Tailwind stock', () => {
  const tw = readFileSync(join(process.cwd(), 'tailwind.config.ts'), 'utf8');
  // A custom borderRadius key is an unregistered class group in cn() — twMerge
  // cannot tell it is a radius, so it and a primitive's own rounded-* BOTH
  // survive and stylesheet order silently picks. That is exactly what the
  // retired `station: '8px'` alias did.
  const extendsRadius = /borderRadius\s*:\s*\{/.test(tw.replace(/\/\/[^\n]*/g, ''));
  assert.equal(
    extendsRadius,
    false,
    'tailwind.config.ts must NOT extend theme.borderRadius. Add a semantic role ' +
      'to cornerClass() in tokens/radius.ts instead — it returns stock classes, ' +
      'which cn() already conflict-resolves correctly.',
  );
});

test('keystone: the cornerClass ladder maps roles to stock classes', () => {
  // Zero-radius industrial: every non-pill role is flush (0b/0c/0d/0e).
  // pill is the one surviving radius (status dots · avatars · Switch).
  const expected: Array<[CornerRole, string]> = [
    ['flush', 'rounded-none'],
    ['chip', 'rounded-none'],
    ['row', 'rounded-none'],
    ['control', 'rounded-none'],
    ['field', 'rounded-none'],
    ['card', 'rounded-none'],
    ['canvas', 'rounded-none'],
    ['pill', 'rounded-full'],
  ];
  for (const [role, cls] of expected) {
    assert.equal(cornerClass(role), cls, `cornerClass('${role}') must be ${cls}`);
  }
  // The concentric helper must stay on the same ladder — a role it returns has
  // to be one the map knows, or callers get an undefined class.
  for (const outer of expected.map(([r]) => r)) {
    for (const pad of [0, 1, 2, 3, 4, 6]) {
      const inner = nestedCorner(outer, pad);
      assert.ok(
        cornerClass(inner),
        `nestedCorner('${outer}', ${pad}) returned '${inner}', which has no class`,
      );
    }
  }
});
