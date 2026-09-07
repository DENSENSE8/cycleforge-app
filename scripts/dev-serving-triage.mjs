#!/usr/bin/env node
/**
 * dev-serving-triage — answer "why don't I see my change?" in one command.
 *
 * Walks the FULL serving chain for a port and prints every hop:
 *
 *   port → listener pid → process cwd (which repo!) → git HEAD + dirty count
 *   → owning systemd user unit → tunnel hostnames → HTTP probe
 *
 * Known traps this exists to catch (see docs/dev-serving-triage.md):
 *   - :3000 on this box is a FOREIGN app; main dev is :3050, lanes have own ports
 *   - a worktree/lane server on the port you're looking at (cwd ≠ this repo)
 *   - stale turbopack cache (.next) serving code that no longer matches source
 *   - ~/.cloudflared/config.yml is REMOTELY managed — dashboard ingress wins
 *
 * Usage:
 *   node scripts/dev-serving-triage.mjs [port]        # default 3050
 *   node scripts/dev-serving-triage.mjs 3050 --cold   # stop unit, rm -rf .next, start
 *
 * --cold only acts when the listener belongs to a systemd --user unit; it never
 * kills a bare process (ask its owner first).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const argv = process.argv.slice(2);
const port = String(Number(argv.find((a) => /^\d+$/.test(a)) ?? 3050));
const cold = argv.includes('--cold');

const sh = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

const line = (label, value, warn = false) =>
  console.log(`${warn ? '⚠' : '✓'} ${label.padEnd(24)}${value}`);

console.log(`\nServing-path triage for :${port}\n${'='.repeat(46)}`);

// 1) listener
let pid = null;
try {
  const ss = sh('ss', ['-tlnp']);
  const row = ss.split('\n').find((r) => r.includes(`:${port} `) || r.includes(`:${port}\n`));
  pid = row?.match(/pid=(\d+)/)?.[1] ?? null;
} catch { /* ss unavailable */ }
if (!pid) {
  line('listener', `nothing is listening on :${port}`, true);
  process.exit(1);
}
line('listener pid', pid);

// 2) cwd → which repo is this, really?
let cwd = null;
try { cwd = readFileSync(`/proc/${pid}/cwd`, { encoding: 'utf8' }) || null; } catch { /* gone */ }
if (!cwd) { try { cwd = sh('readlink', [`/proc/${pid}/cwd`]); } catch { /* gone */ } }
line('process cwd', cwd ?? 'unreadable', !cwd);

let head = null, dirty = 0;
if (cwd) {
  try { head = sh('git', ['rev-parse', '--short', 'HEAD'], cwd); } catch { /* not a repo */ }
  try { dirty = sh('git', ['status', '--porcelain'], cwd).split('\n').filter(Boolean).length; } catch { /* noop */ }
}
line('repo / HEAD', head ? `${cwd} @ ${head}` : 'not a git repo', !head);

const hereRoot = (() => {
  try { return sh('git', ['rev-parse', '--show-toplevel'], dirname(fileURLToPath(import.meta.url))); } catch { return null; }
})();
if (cwd && hereRoot && cwd !== hereRoot) {
  line('MISMATCH', 'this port serves a DIFFERENT checkout than the one you are standing in', true);
} else if (cwd && hereRoot) {
  line('checkout match', 'serves the checkout you are in');
}
if (dirty > 0) line('dirty files', `${dirty} uncommitted (expected in dev — but stale-chunk bugs live here)`);

// 3) owning systemd --user unit (restart THROUGH the unit; never kill the pid)
let unit = null;
try {
  const cg = readFileSync(`/proc/${pid}/cgroup`, { encoding: 'utf8' });
  unit = cg.split('\n').map((l) => l.split('/').pop().trim()).find((seg) => seg.endsWith('.service')) ?? null;
} catch { /* gone */ }
line('systemd unit', unit ?? 'none (bare process — restart it where it was started)', !unit);
if (unit) line('restart', `systemctl --user restart ${unit}`);
line('cold restart', unit
  ? `systemctl --user stop ${unit} && rm -rf <repo>/.next && systemctl --user start ${unit}`
  : 'stop the process, rm -rf .next, start it again');

// 4) tunnels that front this port
const tunnels = [];
const scanTunnelConfig = (path, managed) => {
  if (!existsSync(path)) return;
  const txt = readFileSync(path, 'utf8');
  const re = /hostname:\s*(\S+)[\s\S]*?service:\s*http:\/\/(?:127\.0\.0\.1|localhost):(\d+)/g;
  let m;
  while ((m = re.exec(txt))) tunnels.push({ host: m[1], port: m[2], managed, file: path });
};
scanTunnelConfig(`${homedir()}/.cloudflared/config.yml`, 'REMOTE (dashboard wins!)');
const lanesDir = `${homedir()}/.config/cycleforge/lanes`;
if (existsSync(lanesDir)) {
  for (const f of readdirSync(lanesDir).filter((f) => f.endsWith('.yml'))) {
    scanTunnelConfig(`${lanesDir}/${f}`, 'local');
  }
}
const mine = tunnels.filter((t) => t.port === port);
if (mine.length === 0) {
  line('tunnel', 'no local tunnel config fronts this port', true);
} else {
  for (const t of mine) line('tunnel', `${t.host} → :${t.port}  [${t.managed}]  (${basename(dirname(t.file))}/)`);
}

// 5) HTTP probe
try {
  const r = await fetch(`http://127.0.0.1:${port}/signin`, { signal: AbortSignal.timeout(4000) });
  line('HTTP /signin', `${r.status}`, r.status !== 200);
} catch (e) {
  line('HTTP /signin', `probe failed: ${e.message}`, true);
}

// 6) --cold: act
if (cold) {
  if (!unit) { console.log('\n--cold refused: no systemd unit owns this listener.'); process.exit(1); }
  if (cwd !== hereRoot) { console.log('\n--cold refused: port serves a different checkout than this one.'); process.exit(1); }
  console.log(`\ncold restart: stop ${unit} → rm -rf .next → start`);
  sh('systemctl', ['--user', 'stop', unit]);
  execFileSync('rm', ['-rf', `${cwd}/.next`]);
  sh('systemctl', ['--user', 'start', unit]);
  console.log('done — first compile takes a few seconds; watch: journalctl --user -u ' + unit + ' -f');
}
console.log('');
