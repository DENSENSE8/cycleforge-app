/**
 * Honest-absence aggregate guard (Phase 3d).
 *
 * Empty facts paint `GridCellDash` / `—`. Loading uses the shared skeleton
 * primitives. Literal `"N/A"` and leftover `animate-pulse` soup may only shrink.
 *
 * A genuine protocol/print `N/A` carries `ds-allow-na`. A real loading skeleton
 * lives under `Skeletons.tsx` / `*Skeleton*` / `OpsKpiBandSkeletonTile`.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { describe, it } from 'node:test';

const SRC = join(process.cwd(), 'src');
const NA_BASELINE = 0;
const PULSE_BASELINE = 70;
const NA_RE = /['"`]N\/A['"`]/g;
const ESCAPE = 'ds-allow-na';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (['.ts', '.tsx'].includes(extname(entry)) && !entry.includes('.test.')) out.push(full);
  }
  return out;
}

function isCommentLine(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

describe('honest-absence aggregate', () => {
  it('GridCellDash is the shipped empty-cell primitive', () => {
    const src = readFileSync(join(SRC, 'components/ui/grid-cells.tsx'), 'utf8');
    assert.match(src, /export function GridCellDash/);
    assert.match(src, /never "N\/A"/);
  });

  it('literal N/A soup does not grow', () => {
    let count = 0;
    for (const file of walk(SRC)) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (isCommentLine(line)) return;
        if (line.includes(ESCAPE) || (i > 0 && lines[i - 1].includes(ESCAPE))) return;
        count += (line.match(NA_RE) ?? []).length;
      });
    }
    assert.equal(
      count,
      0,
      `"N/A" UI writers must stay at 0 (live ${count}). Use GridCellDash / — . ` +
        `A protocol/print remainder carries \`${ESCAPE}\`.`,
    );
  });

  it('animate-pulse soup does not grow', () => {
    let count = 0;
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file).split('\\').join('/');
      if (rel.includes('Skeleton') || rel.includes('skeleton')) continue;
      const text = readFileSync(file, 'utf8');
      count += (text.match(/animate-pulse/g) ?? []).length;
    }
    assert.ok(
      count <= PULSE_BASELINE,
      `animate-pulse grew to ${count} (baseline ${PULSE_BASELINE}). Loading uses Skeletons / OpsKpiBandSkeletonTile. ` +
        `Settled-empty uses honest copy, not pulse. Do not raise — LOWER it.`,
    );
  });
});
