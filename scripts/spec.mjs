#!/usr/bin/env node
/**
 * CycleForge → Garisek spec kernel (docs/loops/SPEC-KERNEL.md in Garisek-OS). The loop's core lives
 * in Garisek; this repo is a pack (tools/spec-loop/pack.mjs).
 *
 *   pnpm spec:sweep [--placement static|live|full] [--only a,b | --skip a,b] [--no-keep] [--accept-anchors] [--json]
 *   pnpm spec:loop (--plant | --debt <selector> | --goal <file.md>) [--units N] [--attempts N] [--apply] …
 *
 * CycleForge debt selectors map onto the kernel's grammar: contracts → rules, contract:<id> → rule:<id>,
 * critique[:mobile|:desktop] → critique#fork[@surface]; anything else passes through.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GARISEK_OS = process.env.GARISEK_OS_ROOT || path.join(process.env.HOME ?? '', 'Projects/Garisek-OS');
const TSX = path.join(GARISEK_OS, 'node_modules', '.bin', 'tsx');
const CLI = path.join(GARISEK_OS, 'scripts', 'spec-kernel', 'cli.ts');

for (const file of [TSX, CLI]) {
  if (!fs.existsSync(file)) {
    process.stderr.write(`spec: ${file} missing — set GARISEK_OS_ROOT to a Garisek-OS checkout with its dependencies installed\n`);
    process.exit(2);
  }
}

const args = process.argv.slice(2);
const debt = args.indexOf('--debt');
if (debt >= 0 && args[debt + 1]) {
  const selector = args[debt + 1];
  const surface = selector.match(/^critique(?::(mobile|desktop))?$/);
  args[debt + 1] =
    selector === 'contracts' ? 'rules'
    : selector.startsWith('contract:') ? `rule:${selector.slice('contract:'.length)}`
    : surface ? `critique#fork${surface[1] ? `@${surface[1]}` : ''}`
    : selector;
}

const child = spawn(TSX, [CLI, ...args, '--pack', path.join(ROOT, 'tools', 'spec-loop', 'pack.mjs')], { cwd: ROOT, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', (err) => {
  process.stderr.write(`spec: ${err.message}\n`);
  process.exit(2);
});
child.on('close', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
