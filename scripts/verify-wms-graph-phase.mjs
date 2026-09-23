import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const controlPlane = process.env.GARISEK_OS_ROOT
  || path.resolve(repoRoot, '..', '..', 'Garisek-OS');

function run(label, command, args, cwd) {
  console.log(`\n[wms-graph] ${label}`);
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(
  'CycleForge strict adapter and replay contract',
  'node',
  [
    '--import', 'tsx',
    '--import', './scripts/register-server-only-shim.cjs',
    '--test', 'src/lib/packing/wms-reroute-adapter.test.ts',
  ],
  repoRoot,
);
run(
  'CycleForge real Neon transaction (always rolled back)',
  'node',
  [
    '--import', 'tsx',
    '--import', './scripts/register-server-only-shim.cjs',
    'scripts/verify-wms-reroute-live.ts',
  ],
  repoRoot,
);
run(
  'Garisek-OS LangGraph Slot Full evaluation',
  'npm',
  ['run', 'test:wms-slot-full'],
  controlPlane,
);

console.log('\n[wms-graph] PASS');
