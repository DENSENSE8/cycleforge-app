#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const deploy = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
const registry = readFileSync(join(root, 'src/lib/cron/registry.ts'), 'utf8');
const scheduled = new Set((deploy.crons ?? []).map((entry) => entry.path.split('?')[0]));
const registered = new Set([...registry.matchAll(/\bjob:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]));
const found = new Set();
const failures = [];

for (const route of scheduled) {
  const file = join(root, 'src/app', route.slice(1), 'route.ts');
  if (!existsSync(file)) {
    failures.push(`${route}: scheduled route file is missing`);
    continue;
  }
  const source = readFileSync(file, 'utf8');
  for (const [name, pattern] of [
    ['bearer auth', /\bisAuthorizedCronRequest\b/],
    ['distributed lock', /\bwithCronLock\b/],
    ['run ledger', /\bwithCronRun\b/],
  ]) {
    if (!pattern.test(source)) failures.push(`${route}: missing ${name}`);
  }
  const literal = source.match(/withCronRun\(\s*['"]([^'"]+)['"]/);
  const symbol = source.match(/\bconst\s+JOB\s*=\s*['"]([^'"]+)['"]/);
  const job = literal?.[1] ?? symbol?.[1];
  if (!job) failures.push(`${route}: run-ledger job key is not statically discoverable`);
  else if (!registered.has(job)) failures.push(`${route}: job '${job}' is absent from CRON_JOBS`);
  else found.add(job);
}

for (const job of registered) {
  if (!found.has(job)) failures.push(`CRON_JOBS contains unscheduled or unlogged job '${job}'`);
}

if (failures.length) {
  console.error(`cron-contract-guard: ${failures.length} violation(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`cron-contract-guard: OK (${scheduled.size} scheduled routes; ${registered.size} registered jobs)`);
