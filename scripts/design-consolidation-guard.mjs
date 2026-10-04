#!/usr/bin/env node

/** Validate the living design-system delete/simplification ledger. */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const ROOT = process.cwd();
const LEDGER_PATH = 'docs/design-system/consolidation-ledger.json';
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const fail = (message) => {
  console.error(`design-consolidation-guard: ${message}`);
  process.exitCode = 1;
};

const isSafePath = (value) =>
  typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.split('/').includes('..');

const sourceFiles = readdirSync(join(ROOT, 'src'), { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name)))
  .map((entry) => join(entry.parentPath, entry.name));

let ledger;
try {
  ledger = JSON.parse(readFileSync(join(ROOT, LEDGER_PATH), 'utf8'));
} catch (error) {
  fail(`cannot read ${LEDGER_PATH}: ${error instanceof Error ? error.message : String(error)}`);
  process.exit();
}

if (ledger.version !== 1 || !Array.isArray(ledger.entries) || !Array.isArray(ledger.states)) {
  fail('expected version 1 with states[] and entries[]');
  process.exit();
}

const allowedStates = new Set(ledger.states);
const seenIds = new Set();
const counts = new Map();

for (const entry of ledger.entries) {
  const label = entry?.id || '<missing id>';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(label)) fail(`${label}: id must be kebab-case`);
  if (seenIds.has(label)) fail(`${label}: duplicate id`);
  seenIds.add(label);
  if (!allowedStates.has(entry.state)) fail(`${label}: unknown state ${JSON.stringify(entry.state)}`);
  counts.set(entry.state, (counts.get(entry.state) ?? 0) + 1);
  for (const field of ['category', 'problem', 'exitCriteria']) {
    if (typeof entry[field] !== 'string' || !entry[field].trim()) fail(`${label}: ${field} is required`);
  }

  const replacements = entry.replacementPaths;
  if (!Array.isArray(replacements) || replacements.length === 0) {
    fail(`${label}: replacementPaths must name at least one canonical source`);
  } else {
    for (const path of replacements) {
      if (!isSafePath(path) || !existsSync(join(ROOT, path))) fail(`${label}: replacement path is missing or unsafe: ${path}`);
    }
  }

  if (entry.state === 'retired') {
    if (!Array.isArray(entry.deletedPaths) || entry.deletedPaths.length === 0) fail(`${label}: retired entries require deletedPaths`);
    for (const path of entry.deletedPaths ?? []) {
      if (!isSafePath(path)) fail(`${label}: unsafe deleted path: ${path}`);
      else if (existsSync(join(ROOT, path))) fail(`${label}: retired path returned: ${path}`);
    }
    if (!Array.isArray(entry.forbiddenSource) || entry.forbiddenSource.length === 0) fail(`${label}: retired entries require forbiddenSource`);
    for (const needle of entry.forbiddenSource ?? []) {
      if (typeof needle !== 'string' || !needle.trim()) {
        fail(`${label}: forbiddenSource values must be non-empty strings`);
        continue;
      }
      for (const file of sourceFiles) {
        if (readFileSync(file, 'utf8').includes(needle)) {
          fail(`${label}: retired source ${JSON.stringify(needle)} returned in ${relative(ROOT, file)}`);
        }
      }
    }
  } else {
    if (!Array.isArray(entry.currentPaths) || entry.currentPaths.length === 0) fail(`${label}: active entries require currentPaths`);
    for (const path of entry.currentPaths ?? []) {
      if (!isSafePath(path) || !existsSync(join(ROOT, path))) fail(`${label}: current path is missing or unsafe: ${path}`);
    }
  }
}

if (!process.exitCode) {
  const summary = [...counts.entries()].map(([state, count]) => `${state}=${count}`).join(', ');
  console.log(`design-consolidation-guard: OK (${ledger.entries.length} entries; ${summary})`);
}
