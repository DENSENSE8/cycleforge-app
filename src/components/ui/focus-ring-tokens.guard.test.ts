import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { test } from 'node:test';

/**
 * Guards the focus-ring SoT (focus-ring axis; ratchet model from
 * raw-button.guard.test.ts).
 *
 * `focusRing()` (src/design-system/tokens/focus-ring.ts) is the single source
 * of truth for focus affordance — one canonical recipe per archetype
 * (field/control/wrapper) × semantic tone. The census found ~670 distinct
 * hand-rolled `focus:ring-*` recipes across 220 files. This is a long
 * migration (each site keeps its own resting chrome), so the guard RATCHETS:
 * the count of raw focus recipes outside the design system may only shrink.
 * New focus styling comes from `focusRing(...)`, composed via `cn()`.
 *
 * A genuinely one-off focus treatment (a bespoke overlay, a non-tone ring) is
 * exempt with a same-line `ds-allow-focus` comment. Use it sparingly.
 *
 * Set FOCUS_LIST=1 to print the offending files (migration aid).
 */

const SRC_ROOT = join(process.cwd(), 'src');

// Shrink-only baseline. LOWER as call sites adopt focusRing(); never raise.
// 2026-07-15: armed at 1075 (non-design-system raw focus-recipe occurrences,
// at land — concurrent commits nudged it from the 1073 first-measured).
// 2026-08-08: H1 premium-parity Phase D batch (StaffTable, TrackingException,
// AuditLogFilterStrip, AddOrPairSkuModal, SettingControl) → 831.
const RAW_FOCUS_BASELINE = 831;

const ESCAPE_MARKER = 'ds-allow-focus';
const LIST = process.env.FOCUS_LIST === '1';

// A hand-rolled focus recipe: a focus / focus-visible / focus-within variant
// on a ring / outline / border / shadow utility. Mirrors the census regex.
const RAW_FOCUS_RE = /focus(?:-visible|-within)?:(?:ring|outline|border|shadow)/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (['.ts', '.tsx'].includes(extname(entry))) out.push(full);
  }
  return out;
}

const ALL_SOURCE_FILES = walk(SRC_ROOT);

test('raw focus recipes outside the design system do not grow (ratchet toward focusRing())', () => {
  let count = 0;
  const files: string[] = [];
  for (const file of ALL_SOURCE_FILES) {
    const rel = relative(SRC_ROOT, file).split('\\').join('/');
    // The SoT + primitives that consume it legitimately carry focus classes;
    // guard files name the pattern.
    if (rel.startsWith('design-system/') || rel.endsWith('.guard.test.ts')) continue;
    let fileCount = 0;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const t = line.trimStart();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
      if (line.includes(ESCAPE_MARKER)) continue;
      fileCount += (line.match(RAW_FOCUS_RE) ?? []).length;
    }
    if (fileCount > 0) {
      count += fileCount;
      if (LIST) files.push(`  ${String(fileCount).padStart(3)}  ${rel}`);
    }
  }
  if (LIST) console.error(`raw focus recipes: ${count}\n${files.sort((a, b) => Number(b.trim().split(' ')[0]) - Number(a.trim().split(' ')[0])).join('\n')}`);
  assert.ok(
    count <= RAW_FOCUS_BASELINE,
    `Raw focus recipes grew to ${count} (baseline ${RAW_FOCUS_BASELINE}). Use ` +
      `focusRing(archetype, tone) from @/design-system/tokens/focus-ring via cn(), ` +
      `or mark a one-off \`${ESCAPE_MARKER}\`. Do not raise the baseline — LOWER it.`,
  );
});

test('keystone: the focus-ring SoT exists and the primitives consume it', () => {
  assert.ok(
    existsSync(join(SRC_ROOT, 'design-system/tokens/focus-ring.ts')),
    'focus-ring.ts (the SoT) must exist.',
  );
  const sot = readFileSync(join(SRC_ROOT, 'design-system/tokens/focus-ring.ts'), 'utf8');
  assert.ok(sot.includes('export function focusRing'), 'focus-ring.ts must export focusRing().');
  for (const archetype of ['field', 'control', 'wrapper']) {
    assert.ok(sot.includes(`'${archetype}'`) || sot.includes(archetype), `SoT must define the '${archetype}' archetype.`);
  }
  // The primitives grown-from must import the SoT (proves it is wired, not orphaned).
  for (const prim of ['Button.tsx', 'IconButton.tsx']) {
    const src = readFileSync(join(SRC_ROOT, `design-system/primitives/${prim}`), 'utf8');
    assert.ok(
      src.includes('focus-ring') && src.includes('focusRing('),
      `${prim} must consume focusRing() from the SoT.`,
    );
  }
});
