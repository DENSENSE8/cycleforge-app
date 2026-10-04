#!/usr/bin/env node

/**
 * Adjudicate ONE file against the design consolidation ledger (ds_ledger).
 *
 *   node scripts/design-ledger-file-guard.mjs --file <repo-relative path> [--json]
 *
 * Reads the same docs/design-system/consolidation-ledger.json as the verify
 * gate (scripts/design-consolidation-guard.mjs) and answers, before a write:
 *
 * - violation `retired-path`: the file lives where a retired fork was deleted.
 * - violation `retired-source`: the file contains a retired entry's forbiddenSource
 *   needle. This is exactly what fails `pnpm verify:fast`.
 * - advisory `on-delete-list`: the file is a currentPath of a queued / in-progress
 *   entry. Reuse the replacement; do not grow the fork.
 * - advisory `imports-delete-list`: the file imports a module under such a path.
 *
 * Exit: 0 pass or advisory only, 1 violation (the verdict is the payload),
 * 2 tool error. A path that does not exist yet is adjudicated by path alone.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';

const ROOT = process.cwd();
const LEDGER_PATH = 'docs/design-system/consolidation-ledger.json';
const EXTENSION = /\.(?:tsx?|jsx?|mjs|cjs)$/;

const argv = process.argv.slice(2);
const fileFlag = argv.find((a) => a.startsWith('--file='));
const fileIdx = argv.indexOf('--file');
const rawFile = fileFlag ? fileFlag.slice('--file='.length) : fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
const wantsJson = argv.includes('--json');

if (!rawFile) {
  console.error('usage: node scripts/design-ledger-file-guard.mjs --file <repo-relative path> [--json]');
  process.exit(2);
}

const file = relative(ROOT, join(ROOT, rawFile));
if (file.startsWith('..')) {
  console.error(`design-ledger-file-guard: ${rawFile} is outside the repo`);
  process.exit(2);
}

let ledger;
try {
  ledger = JSON.parse(readFileSync(join(ROOT, LEDGER_PATH), 'utf8'));
} catch (error) {
  console.error(`design-ledger-file-guard: cannot read ${LEDGER_PATH}: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}

const bare = (p) => p.replace(EXTENSION, '').replace(/\/index$/, '');
const isUnder = (candidate, owner) => {
  const c = bare(candidate);
  const o = bare(owner);
  return c === o || c.startsWith(`${o}/`);
};

const source = existsSync(join(ROOT, file)) ? readFileSync(join(ROOT, file), 'utf8') : null;

/** Repo-relative module paths this file imports (`@/` alias and relative specifiers only). */
function importedPaths(text) {
  const out = new Set();
  const specifier = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;
  for (const [, spec] of text.matchAll(specifier)) {
    if (spec.startsWith('@/')) out.add(normalize(`src/${spec.slice(2)}`));
    else if (spec.startsWith('.')) out.add(normalize(join(dirname(file), spec)));
  }
  return [...out];
}

const imports = source ? importedPaths(source) : [];
const findings = [];

for (const entry of ledger.entries ?? []) {
  const facts = {
    entry: entry.id,
    state: entry.state,
    problem: entry.problem,
    replacementPaths: entry.replacementPaths ?? [],
    exitCriteria: entry.exitCriteria,
  };

  if (entry.state === 'retired') {
    for (const deleted of entry.deletedPaths ?? []) {
      if (isUnder(file, deleted)) findings.push({ kind: 'retired-path', severity: 'violation', path: deleted, ...facts });
    }
    if (source) {
      for (const needle of entry.forbiddenSource ?? []) {
        if (source.includes(needle)) findings.push({ kind: 'retired-source', severity: 'violation', needle, ...facts });
      }
    }
    continue;
  }

  for (const current of entry.currentPaths ?? []) {
    if (isUnder(file, current)) {
      findings.push({ kind: 'on-delete-list', severity: 'advisory', path: current, ...facts });
      continue;
    }
    const hits = imports.filter((imported) => isUnder(imported, current));
    if (hits.length) findings.push({ kind: 'imports-delete-list', severity: 'advisory', path: current, imports: hits, ...facts });
  }
}

const verdict = findings.some((f) => f.severity === 'violation')
  ? 'violation'
  : findings.length
    ? 'advisory'
    : 'pass';

if (wantsJson) {
  console.log(JSON.stringify({ file, exists: source !== null, verdict, findings }, null, 2));
} else {
  console.log(`design-ledger-file-guard (${file}): ${verdict}`);
  for (const f of findings) {
    const where = f.needle ? `"${f.needle}"` : f.path;
    console.log(`  ${f.severity === 'violation' ? '✗' : '·'} ${f.kind} ${f.entry} [${f.state}] ${where} → ${f.replacementPaths.join(', ')}`);
  }
}
process.exit(verdict === 'violation' ? 1 : 0);
