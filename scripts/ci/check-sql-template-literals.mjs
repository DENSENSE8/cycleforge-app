#!/usr/bin/env node
/**
 * Guard: no backticks inside SQL written in a JS template literal.
 *
 * Written after making the same mistake three times in one session. SQL in this
 * codebase lives in backtick template literals, and the natural way to write a
 * comment about a table is to quote its name — `items` — which TERMINATES the
 * string. The failure is loud but misleading: TypeScript reports "',' expected"
 * or "Octal literals are not allowed" somewhere in the middle of a query, and
 * at runtime the whole route 500s, so the symptom looks like a broken endpoint
 * rather than a typo in prose.
 *
 * A reviewer will not catch it either — the comment reads perfectly.
 *
 * Run: node scripts/ci/check-sql-template-literals.mjs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOTS = ['src/app/api', 'src/lib'];

function walk(dir) {
  let out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out = out.concat(walk(full));
    else if (/\.ts$/.test(full)) out.push(full);
  }
  return out;
}

const findings = [];

for (const root of ROOTS) {
  let files = [];
  try {
    files = walk(root);
  } catch {
    continue;
  }
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    let inTemplate = false;
    lines.forEach((line, i) => {
      // Crude but sufficient: an odd number of backticks flips template state.
      const ticks = (line.match(/`/g) ?? []).length;
      const sqlComment = /^\s*--/.test(line);
      if (inTemplate && sqlComment && ticks > 0) {
        findings.push({ file, n: i + 1, text: line.trim().slice(0, 100) });
      }
      if (ticks % 2 === 1) inTemplate = !inTemplate;
    });
  }
}

if (findings.length === 0) {
  console.log('✓ no backticks in SQL template-literal comments');
  process.exit(0);
}

console.error(`\n✖ ${findings.length} backtick(s) inside SQL template literals\n`);
for (const f of findings) {
  console.error(`  ${f.file}:${f.n}`);
  console.error(`    ${f.text}`);
  console.error('    → a backtick terminates the template literal. Drop the quotes.\n');
}
process.exit(1);
