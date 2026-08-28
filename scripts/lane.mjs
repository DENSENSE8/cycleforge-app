#!/usr/bin/env node
/**
 * Feature lanes — one worktree, one port, one public hostname, one command.
 *
 * A lane is an isolated place to build and preview ONE feature without touching
 * `:3050` (the operator's) or `usav-dev.michaelgarisek.com` (main's). Everything
 * about a lane is derived from its name, so nothing has to be remembered or
 * looked up from a second machine:
 *
 *   name        packed-pie
 *   worktree    ~/Projects/cycleforge-lanes/packed-pie      (detached at main)
 *   port        3071                                        (allocated once)
 *   tunnel      lane-packed-pie -> packed-pie.michaelgarisek.com
 *   units       cycleforge-lane@packed-pie
 *               cycleforge-lane-tunnel@packed-pie
 *   registry    ~/.config/cycleforge/lanes/packed-pie.env
 *
 * The registry directory IS the source of truth — systemd reads those files
 * natively as EnvironmentFile, so there is no second copy to drift.
 *
 * ## No branches, ever
 *
 * AGENTS.md: never create a branch. A lane worktree is DETACHED at `main`, so
 * `git branch` stays exactly as long as it is today. `lane land` fast-forwards
 * main onto the lane's commit — a merge with no merge commit and no branch.
 *
 * ## What this script will not do
 *
 * It never starts or stops `cycleforge-dev.service` (:3050) or
 * `cloudflared.service` (usav-dev). Those are the operator's, per AGENTS.md.
 * `lane up` / `lane down` touch only `cycleforge-lane*@<name>` units.
 *
 * Usage:
 *   pnpm lanes                     # status table (alias for `lane status`)
 *   pnpm lane new <name>           # create worktree + port + tunnel + units
 *   pnpm lane new <name> --dry-run # print every step, change nothing
 *   pnpm lane up <name>            # start this lane's dev server + tunnel
 *   pnpm lane down <name>          # stop them
 *   pnpm lane land <name>          # verify, fast-forward main, push
 *   pnpm lane rm <name>            # tear the lane down and delete it
 *   pnpm lane doctor               # (re)install the systemd unit templates
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOME = homedir();
const LANES_ROOT = path.join(HOME, 'Projects', 'cycleforge-lanes');
const REGISTRY = path.join(HOME, '.config', 'cycleforge', 'lanes');
const UNIT_DIR = path.join(HOME, '.config', 'systemd', 'user');
const DOMAIN = process.env.CF_LANE_DOMAIN?.trim() || 'michaelgarisek.com';

/** Lane ports. 3050 = main dev, 3051 = the warehouse-os worktree, 3060 = Garisek-OS. */
const PORT_MIN = 3071;
const PORT_MAX = 3089;
/** cloudflared metrics sockets, one per lane, derived from the lane port. */
const METRICS_BASE = 20300;

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m', cyan: '\x1b[36m',
};
const log = (...a) => console.log(...a);
const die = (msg) => { console.error(`${C.red}✗ ${msg}${C.reset}`); process.exit(1); };

/* ------------------------------------------------------------------ shell */

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', ...opts }).trim();
}
function shQuiet(cmd, args, opts = {}) {
  try { return sh(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'], ...opts }); } catch { return null; }
}
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  return r.status === 0;
}

/** The MAIN checkout, even when this script is invoked from inside a lane. */
function mainWorktree() {
  const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const porcelain = sh('git', ['-C', here, 'worktree', 'list', '--porcelain']);
  const first = porcelain.split('\n').find((l) => l.startsWith('worktree '));
  return first ? first.slice('worktree '.length) : here;
}
const MAIN = mainWorktree();

/* --------------------------------------------------------------- registry */

const laneEnvPath = (name) => path.join(REGISTRY, `${name}.env`);
const laneYmlPath = (name) => path.join(REGISTRY, `${name}.yml`);
const laneDir = (name) => path.join(LANES_ROOT, name);

function readLane(name) {
  const file = laneEnvPath(name);
  if (!existsSync(file)) return null;
  const lane = { name };
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) lane[m[1]] = m[2];
  }
  return lane;
}

function allLanes() {
  if (!existsSync(REGISTRY)) return [];
  return readdirSync(REGISTRY)
    .filter((f) => f.endsWith('.env'))
    .map((f) => readLane(f.slice(0, -4)))
    .filter(Boolean)
    .sort((a, b) => Number(a.LANE_PORT) - Number(b.LANE_PORT));
}

function allocatePort() {
  const taken = new Set(allLanes().map((l) => Number(l.LANE_PORT)));
  for (let p = PORT_MIN; p <= PORT_MAX; p += 1) if (!taken.has(p)) return p;
  die(`no free lane port in ${PORT_MIN}–${PORT_MAX} — retire a lane first (pnpm lane rm <name>)`);
  return 0;
}

/* ----------------------------------------------------------------- probes */

function portOpen(port, timeout = 400) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const done = (ok) => { socket.destroy(); resolve(ok); };
    socket.setTimeout(timeout);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

// `is-active` exits non-zero for anything but "active", and the WORD it prints
// is the answer — so read stdout regardless of the exit code.
function unitState(unit) {
  const r = spawnSync('systemctl', ['--user', 'is-active', unit], { encoding: 'utf8' });
  return (r.stdout ?? '').trim() || 'unknown';
}

function gitHead(dir) {
  const sha = shQuiet('git', ['-C', dir, 'rev-parse', '--short', 'HEAD']);
  const dirty = shQuiet('git', ['-C', dir, 'status', '--porcelain']);
  return { sha: sha ?? '—', dirty: dirty ? dirty.split('\n').filter(Boolean).length : 0 };
}

/* ------------------------------------------------------------------ status */

async function cmdStatus() {
  const lanes = allLanes();
  log('');
  log(`${C.bold}${C.blue}━━━ CycleForge lanes ━━━${C.reset}`);
  log(`${C.dim}main checkout ${MAIN}${C.reset}`);

  // The two servers this tool must never touch, shown so a lane is never
  // confused for them from an SSH session.
  const mainUp = await portOpen(3050);
  const mainUnit = unitState('cycleforge-dev.service');
  log('');
  log(`  ${C.dim}:3050${C.reset}  main         ${mainUp ? `${C.green}listening${C.reset}` : `${C.red}down${C.reset}`}` +
      `  unit ${mainUnit === 'active' ? `${C.green}active${C.reset}` : `${C.yellow}${mainUnit}${C.reset}`}` +
      `  ${C.dim}https://usav-dev.${DOMAIN}${C.reset}`);

  if (lanes.length === 0) {
    log('');
    log(`  ${C.dim}no lanes yet — pnpm lane new <name>${C.reset}`);
    log('');
    return;
  }

  log('');
  log(`  ${C.bold}${'LANE'.padEnd(18)}${'PORT'.padEnd(7)}${'HEAD'.padEnd(11)}${'DEV'.padEnd(10)}${'TUNNEL'.padEnd(10)}URL${C.reset}`);
  for (const lane of lanes) {
    const dir = laneDir(lane.name);
    const port = Number(lane.LANE_PORT);
    const listening = await portOpen(port);
    const dev = unitState(`cycleforge-lane@${lane.name}.service`);
    const tun = unitState(`cycleforge-lane-tunnel@${lane.name}.service`);
    const head = existsSync(dir) ? gitHead(dir) : { sha: 'MISSING', dirty: 0 };

    const devCell = dev === 'active'
      ? (listening ? `${C.green}up${C.reset}` : `${C.yellow}starting${C.reset}`)
      : `${C.dim}${dev}${C.reset}`;
    const tunCell = tun === 'active' ? `${C.green}up${C.reset}` : `${C.dim}${tun}${C.reset}`;
    const headCell = head.dirty > 0 ? `${head.sha}${C.yellow}+${head.dirty}${C.reset}` : head.sha;

    log(`  ${lane.name.padEnd(18)}${String(port).padEnd(7)}${headCell.padEnd(head.dirty > 0 ? 20 : 11)}` +
        `${devCell.padEnd(dev === 'active' ? 19 : 20)}${tunCell.padEnd(tun === 'active' ? 19 : 20)}` +
        `${C.cyan}https://${lane.LANE_HOST}${C.reset}`);
  }
  log('');
  log(`  ${C.dim}e2e:  PW_BASE_URL=http://localhost:<port> npx playwright test <spec> --project=qa-desktop${C.reset}`);
  log(`  ${C.dim}logs: journalctl --user -u cycleforge-lane@<name> -f${C.reset}`);
  log('');
}

/* ------------------------------------------------------------------ doctor */

function cmdDoctor({ dry = false } = {}) {
  const src = path.join(MAIN, 'ops', 'systemd');
  const units = ['cycleforge-lane@.service', 'cycleforge-lane-tunnel@.service'];
  mkdirSync(UNIT_DIR, { recursive: true });
  for (const unit of units) {
    const from = path.join(src, unit);
    const to = path.join(UNIT_DIR, unit);
    if (!existsSync(from)) die(`missing unit template ${from}`);
    const next = readFileSync(from, 'utf8');
    const current = existsSync(to) ? readFileSync(to, 'utf8') : null;
    if (current === next) { log(`  ${C.dim}unit up to date  ${unit}${C.reset}`); continue; }
    if (dry) { log(`  ${C.yellow}would install${C.reset}   ${to}`); continue; }
    writeFileSync(to, next);
    log(`  ${C.green}installed${C.reset}       ${to}`);
  }
  if (!dry) run('systemctl', ['--user', 'daemon-reload']);
}

/* --------------------------------------------------------------------- new */

function cmdNew(name, { dry = false, tunnel = true } = {}) {
  if (!/^[a-z][a-z0-9-]{1,19}$/.test(name)) {
    die('lane name must be kebab-case, 2–20 chars, starting with a letter (e.g. packed-pie)');
  }
  if (readLane(name)) die(`lane "${name}" already exists — pnpm lanes`);
  const dir = laneDir(name);
  if (existsSync(dir)) die(`${dir} already exists`);

  const port = allocatePort();
  const host = `${name}.${DOMAIN}`;
  const tunnelName = `lane-${name}`;
  const metrics = METRICS_BASE + (port - PORT_MIN);

  log('');
  log(`${C.bold}${C.blue}━━━ new lane: ${name} ━━━${C.reset}`);
  log(`  worktree   ${dir}`);
  log(`  port       ${port}`);
  log(`  hostname   https://${host}`);
  log(`  tunnel     ${tunnelName}`);
  log(`  units      cycleforge-lane@${name} · cycleforge-lane-tunnel@${name}`);
  log('');
  if (dry) log(`${C.yellow}--dry-run: nothing below is executed${C.reset}\n`);

  // 1 · worktree, DETACHED at main — no branch is created, ever (AGENTS.md).
  step(dry, `git worktree add --detach ${dir} main`, () => {
    mkdirSync(LANES_ROOT, { recursive: true });
    if (!run('git', ['-C', MAIN, 'worktree', 'add', '--detach', dir, 'main'])) die('git worktree add failed');
  });

  // 2 · env — .env is gitignored, so a fresh worktree has no database URL at all.
  step(dry, `copy .env / .env.local into the lane`, () => {
    for (const f of ['.env', '.env.local']) {
      const from = path.join(MAIN, f);
      if (existsSync(from)) writeFileSync(path.join(dir, f), readFileSync(from));
    }
  });

  // 3 · its own node_modules — Turbopack refuses to compile through the parent
  //     checkout's (learned on the warehouse-os worktree, 2026-08-23).
  step(dry, `pnpm install --dir ${dir}`, () => {
    if (!run('pnpm', ['install', '--dir', dir])) die('pnpm install failed');
  });

  // 4 · registry entry — this file is what systemd reads.
  step(dry, `write ${laneEnvPath(name)}`, () => {
    mkdirSync(REGISTRY, { recursive: true });
    writeFileSync(laneEnvPath(name), [
      `# CycleForge lane "${name}" — written by scripts/lane.mjs`,
      `LANE_NAME=${name}`,
      `LANE_PORT=${port}`,
      `LANE_METRICS_PORT=${metrics}`,
      `LANE_HOST=${host}`,
      `LANE_TUNNEL=${tunnelName}`,
      `LANE_DIR=${dir}`,
      `LANE_CREATED=${new Date().toISOString().slice(0, 10)}`,
      '',
    ].join('\n'));
  });

  // 5 · tunnel — a LOCALLY-managed named tunnel with its own config, so it can
  //     never inherit usav-dev's remotely-managed ingress.
  if (tunnel) {
    step(dry, `cloudflared tunnel create ${tunnelName}`, () => {
      const existing = shQuiet('cloudflared', ['tunnel', 'list', '--output', 'json']);
      const already = existing && JSON.parse(existing).some((t) => t.name === tunnelName);
      if (!already && !run('cloudflared', ['tunnel', 'create', tunnelName])) die('cloudflared tunnel create failed');
    });
    step(dry, `cloudflared tunnel route dns ${tunnelName} ${host}`, () => {
      if (!run('cloudflared', ['tunnel', 'route', 'dns', tunnelName, host])) {
        die(`DNS route failed — the CNAME for ${host} may already point elsewhere`);
      }
    });
    step(dry, `write ${laneYmlPath(name)}`, () => {
      const list = JSON.parse(sh('cloudflared', ['tunnel', 'list', '--output', 'json']));
      const uuid = list.find((t) => t.name === tunnelName)?.id;
      if (!uuid) die(`could not resolve the UUID for tunnel ${tunnelName}`);
      writeFileSync(laneYmlPath(name), [
        `# CycleForge lane "${name}" — locally-managed tunnel.`,
        `# Explicit config: cloudflared would otherwise read ~/.cloudflared/config.yml,`,
        `# which belongs to usav-dev (main) and is remotely managed.`,
        `tunnel: ${uuid}`,
        `credentials-file: ${path.join(HOME, '.cloudflared', `${uuid}.json`)}`,
        `no-autoupdate: true`,
        `ingress:`,
        `  - hostname: ${host}`,
        `    service: http://127.0.0.1:${port}`,
        `    originRequest:`,
        `      connectTimeout: 30s`,
        `  - service: http_status:404`,
        '',
      ].join('\n'));
    });
  }

  // 6 · units
  step(dry, 'install systemd unit templates', () => cmdDoctor());

  log('');
  log(`${C.green}✓ lane "${name}" is ready${C.reset} ${C.dim}(nothing is running yet — starting is yours)${C.reset}`);
  log('');
  log(`  start it     ${C.bold}pnpm lane up ${name}${C.reset}`);
  log(`  preview      ${C.cyan}http://localhost:${port}${C.reset}  ·  ${C.cyan}https://${host}${C.reset}`);
  log(`  e2e          PW_BASE_URL=http://localhost:${port} npx playwright test <spec> --project=qa-desktop`);
  log(`  land it      pnpm lane land ${name}`);
  log('');
}

function step(dry, label, fn) {
  if (dry) { log(`  ${C.yellow}·${C.reset} ${label}`); return; }
  log(`  ${C.cyan}·${C.reset} ${label}`);
  fn();
}

/* ------------------------------------------------------------------ up/down */

function requireLane(name) {
  const lane = readLane(name);
  if (!lane) die(`no lane "${name}" — pnpm lanes`);
  return lane;
}

function cmdUp(name) {
  const lane = requireLane(name);
  run('systemctl', ['--user', 'enable', '--now', `cycleforge-lane@${name}.service`]);
  if (existsSync(laneYmlPath(name))) {
    run('systemctl', ['--user', 'enable', '--now', `cycleforge-lane-tunnel@${name}.service`]);
  }
  log('');
  log(`  ${C.green}up${C.reset}  http://localhost:${lane.LANE_PORT}  ·  https://${lane.LANE_HOST}`);
  log(`  ${C.dim}first compile is slow; journalctl --user -u cycleforge-lane@${name} -f${C.reset}`);
  log('');
}

function cmdDown(name) {
  requireLane(name);
  run('systemctl', ['--user', 'disable', '--now', `cycleforge-lane-tunnel@${name}.service`]);
  run('systemctl', ['--user', 'disable', '--now', `cycleforge-lane@${name}.service`]);
  log(`  ${C.dim}lane ${name} stopped${C.reset}`);
}

/* -------------------------------------------------------------------- land */

function cmdLand(name, { verify = true } = {}) {
  requireLane(name);
  const dir = laneDir(name);
  if (!existsSync(dir)) die(`lane worktree missing: ${dir}`);

  const dirty = shQuiet('git', ['-C', dir, 'status', '--porcelain']);
  if (dirty) die(`lane "${name}" has uncommitted changes — commit them in the lane first`);

  const laneHead = sh('git', ['-C', dir, 'rev-parse', 'HEAD']);
  const mainHead = sh('git', ['-C', MAIN, 'rev-parse', 'main']);

  if (laneHead === mainHead) die(`lane "${name}" has no commits beyond main — nothing to land`);

  // Fast-forward only. If main has moved, the lane rebases — no merge commit,
  // no branch, and the lane's own e2e ran against exactly what lands.
  const isDescendant = spawnSync('git', ['-C', MAIN, 'merge-base', '--is-ancestor', mainHead, laneHead]).status === 0;
  if (!isDescendant) {
    die(`main has moved past this lane. Rebase inside the lane, re-test, then land again:\n` +
        `    git -C ${dir} fetch origin && git -C ${dir} rebase main`);
  }

  if (verify) {
    log(`  ${C.cyan}·${C.reset} npm run verify (in the lane)`);
    if (!run('npm', ['run', 'verify'], { cwd: dir })) die('verify failed in the lane — not landing');
  }

  const mainDirty = shQuiet('git', ['-C', MAIN, 'status', '--porcelain']);
  if (mainDirty) {
    die(`the MAIN checkout has uncommitted changes (${mainDirty.split('\n').length} paths).\n` +
        `    Another session is mid-edit — land once that tree is clean.`);
  }

  log(`  ${C.cyan}·${C.reset} git merge --ff-only ${laneHead.slice(0, 9)}`);
  if (!run('git', ['-C', MAIN, 'merge', '--ff-only', laneHead])) die('fast-forward failed');
  log(`  ${C.cyan}·${C.reset} git push origin main`);
  if (!run('git', ['-C', MAIN, 'push', 'origin', 'main'])) die('push failed (the pre-push hook runs the full gate)');

  log('');
  log(`${C.green}✓ landed ${name} on main${C.reset}  ${C.dim}${laneHead.slice(0, 9)}${C.reset}`);
  log(`  ${C.dim}retire the lane when you are done with it: pnpm lane rm ${name}${C.reset}`);
  log('');
}

/* ---------------------------------------------------------------------- rm */

function cmdRm(name) {
  const lane = requireLane(name);
  const dir = laneDir(name);

  const dirty = existsSync(dir) ? shQuiet('git', ['-C', dir, 'status', '--porcelain']) : null;
  if (dirty) die(`lane "${name}" has uncommitted changes — land or discard them first`);

  cmdDown(name);
  if (lane.LANE_TUNNEL) {
    run('cloudflared', ['tunnel', 'cleanup', lane.LANE_TUNNEL]);
    run('cloudflared', ['tunnel', 'delete', '-f', lane.LANE_TUNNEL]);
  }
  if (existsSync(dir)) run('git', ['-C', MAIN, 'worktree', 'remove', '--force', dir]);
  for (const f of [laneEnvPath(name), laneYmlPath(name)]) if (existsSync(f)) rmSync(f);
  run('systemctl', ['--user', 'daemon-reload']);

  log('');
  log(`${C.green}✓ lane "${name}" removed${C.reset}`);
  log(`  ${C.yellow}!${C.reset} the DNS record for ${lane.LANE_HOST} is NOT deleted — cloudflared can`);
  log(`    create a route but not remove one. Delete the CNAME in the Cloudflare`);
  log(`    dashboard, or it will serve error 1033 forever.`);
  log('');
}

/* -------------------------------------------------------------------- main */

const [, , cmd = 'status', arg, ...rest] = process.argv;
const flags = new Set(rest.concat(arg?.startsWith('--') ? [arg] : []));
const name = arg && !arg.startsWith('--') ? arg : undefined;

switch (cmd) {
  case 'status': case 'ls': case 'list': await cmdStatus(); break;
  case 'new': cmdNew(name ?? die('usage: pnpm lane new <name>'), {
    dry: flags.has('--dry-run'), tunnel: !flags.has('--no-tunnel'),
  }); break;
  case 'up': cmdUp(name ?? die('usage: pnpm lane up <name>')); break;
  case 'down': cmdDown(name ?? die('usage: pnpm lane down <name>')); break;
  case 'land': cmdLand(name ?? die('usage: pnpm lane land <name>'), { verify: !flags.has('--no-verify') }); break;
  case 'rm': case 'remove': cmdRm(name ?? die('usage: pnpm lane rm <name>')); break;
  case 'doctor': cmdDoctor({ dry: flags.has('--dry-run') }); break;
  default: die(`unknown command "${cmd}" — status | new | up | down | land | rm | doctor`);
}
