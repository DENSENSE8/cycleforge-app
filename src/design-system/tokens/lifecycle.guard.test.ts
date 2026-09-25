/**
 * Guard — packed and shipped take their colour from LIFECYCLE, never a
 * per-surface pick.
 *
 * Packed is `fulfillment` (purple) and shipped is `success` (green) on every
 * surface and platform (`packages/design-tokens/src/lifecycle.ts`, owner ruling
 * 2026-09-24). Before this, packed read purple in `unit-status.ts`, green in
 * the timelines and the phone rail, blue in FBA and search, and amber in the
 * To-ship pill — each map had picked its own.
 *
 * Static check: any object entry in `src/` keyed exactly PACKED / SHIPPED /
 * packed / shipped whose value carries a colour — a Tailwind colour utility, a
 * hex, or a bare tone/hue word ('success', 'emerald', …) — must reach it
 * through LIFECYCLE (`LIFECYCLE_CLASSES.packed.pill`,
 * `LIFECYCLE.shipped.tone`, …). Non-colour vocabularies (`'neutral'`,
 * `'done'`, labels, counts) are out of scope.
 *
 *   npx tsx --test src/design-system/tokens/lifecycle.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { test } from 'node:test';
import { STATE_NAMES, STATE_TONES } from '@cycleforge/design-tokens';
import { contrastRatio } from '@/lib/color-contrast';

const SRC_ROOT = join(process.cwd(), 'src');

const KEY_RE = /^\s*['"]?(?:PACKED|SHIPPED|packed|shipped)['"]?\s*:\s*(.*)$/;

const COLOUR_UTILITY_RE =
  /(?<![\w-])(?:bg|text|border(?:-[tbrlxyse])?|ring|fill|stroke|outline|divide|decoration|from|via|to)-(?:fill-|surface-|border-|text-)?(?:success|warning|danger|info|fulfillment|accent|emerald|green|purple|violet|blue|indigo|amber|orange|red|rose|teal|yellow|sky|cyan|lime|pink|fuchsia)\b/;
const HEX_RE = /['"`]#[0-9a-fA-F]{3,8}['"`]/;
const TONE_WORD_RE =
  /['"`](?:success|warning|danger|error|info|fulfillment|emerald|green|purple|violet|blue|indigo|amber|orange|red|rose|teal|yellow|sky|cyan|lime|pink|fuchsia)['"`]/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (['.ts', '.tsx'].includes(extname(entry)) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** The entry's value: the rest of the key line, plus the body of a multi-line `{ … }`. */
function entryValue(lines: string[], i: number, head: string): string {
  let depth = 0;
  for (const ch of head) depth += ch === '{' ? 1 : ch === '}' ? -1 : 0;
  const parts = [head];
  for (let j = i + 1; depth > 0 && j < lines.length; j += 1) {
    parts.push(lines[j]);
    for (const ch of lines[j]) depth += ch === '{' ? 1 : ch === '}' ? -1 : 0;
  }
  return parts.join('\n');
}

function lifecycleColourOffenders(files: readonly string[]): string[] {
  const offenders: string[] = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const m = KEY_RE.exec(line);
      if (!m) return;
      const value = entryValue(lines, i, m[1]);
      if (value.includes('LIFECYCLE')) return;
      if (COLOUR_UTILITY_RE.test(value) || HEX_RE.test(value) || TONE_WORD_RE.test(value)) {
        offenders.push(`${relative(process.cwd(), file)}:${i + 1}  ${line.trim()}`);
      }
    });
  }
  return offenders;
}

test('packed / shipped status maps colour through LIFECYCLE', () => {
  const offenders = lifecycleColourOffenders(walk(SRC_ROOT));
  assert.deepEqual(
    offenders,
    [],
    'A packed/shipped entry picks its own colour. Read it from LIFECYCLE instead — ' +
      "`LIFECYCLE_CLASSES.packed.pill|dot|text|spine` (@/design-system/tokens/lifecycle) for class maps, " +
      '`LIFECYCLE.packed.tone` (a STATE_TONES key) for tone vocabularies:\n' +
      offenders.join('\n'),
  );
});

test('every solid state-code badge prints its code at ≥ 4.5:1 (BRIEF §8)', () => {
  for (const tone of STATE_NAMES) {
    const { code, codeInk } = STATE_TONES[tone];
    const ratio = contrastRatio(codeInk, code) ?? 0;
    assert.ok(ratio >= 4.5, `${tone}: ${codeInk} on ${code} is ${ratio.toFixed(2)}:1`);
  }
});
