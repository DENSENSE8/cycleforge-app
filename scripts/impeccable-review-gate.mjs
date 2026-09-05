#!/usr/bin/env node
/**
 * Impeccable finish-reviewer — advisory, deep profile only (plan §7.4 steps 4, 6).
 *
 * The shipped reviewer is a model role (`.hermes/skills/impeccable/reference/degraded/finish-reviewer.md`),
 * not a CLI that scores the product. This gate collects the DIFF IMAGES the
 * reviewer would read, writes them onto the receipt under `review`, and never
 * blocks. Nightly (`CI_PROFILE=deep`) is when a human or agent session actually
 * runs the reviewer against those files.
 */
import { existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHA = process.env.CI_SHA ?? 'working-tree';
const REVIEW_DIR = path.join(ROOT, '.impeccable', 'review');
const DIFF_DIR = path.join(ROOT, 'test-results');
const SNAPSHOTS = path.join(ROOT, 'tests/e2e/visual-peers.spec.ts-snapshots');

function pngsUnder(dir, cap = 40) {
  if (!existsSync(dir)) return [];
  const out = [];
  const walk = (d) => {
    if (out.length >= cap) return;
    let entries = [];
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= cap) return;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith('.png')) out.push(path.relative(ROOT, p));
    }
  };
  walk(dir);
  return out;
}

const images = [
  ...pngsUnder(REVIEW_DIR),
  ...pngsUnder(DIFF_DIR).filter((p) => /diff|actual|expected/i.test(p)),
];
const baselines = existsSync(SNAPSHOTS) ? pngsUnder(SNAPSHOTS, 8) : [];

const payload = {
  gate: 'design-review',
  advisory: true,
  sha: SHA,
  skipped: images.length === 0,
  reason:
    images.length === 0
      ? 'no diff images this run — reviewer has nothing to read (plan §7.4: findings on the receipt, never a block)'
      : null,
  images,
  baselineSample: baselines,
  reviewer: '.hermes/skills/impeccable/reference/degraded/finish-reviewer.md',
};

const outDir = path.join(ROOT, '.ci', 'review');
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, `${SHA}.json`), `${JSON.stringify(payload, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
process.exit(0);
