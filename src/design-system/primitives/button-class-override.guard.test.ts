/**
 * Shrink-only Button className-paint baseline.
 *
 * Slate/gray/zinc hues on `<Button>` are a hard ESLint ban (already at 0).
 * This guard parks the remaining paint family (rounded-2xl, bg-red-50,
 * text-blue-600, …) so a NEW file cannot land a one-off visual variant.
 * When a listed file is cleaned, drop it from the baseline — never add.
 *
 * Write: BUTTON_PAINT_WRITE=1 node --import tsx --test this-file
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const BASELINE = join(
  ROOT,
  'src/design-system/primitives/button-class-override-baseline.json',
);

/** Hue / radius / named-color overrides that belong on a Button variant. */
const PAINT =
  /\b(?:bg|from|to|via|hover:bg|active:bg|hover:text)-(?:slate|gray|zinc|neutral|blue|red|rose|emerald|green|amber|yellow|navy|indigo|sky|cyan)-\d|\brounded-(?:sm|md|lg|xl|2xl|full)\b|\btext-(?:slate|gray|zinc|blue|red|rose|emerald)-\d/;

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTsx(p, out);
    else if (name.endsWith('.tsx') && !name.includes('.test.')) out.push(p);
  }
  return out;
}

function paintedButtonFiles(): string[] {
  const hits = new Set<string>();
  for (const file of walkTsx(SRC)) {
    const src = readFileSync(file, 'utf8');
    const re = /<Button\b([^>]*?)>/gs;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      if (/\bclassName\s*=/.test(m[1]) && PAINT.test(m[1])) {
        hits.add(relative(ROOT, file).replaceAll('\\', '/'));
        break;
      }
    }
  }
  return [...hits].sort();
}

describe('Button className paint — shrink-only', () => {
  const live = paintedButtonFiles();
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as {
    files: string[];
  };
  const allowed = new Set(baseline.files);

  it('does not introduce paint overrides on a new file', () => {
    const newcomers = live.filter((f) => !allowed.has(f));
    assert.deepEqual(
      newcomers,
      [],
      `New <Button className> paint (hue/radius) — use a semantic variant or grow Button:\n  ${newcomers.join('\n  ')}`,
    );
  });

  it('baseline only shrinks', () => {
    const extra = baseline.files.filter((f) => !live.includes(f));
    if (process.env.BUTTON_PAINT_WRITE === '1' && extra.length > 0) {
      writeFileSync(BASELINE, `${JSON.stringify({ files: live }, null, 2)}\n`);
      return;
    }
    assert.deepEqual(
      extra,
      [],
      `Paint baseline can shrink — drop cleaned files from button-class-override-baseline.json:\n  ${extra.join('\n  ')}\n` +
        'Or re-run with BUTTON_PAINT_WRITE=1.',
    );
  });
});
