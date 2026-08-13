import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { test } from 'node:test';

/**
 * Guards the surface/box primitive (surface/box axis; ratchet model from
 * raw-button.guard.test.ts).
 *
 * `Panel` (src/design-system/primitives/Panel.tsx) is the canonical static
 * surface — its default render IS `rounded-2xl border border-border-soft
 * bg-surface-card shadow-sm`; `SectionCard` (monitor rollup zones) and
 * `CardShell` (selectable/animated list rows) are its region-contract
 * siblings. The census found ~1,264 hand-rolled box shells vs ~25 primitive
 * uses (~1.9% adoption). This is a long migration, so the guard RATCHETS: the
 * count of lines that hand-roll the canonical Panel shell may only shrink.
 * Compose `<Panel>` (or `SectionCard`/`CardShell`) instead of re-typing the
 * shell.
 *
 * Signature = `rounded-2xl` + `border-border-soft` + `bg-surface-card` on one
 * line. `rounded-2xl` (the card radius) is what makes this precise — inputs
 * use `rounded-lg`, chips `rounded-full`, so they don't trip it.
 *
 * A genuinely bespoke surface (a one-off modal chrome, a shell a prop can't
 * express) is exempt with a same-line `ds-allow-box` comment. Use it sparingly.
 *
 * Set BOX_LIST=1 to print the offending files (migration aid).
 */

const SRC_ROOT = join(process.cwd(), 'src');

// Shrink-only baseline. LOWER as call sites compose <Panel>; never raise.
// 2026-07-15: armed at 130 (non-design-system hand-rolled canonical shells —
// lines carrying rounded-2xl + border-border-soft + bg-surface-card; set to
// the actual count at land, a concurrent commit having nudged it off 129).
const HANDROLLED_SHELL_BASELINE = 18;

const ESCAPE_MARKER = 'ds-allow-box';
const LIST = process.env.BOX_LIST === '1';

// The canonical Panel shell — all three tokens present on one line.
const SHELL_TOKENS = ['rounded-2xl', 'border-border-soft', 'bg-surface-card'];
// Shape-based card: any soft radius + the Panel fill/border. Nested fields
// (`WORKSPACE_NESTED_FIELD` = rounded-none) are not cards.
const SHAPE_RADIUS = /rounded-(?:sm|md|lg|xl|2xl|3xl)\b/;
const HANDROLLED_SHAPE_SHELL_BASELINE = 213;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (['.ts', '.tsx'].includes(extname(entry))) out.push(full);
  }
  return out;
}

function isCommentLine(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

const ALL_SOURCE_FILES = walk(SRC_ROOT);

test('hand-rolled Panel shells do not grow (ratchet toward <Panel>)', () => {
  let count = 0;
  const files: string[] = [];
  for (const file of ALL_SOURCE_FILES) {
    const rel = relative(SRC_ROOT, file).split('\\').join('/');
    // The primitives define the shell; guard files name it.
    if (rel.startsWith('design-system/') || rel.endsWith('.guard.test.ts')) continue;
    let fileCount = 0;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (isCommentLine(line) || line.includes(ESCAPE_MARKER)) continue;
      if (SHELL_TOKENS.every((tok) => line.includes(tok))) fileCount += 1;
    }
    if (fileCount > 0) {
      count += fileCount;
      if (LIST) files.push(`  ${String(fileCount).padStart(3)}  ${rel}`);
    }
  }
  if (LIST) console.error(`hand-rolled shells: ${count}\n${files.sort((a, b) => Number(b.trim().split(' ')[0]) - Number(a.trim().split(' ')[0])).join('\n')}`);
  assert.ok(
    count <= HANDROLLED_SHELL_BASELINE,
    `Hand-rolled Panel shells grew to ${count} (baseline ${HANDROLLED_SHELL_BASELINE}). ` +
      `Compose <Panel> (generic surface), <SectionCard> (monitor zones), or ` +
      `<CardShell> (selectable rows) instead of re-typing rounded-2xl + ` +
      `border-border-soft + bg-surface-card. A true one-off carries a same-line ` +
      `\`${ESCAPE_MARKER}\`. Do not raise the baseline — LOWER it.`,
  );
});

test('hand-rolled soft-radius card shells do not grow (shape ratchet toward Panel)', () => {
  let count = 0;
  for (const file of ALL_SOURCE_FILES) {
    const rel = relative(SRC_ROOT, file).split('\\').join('/');
    if (rel.startsWith('design-system/') || rel.endsWith('.guard.test.ts') || rel.endsWith('.test.ts')) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (isCommentLine(line) || line.includes(ESCAPE_MARKER)) continue;
      if (line.includes('WORKSPACE_NESTED_FIELD')) continue;
      if (
        SHAPE_RADIUS.test(line) &&
        line.includes('border-border-soft') &&
        line.includes('bg-surface-card')
      ) {
        count += 1;
      }
    }
  }
  assert.ok(
    count <= HANDROLLED_SHAPE_SHELL_BASELINE,
    `Soft-radius card shells grew to ${count} (baseline ${HANDROLLED_SHAPE_SHELL_BASELINE}). ` +
      `Compose <Panel>. Nested fields keep WORKSPACE_NESTED_FIELD. Do not raise — LOWER it.`,
  );
});

test('keystone: Panel is the canonical box shell', () => {
  const panel = readFileSync(join(SRC_ROOT, 'design-system/primitives/Panel.tsx'), 'utf8');
  assert.ok(panel.includes('export const Panel'), 'Panel.tsx must export Panel.');
  // Panel's default chrome IS the canonical shell; if these move, the guard
  // signature above must move with them.
  for (const tok of ['bg-surface-card', 'border-border-soft']) {
    assert.ok(panel.includes(tok), `Panel must render the canonical shell token '${tok}'.`);
  }
});
