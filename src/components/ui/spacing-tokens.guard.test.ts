import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { test } from 'node:test';

/**
 * Guards the density-aware spacing system (spacing-token-leakage plan
 * Phase 4; structure cloned from typography-tokens.guard.test.ts).
 *
 * Tier 1: the numeric spacing scale (`p-3`, `gap-2`, …) is density-aware —
 * values live in `src/design-system/tokens/spacing.mjs`, wired via
 * `theme.extend.spacing`. Tier 2: named intents (`inset-*` / `stack-*` /
 * `row-*`) — a tailwind.config.mjs plugin + safelist, with `cf-*` conflict
 * groups registered in `cn()` (src/utils/_cn.ts). Tier 3: the
 * `Stack`/`Inset`/`Row` primitives compose Tier 2.
 *
 * These tests fail the moment someone hardcodes a NEW arbitrary-px spacing
 * value, or drops any piece of the Tailwind/cn wiring.
 */

const SRC_ROOT = join(process.cwd(), 'src');

// The Tier-2 spacing intents. Must stay in sync across the tailwind.config.mjs
// plugin, its safelist, and the cn() class groups — the keystone test below
// pins all three.
const INTENTS = [
  'inset-chip',
  'inset-field',
  'inset-cozy',
  'inset-card',
  'inset-empty',
  'stack-tight',
  'stack-row',
  'stack-section',
  'row-gap',
  'row-tight',
];

// A standalone padding/gap/space utility whose bracket value hardcodes a px
// length. Matches e.g. a p- of 3px, a gap- of 2px, a space-y- of 10px, or a
// pt- calc mixing env() with a px offset. (Examples are described in prose,
// not written as bracketed class tokens, so Tailwind's content scanner can't
// extract them from this comment and emit junk/invalid CSS — build-gotchas.md.)
// The `(?<![\w-])` boundary rejects lookalikes (scroll-pt lookalikes); variant prefixes
// (md:, hover:) still match because `:` passes the lookbehind. Margins are
// deliberately out of scope this wave.
const ARBITRARY_PX_SPACING_RE = /(?<![\w-])(?:p[xytblr]?|gap(?:-[xy])?|space-[xy])-\[[^\]]*px[^\]]*\]/g;

// Same-line escape hatch for genuine device/layout geometry (safe-area
// insets, fixed-overlay offsets). Anything else migrates to a Tier-1 step or
// a Tier-2 intent.
const ALLOW_MARKER = 'ds-allow-spacing';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (['.ts', '.tsx'].includes(extname(entry))) out.push(full);
  }
  return out;
}

// A pure-comment line (JSDoc `*`, `//`, `/*`) may reference the raw patterns
// to document them — those are not real class usages.
function isCommentLine(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

// This guard file names the banned pattern on purpose; exclude it.
const SELF = join(SRC_ROOT, 'components/ui/spacing-tokens.guard.test.ts');
const ALL_SOURCE_FILES = walk(SRC_ROOT).filter((f) => f !== SELF);

test('no NEW arbitrary-px spacing — use the density-aware scale or an intent', () => {
  const offenders: string[] = [];
  for (const file of ALL_SOURCE_FILES) {
    const rel = relative(SRC_ROOT, file).split('\\').join('/');
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (isCommentLine(line)) return;
      if (line.includes(ALLOW_MARKER)) return;
      for (const m of line.matchAll(ARBITRARY_PX_SPACING_RE)) {
        offenders.push(`  ${rel}:${i + 1}  ${m[0]}`);
      }
    });
  }
  assert.deepEqual(
    offenders,
    [],
    'Raw arbitrary-px spacing bypasses the density-aware scale. Use a Tier-1 ' +
      'step (p-1.5 / gap-2 / space-y-6 — the numeric scale is density-aware), ' +
      'a Tier-2 intent (inset-chip/field/cozy/card/empty, stack-*, row-*), or ' +
      'the Stack/Inset/Row primitives. Genuine safe-area/fixed-overlay ' +
      `geometry may carry a same-line ${ALLOW_MARKER} comment. Offending sites:\n` +
      offenders.join('\n'),
  );
});

test('keystone: the spacing scale + intents stay wired (tailwind, safelist, plugin, cn)', () => {
  const tw = readFileSync(join(process.cwd(), 'tailwind.config.mjs'), 'utf8');
  // Tier 1 — the density-aware scale drives theme.extend.spacing.
  assert.ok(
    tw.includes('./src/design-system/tokens/spacing.mjs'),
    'tailwind.config.mjs must import the spacing scale from spacing.mjs (.mjs — see build-gotchas).',
  );
  assert.ok(
    tw.includes('spacing: spacingScale'),
    'tailwind.config.mjs must wire theme.extend.spacing from spacingScale.',
  );
  // Tier 2 — every intent exists in BOTH the safelist (single-quoted) and the
  // plugin (double-quoted selector), so the three lists cannot drift apart.
  for (const intent of INTENTS) {
    assert.ok(tw.includes(`'${intent}'`), `safelist must carry '${intent}'.`);
    assert.ok(tw.includes(`".${intent}"`), `the intents plugin must define ".${intent}".`);
  }
  // cn() — without the cf-* groups, twMerge keeps BOTH of two same-kind
  // intents and stylesheet order silently decides the padding.
  const cnSrc = readFileSync(join(SRC_ROOT, 'utils/_cn.ts'), 'utf8');
  for (const group of ['cf-inset', 'cf-stack', 'cf-row']) {
    assert.ok(cnSrc.includes(`'${group}'`), `cn() must register the '${group}' class group.`);
  }
  for (const intent of INTENTS) {
    assert.ok(cnSrc.includes(`'${intent}'`), `cn() must list '${intent}' in its cf-* group.`);
  }
});
