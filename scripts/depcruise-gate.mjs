#!/usr/bin/env node
/**
 * Quiet assembly-boundary gate. `npm run diagrams:check` is the verbose
 * human report (orphans + design-system warns). CI only fails on `error`
 * rules — currently the host-not-parts shields in `.dependency-cruiser.cjs`.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const res = spawnSync(
  'npx',
  [
    'depcruise',
    'src',
    '--include-only',
    '^src',
    '--config',
    '.dependency-cruiser.cjs',
    '--output-type',
    'json',
  ],
  {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === 'win32',
  },
);

if (!res.stdout) {
  process.stderr.write(res.stderr || '');
  process.stderr.write(`depcruise-gate: depcruise exited ${res.status}\n`);
  process.exit(res.status ?? 1);
}

let report;
try {
  report = JSON.parse(res.stdout);
} catch {
  process.stderr.write(res.stdout);
  process.stderr.write(res.stderr || '');
  process.exit(2);
}

const violations = report.summary?.violations ?? [];
const errors = violations.filter(
  (v) => (v.rule?.severity ?? v.severity) === 'error',
);

if (errors.length > 0) {
  for (const v of errors) {
    const name = v.rule?.name ?? v.from;
    const comment = v.rule?.comment ? `\n  ${v.rule.comment}` : '';
    process.stderr.write(`${name}: ${v.from} → ${v.to}${comment}\n`);
  }
  process.stderr.write(
    `depcruise-gate: ${errors.length} error(s). Compose the assembly, not the parts.\n`,
  );
  process.exit(1);
}

const modules = report.summary?.totalCruised ?? '?';
process.stdout.write(`depcruise-gate: ok 0 errors (${modules} modules cruised)\n`);
