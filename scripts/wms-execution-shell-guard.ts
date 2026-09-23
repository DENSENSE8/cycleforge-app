#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import {
  evaluateWmsExecutionShell,
  WMS_EXECUTION_ACTION_FILES,
  WMS_EXECUTION_ROUTING_FILES,
} from '../src/lib/realtime/wms-execution-shell-law';

const files = [...new Set([...WMS_EXECUTION_ROUTING_FILES, ...WMS_EXECUTION_ACTION_FILES])];
const sources = Object.fromEntries(files.map((file) => [file, readFileSync(file, 'utf8')]));
const verdict = evaluateWmsExecutionShell(sources);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(verdict, null, 2));
} else {
  console.log(
    `wms-execution-shell-guard: ${verdict.ok ? 'pass' : 'FAIL'} — `
    + `${verdict.actionCount} motion actions, ${verdict.violations.length} violations`,
  );
  for (const violation of verdict.violations) {
    console.error(`${violation.file}:${violation.line} [${violation.rule}] ${violation.message}`);
  }
}
process.exit(verdict.ok ? 0 : 1);
