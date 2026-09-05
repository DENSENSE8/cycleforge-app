#!/usr/bin/env node
/**
 * ds_critique ratchet — plan §7.4 step 3.
 *
 * Over the tsx files this commit (or the working tree) changed, fail if
 * `metrics.arbitrary_literals` went UP versus `scripts/ci/critique-literals.json`.
 * Existing literals are advisory (named in the ratchet); new ones are a hard
 * fail. Shrink is allowed and printed so the operator can lower the file.
 *
 *   node scripts/ds-critique-gate.mjs
 *   node scripts/ds-critique-gate.mjs --update   # write today's counts into the ratchet
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RATCHET = path.join(ROOT, 'scripts/ci/critique-literals.json');
const UPDATE = process.argv.includes('--update');

function git(args) {
  const res = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${res.stderr || res.stdout}`);
  }
  return res.stdout;
}

function changedTsx() {
  const spec = ['--', 'src'];
  let raw = '';
  try {
    raw = process.env.CI_SHA
      ? git(['diff', '--name-only', 'HEAD^', 'HEAD', ...spec])
      : git(['diff', '--name-only', 'HEAD', ...spec]);
  } catch (err) {
    process.stderr.write(`ds-critique: ${err instanceof Error ? err.message : String(err)}\n`);
    return [];
  }
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((f) => f.endsWith('.tsx') && existsSync(path.join(ROOT, f)));
}

function critique(file) {
  const res = spawnSync(process.execPath, ['tools/design-mcp/ds.mjs', 'critique', file], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 90_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (res.status !== 0) {
    throw new Error(`ds_critique ${file} failed (${res.status}): ${res.stderr || res.stdout}`);
  }
  const text = res.stdout.trim();
  const start = text.indexOf('{');
  const json = JSON.parse(start >= 0 ? text.slice(start) : text);
  return Number(json.metrics?.arbitrary_literals ?? 0);
}

const files = changedTsx();
if (files.length === 0) {
  process.stdout.write(JSON.stringify({ gate: 'ds-critique', files: [], ok: true }) + '\n');
  process.exit(0);
}
if (files.length > 25) {
  process.stderr.write(`ds-critique: ${files.length} tsx files changed — capping at 25\n`);
  files.length = 25;
}

let ratchet = {};
if (existsSync(RATCHET)) {
  ratchet = JSON.parse(readFileSync(RATCHET, 'utf8'));
}

const increases = [];
const seeded = [];
const decreased = [];
const counts = { ...ratchet };

for (const file of files) {
  const next = critique(file);
  const prev = Object.prototype.hasOwnProperty.call(ratchet, file) ? ratchet[file] : null;
  counts[file] = next;
  if (prev == null) {
    seeded.push({ file, count: next });
    continue;
  }
  if (next > prev) increases.push({ file, from: prev, to: next });
  else if (next < prev) decreased.push({ file, from: prev, to: next });
}

if (UPDATE) {
  const ordered = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(RATCHET, `${JSON.stringify(ordered, null, 2)}\n`);
}

const report = {
  gate: 'ds-critique',
  files,
  increases,
  decreased,
  seeded,
  ok: increases.length === 0,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (increases.length) {
  process.stderr.write(
    `ds_critique: arbitrary_literals increased on ${increases.map((i) => i.file).join(', ')}\n`,
  );
  process.exit(1);
}
