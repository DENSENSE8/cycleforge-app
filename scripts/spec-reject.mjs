#!/usr/bin/env node
/**
 * Operator rejection → rule proposal (Garisek-OS docs/loops/AUTORESEARCH.md §1.1; operator guide
 * docs/loops/README.md). Takes the screenshot of `--url` at the lane when it answers, then hands
 * everything to the kernel's `cli reject` through scripts/spec.mjs (same kernel, same pack).
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** tests/auth-preflight.mjs BASE_URL — the lane tests/shot.mjs drives. */
const ORIGIN = process.env.PW_BASE_URL || 'http://localhost:3050';
/** Pack stateDir (tools/spec-loop/pack.mjs) + the kernel's rejections dir. */
const SHOT_DIR = '.garisek/spec/rejections';

const USAGE = `pnpm spec:reject -- --words "<verbatim>" [--url /route] [--files a,b] [--commit <sha> | --working] [--by <who>]

  --words   what you said, verbatim (required) — it becomes the rule's ruling, never edited
  --url     the route you were looking at; screenshotted at ${ORIGIN} when the lane answers
  --files   the rejected files (required with --working; with --commit defaults to the commit's src/ files)
  --commit  commit holding the rejected content (default HEAD)
  --working snapshot the current (uncommitted) files instead
  --by      who rejects (default: operator)

Writes a rule-proposal queue item under .garisek/spec/queue/; next: pnpm spec:propose <queueId>.`;

const args = process.argv.slice(2);
if (args[0] === '--') args.shift();
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : undefined;
};
if (!opt('words')) {
  process.stderr.write(`spec:reject: --words is required\n\n${USAGE}\n`);
  process.exit(2);
}
if (!opt('by')) args.push('--by', 'operator');

const route = opt('url');
if (route) {
  // The switchboard answers 503 + x-switch-error when the pinned lane is down (AGENTS.md §1).
  const up = await fetch(new URL(route, ORIGIN), { redirect: 'manual', signal: AbortSignal.timeout(3000) }).then(
    (res) => !(res.status === 503 && res.headers.has('x-switch-error')),
    () => false,
  );
  if (!up) {
    process.stderr.write(`spec:reject: lane ${ORIGIN} is not answering — recording the rejection without a screenshot\n`);
  } else {
    const shot = path.join(SHOT_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}.png`);
    fs.mkdirSync(path.join(ROOT, SHOT_DIR), { recursive: true });
    const res = spawnSync(process.execPath, ['tests/shot.mjs', route, shot], { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'], timeout: 90_000 });
    if (res.status === 0 && fs.existsSync(path.join(ROOT, shot))) args.push('--screenshot', shot);
    else process.stderr.write(`spec:reject: screenshot of ${route} failed — recording the rejection without it\n`);
  }
}

const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'spec.mjs'), 'reject', ...args], { cwd: ROOT, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('close', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
