#!/usr/bin/env node
/** Deterministic CLI face of the DataTable industrial cohesion law. */

import { readFileSync } from 'node:fs';
import {
  DATA_TABLE_INDUSTRIAL_LAW,
  DATA_TABLE_INDUSTRIAL_TARGET,
  evaluateDataTableIndustrialSource,
} from '../src/lib/tables/data-table-industrial-law';

const asJson = process.argv.includes('--json');
const fileArgIndex = process.argv.indexOf('--file');
const target = fileArgIndex >= 0
  ? process.argv[fileArgIndex + 1]
  : DATA_TABLE_INDUSTRIAL_TARGET;

if (!target) {
  console.error('data-table-industrial-guard: --file requires a path');
  process.exit(2);
}

let source: string;
try {
  source = readFileSync(target, 'utf8');
} catch (error) {
  console.error(`data-table-industrial-guard: cannot read ${target}: ${String(error)}`);
  process.exit(2);
}

const verdict = evaluateDataTableIndustrialSource(source);

if (asJson) {
  console.log(JSON.stringify(verdict, null, 2));
  process.exit(verdict.ok ? 0 : 1);
}

console.log(
  `data-table-industrial-guard: ${verdict.ok ? 'pass' : 'FAIL'} — ${verdict.lines} lines; line count is metric, not violation.`,
);
console.log(DATA_TABLE_INDUSTRIAL_LAW.invariant);
for (const violation of verdict.violations) {
  console.error(`  ✗ ${violation.id}: ${violation.why}`);
}
process.exit(verdict.ok ? 0 : 1);
