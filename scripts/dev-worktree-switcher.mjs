#!/usr/bin/env node
/**
 * Local worktree switcher — control panel for Cycle Forge dev.
 *
 *   pnpm dev:switcher
 *   → http://127.0.0.1:3099
 *
 * Click a worktree → stop current stack → start that tree with `dev:tunnel`
 * (Next + Cloudflare named tunnel). Binds 127.0.0.1 only.
 *
 * Optional: dev-worktrees.json in repo root (see example in repo).
 */

import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const HOST = '127.0.0.1';
const DEFAULT_SWITCHER_PORT = 3099;
/** Tunnel dashboard route is localhost:3000 — all trees share this port (one at a time). */
const DEFAULT_APP_PORT = 3000;
const DEFAULT_TUNNEL_HOST = 'usav-dev.michaelgarisek.com';

// ─── state ───────────────────────────────────────────────────────────────────

/** @type {null | {
 *   id: string, pid: number, appPort: number, cwd: string,
 *   startedAt: string, unlockParked: boolean, ready: boolean, phase: string
 * }} */
let active = null;
/** @type {import('node:child_process').ChildProcess | null} */
let child = null;
/** @type {string[]} */
const logBuffer = [];
const LOG_MAX = 280;

function log(line) {
  const row = `[${new Date().toISOString().slice(11, 19)}] ${line}`;
  logBuffer.push(row);
  if (logBuffer.length > LOG_MAX) logBuffer.shift();
  console.log(row);
}

function stripAnsi(s) {
  return String(s).replace(/\x1b\[[0-9;]*m/g, '');
}

// ─── config / discovery ──────────────────────────────────────────────────────

function loadConfig() {
  const configPath = path.join(REPO_ROOT, 'dev-worktrees.json');
  if (!fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    log(`config parse error: ${e.message} — falling back to git discovery`);
    return null;
  }
}

function readTunnelHost(cwd) {
  try {
    const envLocal = path.join(cwd, '.env.local');
    const envFile = path.join(cwd, '.env');
    for (const f of [envLocal, envFile]) {
      if (!fs.existsSync(f)) continue;
      const text = fs.readFileSync(f, 'utf8');
      const m = text.match(/^CLOUDFLARE_DEV_TUNNEL_HOST=(.+)$/m);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    /* ignore */
  }
  return process.env.CLOUDFLARE_DEV_TUNNEL_HOST?.trim() || DEFAULT_TUNNEL_HOST;
}

function discoverGitWorktrees() {
  try {
    const out = execSync('git worktree list --porcelain', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    const trees = [];
    let cur = null;
    for (const line of out.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (cur) trees.push(cur);
        cur = { path: line.slice('worktree '.length).trim(), branch: null, bare: false };
      } else if (line.startsWith('branch ') && cur) {
        cur.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '').trim();
      } else if (line === 'bare' && cur) {
        cur.bare = true;
      } else if (line === '' && cur) {
        trees.push(cur);
        cur = null;
      }
    }
    if (cur) trees.push(cur);
    return trees.filter((t) => !t.bare && t.path);
  } catch (e) {
    log(`git worktree list failed: ${e.message}`);
    return [{ path: REPO_ROOT, branch: 'main' }];
  }
}

function resolveTrees() {
  const cfg = loadConfig();
  const switcherPort = Number(cfg?.port) || DEFAULT_SWITCHER_PORT;
  // Always tunnel for worktrees (user request). Overridable only via config.
  const script = String(cfg?.script || 'dev:tunnel');
  // One app at a time on the tunnel port (default 3000).
  const sharedPort = Number(cfg?.appPort) || DEFAULT_APP_PORT;
  const tunnelHost = readTunnelHost(REPO_ROOT);

  if (cfg?.trees?.length) {
    const trees = cfg.trees.map((t, i) => {
      const abs = path.isAbsolute(t.path) ? t.path : path.resolve(REPO_ROOT, t.path);
      return {
        id: String(t.id || `tree-${i}`),
        label: String(t.label || t.id || path.basename(abs)),
        path: abs,
        branch: t.branch || null,
        // Prefer shared tunnel port so cloudflared route stays correct.
        appPort: Number(t.appPort) || sharedPort,
        unlockParked: Boolean(t.unlockParked),
        exists: fs.existsSync(abs),
        script: String(t.script || script),
        note: t.note || null,
      };
    });
    return { switcherPort, trees, script, tunnelHost, sharedPort };
  }

  const discovered = discoverGitWorktrees();
  discovered.sort((a, b) => {
    if (path.resolve(a.path) === REPO_ROOT) return -1;
    if (path.resolve(b.path) === REPO_ROOT) return 1;
    return a.path.localeCompare(b.path);
  });

  const trees = discovered.map((t, i) => {
    const abs = path.resolve(t.path);
    const isMain = abs === REPO_ROOT;
    const base = path.basename(abs);
    return {
      id: isMain ? 'main' : base.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase() || `tree-${i}`,
      label: isMain ? 'Main · dogfood' : base,
      path: abs,
      branch: t.branch,
      appPort: sharedPort,
      unlockParked: !isMain,
      exists: fs.existsSync(abs),
      script,
      note: null,
    };
  });

  return { switcherPort, trees, script, tunnelHost, sharedPort };
}

// ─── process control ─────────────────────────────────────────────────────────

function killPidTree(pid) {
  if (!pid || pid <= 0) return;
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* already dead */
    }
  }
  // Escalate if needed
  setTimeout(() => {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        /* ignore */
      }
    }
  }, 2500).unref();
}

function freePort(port) {
  try {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      const pids = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true`, {
        encoding: 'utf8',
      })
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      for (const p of pids) {
        try {
          process.kill(Number(p), 'SIGTERM');
          log(`freed port ${port} (pid ${p})`);
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
}

/** cloudflared often leaves no LISTEN on app port; best-effort cleanup by name */
function killStrayCloudflared() {
  try {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      execSync('pkill -f "cloudflared tunnel" 2>/dev/null || true', { stdio: 'ignore' });
    }
  } catch {
    /* ignore */
  }
}

function stopActive() {
  if (child) {
    log(`stopping child pid=${child.pid}`);
    killPidTree(child.pid);
    child = null;
  }
  if (active) {
    freePort(active.appPort);
    killStrayCloudflared();
    log(`stopped ${active.id}`);
    active = null;
  }
}

function packageManager(cwd) {
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(cwd, 'package-lock.json'))) return 'npm';
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn';
  return 'pnpm';
}

/**
 * Start worktree via package.json script (default `dev:tunnel`).
 * Port is passed ONLY via env (PORT / DEV_PORT) — never `pnpm … -- -p`,
 * which breaks `next dev --turbopack` (`-p` becomes a project directory).
 */
function startTree(tree) {
  if (!tree.exists) {
    throw new Error(`Worktree path does not exist: ${tree.path}`);
  }

  const pkgPath = path.join(tree.path, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`No package.json in ${tree.path}`);
  }
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    throw new Error(`Invalid package.json in ${tree.path}`);
  }
  const scriptName = tree.script || 'dev:tunnel';
  if (!pkg.scripts?.[scriptName]) {
    throw new Error(
      `Script "${scriptName}" missing in ${tree.path}. Add it or set "script" in dev-worktrees.json.`,
    );
  }

  stopActive();
  freePort(tree.appPort);
  // Brief settle so ports release
  execSync('sleep 0.4', { stdio: 'ignore' });

  const pm = packageManager(tree.path);
  const cwd = tree.path;
  const env = { ...process.env };
  env.PORT = String(tree.appPort);
  env.DEV_PORT = String(tree.appPort);

  if (tree.unlockParked) {
    env.DOGFOOD_FULL_SURFACE = '1';
    env.NEXT_PUBLIC_DOGFOOD_FULL_SURFACE = '1';
  } else {
    delete env.DOGFOOD_FULL_SURFACE;
    delete env.NEXT_PUBLIC_DOGFOOD_FULL_SURFACE;
  }

  // pnpm run dev:tunnel   — do NOT append -- -p (breaks next)
  const args = pm === 'npm' ? ['run', scriptName] : ['run', scriptName];

  log(`starting ${tree.id} → ${pm} run ${scriptName} (cwd=${cwd}) port=${tree.appPort} unlock=${Boolean(tree.unlockParked)}`);

  const proc = spawn(pm, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    shell: process.platform === 'win32',
  });

  child = proc;
  active = {
    id: tree.id,
    pid: proc.pid,
    appPort: tree.appPort,
    cwd,
    startedAt: new Date().toISOString(),
    unlockParked: Boolean(tree.unlockParked),
    ready: false,
    phase: 'starting',
    script: scriptName,
  };

  const onData = (buf) => {
    const text = stripAnsi(buf.toString());
    for (const line of text.split('\n')) {
      const trimmed = line.trimEnd();
      if (!trimmed) continue;
      log(`[${tree.id}] ${trimmed}`);
      if (!active || active.pid !== proc.pid) continue;

      if (/Starting Next\.js|next dev|Ready in|Local:/i.test(trimmed)) {
        active.phase = 'next';
      }
      if (/Ready in|✓ Ready|started server on/i.test(trimmed)) {
        active.phase = 'next-ready';
      }
      if (/Starting Cloudflare|cloudflared|Named dev tunnel/i.test(trimmed)) {
        active.phase = 'tunnel';
      }
      if (/Registered tunnel connection|Connection established|Named dev tunnel is up/i.test(trimmed)) {
        active.ready = true;
        active.phase = 'ready';
      }
    }
  };
  proc.stdout?.on('data', onData);
  proc.stderr?.on('data', onData);
  proc.on('exit', (code, signal) => {
    log(`${tree.id} exited code=${code} signal=${signal}`);
    if (active?.pid === proc.pid) active = null;
    if (child === proc) child = null;
  });
  proc.on('error', (err) => {
    log(`${tree.id} spawn error: ${err.message}`);
  });

  return active;
}

// ─── HTML UI ─────────────────────────────────────────────────────────────────

function pageHtml({ trees, switcherPort, tunnelHost, script }) {
  const treesJson = JSON.stringify(trees);
  const tunnelHostJson = JSON.stringify(tunnelHost);
  const scriptJson = JSON.stringify(script);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Worktree switcher</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>
    :root {
      color-scheme: light;
      --bg0: #f4f6f8;
      --bg1: #eef1f4;
      --card: #ffffff;
      --ink: #0f172a;
      --muted: #64748b;
      --faint: #94a3b8;
      --line: #e2e8f0;
      --line-strong: #cbd5e1;
      --blue: #2563eb;
      --blue-soft: #eff6ff;
      --blue-ring: #bfdbfe;
      --green: #059669;
      --green-soft: #ecfdf5;
      --amber: #d97706;
      --amber-soft: #fffbeb;
      --rose: #e11d48;
      --rose-soft: #fff1f2;
      --shadow: 0 1px 2px rgba(15,23,42,.04), 0 8px 24px rgba(15,23,42,.06);
      --radius: 14px;
      --font: "DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif;
      --mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: var(--font);
      color: var(--ink);
      background:
        radial-gradient(900px 420px at 10% -10%, #dbeafe 0%, transparent 55%),
        radial-gradient(700px 380px at 100% 0%, #e0e7ff 0%, transparent 50%),
        var(--bg0);
    }
    .shell {
      max-width: 760px;
      margin: 0 auto;
      padding: 28px 18px 40px;
    }
    header.top {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 16px;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 18px;
    }
    .brand {
      display: flex;
      gap: 12px;
      align-items: center;
    }
    .mark {
      width: 40px; height: 40px; border-radius: 12px;
      background: linear-gradient(145deg, #3b82f6, #1d4ed8);
      box-shadow: 0 6px 16px rgba(37,99,235,.28);
      display: grid; place-items: center;
      color: #fff; font-weight: 700; font-size: 14px; letter-spacing: -.02em;
    }
    h1 {
      margin: 0;
      font-size: 1.15rem;
      font-weight: 700;
      letter-spacing: -0.03em;
    }
    .sub {
      margin: 2px 0 0;
      font-size: 0.82rem;
      color: var(--muted);
      line-height: 1.4;
    }
    .toolbar {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    button, .btn {
      appearance: none;
      border: none;
      cursor: pointer;
      font-family: inherit;
      font-weight: 600;
      font-size: 0.8rem;
      border-radius: 10px;
      padding: 9px 12px;
      transition: background .12s, transform .08s, box-shadow .12s, border-color .12s;
    }
    button:active:not(:disabled) { transform: translateY(1px); }
    button:disabled { opacity: .45; cursor: not-allowed; }
    .btn-primary {
      background: var(--blue);
      color: #fff;
      box-shadow: 0 1px 0 rgba(255,255,255,.2) inset, 0 4px 12px rgba(37,99,235,.25);
    }
    .btn-primary:hover:not(:disabled) { background: #1d4ed8; }
    .btn-ghost {
      background: var(--card);
      color: #334155;
      border: 1px solid var(--line);
    }
    .btn-ghost:hover:not(:disabled) { background: #f8fafc; border-color: var(--line-strong); }
    .btn-danger {
      background: var(--card);
      color: var(--rose);
      border: 1px solid #fecdd3;
    }
    .btn-danger:hover:not(:disabled) { background: var(--rose-soft); }
    .btn-sm { padding: 7px 10px; font-size: 0.75rem; }

    .status {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 14px 16px;
      margin-bottom: 14px;
      display: grid;
      gap: 10px;
    }
    .status-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 14px;
      align-items: center;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--ink);
    }
    .dot {
      width: 9px; height: 9px; border-radius: 99px;
      background: #94a3b8;
      box-shadow: 0 0 0 3px rgba(148,163,184,.18);
    }
    .dot.ready { background: var(--green); box-shadow: 0 0 0 3px rgba(5,150,105,.18); }
    .dot.busy { background: var(--amber); box-shadow: 0 0 0 3px rgba(217,119,6,.18); animation: pulse 1.1s ease-in-out infinite; }
    .dot.off { background: #94a3b8; }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: .55; }
    }
    .links { display: flex; flex-wrap: wrap; gap: 8px; }
    .link-chip {
      display: inline-flex; align-items: center; gap: 6px;
      text-decoration: none;
      font-size: 0.75rem; font-weight: 600;
      padding: 6px 10px; border-radius: 999px;
      border: 1px solid var(--line);
      background: var(--bg0);
      color: var(--ink);
    }
    .link-chip:hover { border-color: var(--blue-ring); background: var(--blue-soft); color: var(--blue); }
    .link-chip.public { background: var(--green-soft); border-color: #a7f3d0; color: #047857; }
    .link-chip.public:hover { background: #d1fae5; }
    .mono { font-family: var(--mono); font-size: 0.72rem; font-weight: 500; }

    .section-label {
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--faint);
      margin: 6px 2px 8px;
    }

    .grid { display: grid; gap: 10px; }
    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 14px 14px 14px 16px;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px 14px;
      align-items: center;
      transition: border-color .12s, box-shadow .12s, background .12s;
    }
    .card:hover { border-color: var(--line-strong); }
    .card.active {
      border-color: var(--blue-ring);
      background: linear-gradient(180deg, #f8fbff 0%, #fff 100%);
      box-shadow: 0 0 0 1px var(--blue-ring), var(--shadow);
    }
    .card.missing { opacity: .55; }
    .card-main { min-width: 0; }
    .title-row {
      display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
    }
    .label { font-weight: 700; font-size: 0.95rem; letter-spacing: -0.02em; }
    .badge {
      font-size: 0.62rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
      padding: 3px 7px; border-radius: 999px;
      border: 1px solid var(--line);
      background: var(--bg0);
      color: var(--muted);
    }
    .badge.live { background: var(--green-soft); color: #047857; border-color: #a7f3d0; }
    .badge.unlock { background: var(--amber-soft); color: #b45309; border-color: #fde68a; }
    .badge.missing { background: var(--rose-soft); color: #be123c; border-color: #fecdd3; }
    .path {
      margin-top: 4px;
      font-family: var(--mono);
      font-size: 0.68rem;
      color: var(--muted);
      word-break: break-all;
    }
    .meta-row {
      display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;
    }
    .chip {
      font-size: 0.65rem; font-weight: 600;
      padding: 3px 8px; border-radius: 999px;
      background: #f1f5f9; color: #475569;
      border: 1px solid var(--line);
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: stretch;
      min-width: 108px;
    }
    .err {
      color: var(--rose);
      font-size: 0.8rem;
      font-weight: 600;
      min-height: 1.2em;
      margin: 10px 2px 0;
    }
    .log-wrap {
      margin-top: 16px;
      background: #0b1220;
      color: #cbd5e1;
      border-radius: var(--radius);
      overflow: hidden;
      border: 1px solid #1e293b;
      box-shadow: var(--shadow);
    }
    .log-head {
      display: flex; justify-content: space-between; align-items: center;
      padding: 8px 12px;
      background: #111827;
      border-bottom: 1px solid #1e293b;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: #94a3b8;
    }
    .log-head button {
      background: transparent;
      border: 1px solid #334155;
      color: #cbd5e1;
      padding: 4px 8px;
      font-size: 0.68rem;
      border-radius: 6px;
    }
    .log-head button:hover { background: #1e293b; }
    .log {
      margin: 0;
      padding: 12px 14px 14px;
      font-family: var(--mono);
      font-size: 0.68rem;
      line-height: 1.5;
      max-height: 240px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .hint {
      margin: 14px 2px 0;
      font-size: 0.75rem;
      color: var(--muted);
      line-height: 1.45;
    }
    .hint code {
      font-family: var(--mono);
      font-size: 0.7rem;
      background: #e2e8f0;
      padding: 1px 5px;
      border-radius: 4px;
      color: #334155;
    }
    @media (max-width: 560px) {
      .card { grid-template-columns: 1fr; }
      .actions { flex-direction: row; min-width: 0; }
      .actions .btn-primary { flex: 1; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="top">
      <div class="brand">
        <div class="mark" aria-hidden="true">CF</div>
        <div>
          <h1>Worktree switcher</h1>
          <p class="sub">Start one tree at a time via <strong id="script-name"></strong> · local + tunnel</p>
        </div>
      </div>
      <div class="toolbar">
        <button type="button" class="btn-ghost" id="btn-refresh">Refresh</button>
        <button type="button" class="btn-danger" id="btn-stop">Stop</button>
      </div>
    </header>

    <section class="status" aria-live="polite">
      <div class="status-row">
        <span class="pill"><span class="dot off" id="dot"></span><span id="status-text">Loading…</span></span>
      </div>
      <div class="links" id="links"></div>
    </section>

    <div class="section-label">Worktrees</div>
    <div class="grid" id="grid"></div>
    <p class="err" id="err"></p>

    <div class="log-wrap">
      <div class="log-head">
        <span>Live log</span>
        <button type="button" id="btn-copy-log">Copy</button>
      </div>
      <pre class="log" id="log">…</pre>
    </div>

    <p class="hint">
      Panel: <code>http://127.0.0.1:${switcherPort}</code>
      · Config: <code>dev-worktrees.json</code>
      · Each Start runs <code>pnpm run ${script}</code> with <code>PORT</code> set (no broken <code>-p</code> flags)
      · Public tunnel host: <code id="tunnel-host-hint"></code>
    </p>
  </div>

  <script>
    const TREES = ${treesJson};
    const TUNNEL_HOST = ${tunnelHostJson};
    const SCRIPT = ${scriptJson};
    const $ = (id) => document.getElementById(id);

    $('script-name').textContent = SCRIPT;
    $('tunnel-host-hint').textContent = TUNNEL_HOST;

    async function api(path, opts) {
      const res = await fetch(path, {
        headers: { 'Content-Type': 'application/json' },
        ...opts,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText || 'Request failed');
      return data;
    }

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function phaseLabel(active) {
      if (!active) return null;
      if (active.ready || active.phase === 'ready') return 'Ready';
      if (active.phase === 'tunnel') return 'Connecting tunnel…';
      if (active.phase === 'next-ready') return 'Next ready · starting tunnel…';
      if (active.phase === 'next') return 'Starting Next…';
      return 'Starting…';
    }

    function renderStatus(s) {
      const active = s.active;
      const dot = $('dot');
      const text = $('status-text');
      const links = $('links');
      links.innerHTML = '';

      if (active) {
        const phase = phaseLabel(active);
        const isReady = active.ready || active.phase === 'ready';
        dot.className = 'dot ' + (isReady ? 'ready' : 'busy');
        text.textContent = active.id + ' · ' + phase;
        const local = 'http://127.0.0.1:' + active.appPort;
        const publicUrl = 'https://' + (s.tunnelHost || TUNNEL_HOST);
        links.innerHTML =
          '<a class="link-chip" href="' + local + '" target="_blank" rel="noreferrer">' +
            '<span>Local</span><span class="mono">' + local.replace('http://', '') + '</span></a>' +
          '<a class="link-chip public" href="' + publicUrl + '" target="_blank" rel="noreferrer">' +
            '<span>Tunnel</span><span class="mono">' + publicUrl.replace('https://', '') + '</span></a>' +
          (active.unlockParked
            ? '<span class="badge unlock">Parked pages unlocked</span>'
            : '<span class="badge">Parked pages locked</span>');
      } else {
        dot.className = 'dot off';
        text.textContent = 'Idle — pick a worktree to start';
      }

      $('log').textContent = (s.logs || []).join('\\n') || '(no logs yet)';
      $('log').scrollTop = $('log').scrollHeight;
    }

    function renderGrid(activeId, activeReady) {
      const grid = $('grid');
      grid.innerHTML = '';
      for (const t of TREES) {
        const isActive = activeId === t.id;
        const card = document.createElement('article');
        card.className = 'card' + (isActive ? ' active' : '') + (!t.exists ? ' missing' : '');
        card.innerHTML =
          '<div class="card-main">' +
            '<div class="title-row">' +
              '<span class="label">' + escapeHtml(t.label) + '</span>' +
              (isActive ? '<span class="badge live">' + (activeReady ? 'Running' : 'Starting') + '</span>' : '') +
              (t.unlockParked ? '<span class="badge unlock">Unlock parked</span>' : '') +
              (!t.exists ? '<span class="badge missing">Missing path</span>' : '') +
            '</div>' +
            '<div class="path">' + escapeHtml(t.path) + '</div>' +
            '<div class="meta-row">' +
              '<span class="chip">:' + t.appPort + '</span>' +
              (t.branch ? '<span class="chip">' + escapeHtml(t.branch) + '</span>' : '') +
              '<span class="chip">' + escapeHtml(t.script || SCRIPT) + '</span>' +
              (t.note ? '<span class="chip">' + escapeHtml(t.note) + '</span>' : '') +
            '</div>' +
          '</div>' +
          '<div class="actions">' +
            '<button type="button" class="btn-primary" data-start="' + t.id + '"' +
              (!t.exists ? ' disabled' : '') + '>' +
              (isActive ? 'Restart' : 'Start') +
            '</button>' +
          '</div>';
        grid.appendChild(card);
      }
      grid.querySelectorAll('[data-start]').forEach((btn) => {
        btn.addEventListener('click', () => start(btn.getAttribute('data-start'), btn));
      });
    }

    async function refresh() {
      $('err').textContent = '';
      try {
        const s = await api('/api/status');
        renderStatus(s);
        renderGrid(s.active?.id || null, Boolean(s.active?.ready || s.active?.phase === 'ready'));
      } catch (e) {
        $('err').textContent = e.message;
      }
    }

    async function start(id, btn) {
      $('err').textContent = '';
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Starting…';
      }
      try {
        const s = await api('/api/start', { method: 'POST', body: JSON.stringify({ id }) });
        renderStatus(s);
        renderGrid(s.active?.id || null, false);
      } catch (e) {
        $('err').textContent = e.message;
        refresh();
      }
    }

    async function stop() {
      $('err').textContent = '';
      try {
        const s = await api('/api/stop', { method: 'POST', body: '{}' });
        renderStatus(s);
        renderGrid(null, false);
      } catch (e) {
        $('err').textContent = e.message;
      }
    }

    $('btn-refresh').addEventListener('click', refresh);
    $('btn-stop').addEventListener('click', stop);
    $('btn-copy-log').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText($('log').textContent || '');
        $('btn-copy-log').textContent = 'Copied';
        setTimeout(() => { $('btn-copy-log').textContent = 'Copy'; }, 1200);
      } catch {
        $('err').textContent = 'Could not copy log';
      }
    });

    refresh();
    setInterval(refresh, 2000);
  </script>
</body>
</html>`;
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function main() {
  const { switcherPort, trees, script, tunnelHost, sharedPort } = resolveTrees();
  const byId = new Map(trees.map((t) => [t.id, t]));

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${HOST}:${switcherPort}`);
    const ra = req.socket.remoteAddress;
    if (ra && ra !== '127.0.0.1' && ra !== '::1' && ra !== '::ffff:127.0.0.1') {
      json(res, 403, { error: 'localhost only' });
      return;
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(pageHtml({ trees, switcherPort, tunnelHost, script }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/status') {
      json(res, 200, {
        active,
        trees,
        logs: logBuffer.slice(-100),
        tunnelHost,
        script,
        sharedPort,
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/stop') {
      stopActive();
      json(res, 200, { active: null, logs: logBuffer.slice(-100), tunnelHost, script });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/start') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let id;
      try {
        id = JSON.parse(body || '{}').id;
      } catch {
        json(res, 400, { error: 'invalid JSON' });
        return;
      }
      const tree = byId.get(id);
      if (!tree) {
        json(res, 404, { error: `unknown tree id: ${id}` });
        return;
      }
      try {
        startTree(tree);
        json(res, 200, { active, logs: logBuffer.slice(-100), tunnelHost, script });
      } catch (e) {
        json(res, 500, { error: e.message || String(e) });
      }
      return;
    }

    json(res, 404, { error: 'not found' });
  });

  server.listen(switcherPort, HOST, () => {
    log(`worktree switcher → http://${HOST}:${switcherPort}`);
    log(`default script: ${script} · shared app port: ${sharedPort} · tunnel: https://${tunnelHost}`);
    log(`trees: ${trees.map((t) => `${t.id}${t.exists ? '' : ' (MISSING)'}`).join(', ')}`);
  });

  const shutdown = () => {
    log('switcher shutting down…');
    stopActive();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
