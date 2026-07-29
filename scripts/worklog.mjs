#!/usr/bin/env node
/**
 * Global agent work-log — cross-session context survival.
 *
 *   pnpm worklog "<action>" [--result done] [--ticket ALP-2.1] [--agent claude] [--commit <sha>]
 *   pnpm worklog:tail [N]                 # read the last N entries (default 10), newest first
 *
 * WHY: an agent starting a task should read the last ~10 entries to know what
 * just happened (across sessions), and append one entry when it finishes. This
 * is the durable, human-readable memory that Neon run-history isn't.
 *
 * STORAGE: one append-only file PER LANE — `docs/agent-log/entries/<lane>.md`.
 * Per-lane sharding means two lanes NEVER touch the same file, so worktree
 * branches merge into main without append conflicts (the same collision-avoidance
 * reasoning behind the worktree lanes themselves). `tail` globs every lane file,
 * merges by timestamp, and prints the newest N — so it reads as one log.
 *
 * Cross-lane visibility is eventual: a lane sees another lane's entries only once
 * that lane's file has merged to the shared branch. Within a lane it is immediate
 * and complete. (Live cross-lane state belongs in Neon, not here.)
 *
 * Entry line (one markdown list item, ISO timestamp first for machine sorting):
 *   - `2026-07-15T04:12:33Z` · **<lane>** · <branch> · <agent> · <action> — <result> · <ticket> · <commit>
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const ENTRIES_DIR = path.join(REPO_ROOT, 'docs', 'agent-log', 'entries');
const TS_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/;

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

/**
 * Which checkout this entry came from — the directory name, minus the repo
 * prefix (`cycleforge-fba` → `fba`, the main checkout → `main`).
 *
 * This used to read the lane id out of `dev-worktrees.json` via the per-worktree
 * port resolver, falling back to the directory name. The resolver went with the
 * per-lane dev ports; the fallback was already the honest answer, and it works
 * for a checkout that was never registered in that file.
 */
function currentLane() {
  const top = git('rev-parse --show-toplevel');
  return top ? path.basename(top).replace(/^cycleforge-/, '') || 'main' : 'main';
}

function sanitizeLane(lane) {
  return String(lane).replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase() || 'main';
}

/** Split argv into positional args + a flag map (`--key value` / `--key=value`). */
function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          flags[a.slice(2)] = next;
          i++;
        } else {
          flags[a.slice(2)] = true;
        }
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function appendEntry({ action, result, ticket, agent, commit, lane }) {
  if (!action) {
    console.error('worklog: an action is required — e.g. `pnpm worklog "refactored X" --result done`');
    process.exit(1);
  }
  const laneId = sanitizeLane(lane || currentLane());
  const branch = git('branch --show-current') || '(detached)';
  const ts = new Date().toISOString();
  const who = agent || process.env.WORKLOG_AGENT || 'agent';

  const parts = [
    `- \`${ts}\``,
    `**${laneId}**`,
    branch,
    who,
    result ? `${action} — ${result}` : action,
  ];
  if (ticket) parts.push(String(ticket));
  if (commit) parts.push(`\`${String(commit).slice(0, 12)}\``);
  const line = parts.join(' · ') + '\n';

  fs.mkdirSync(ENTRIES_DIR, { recursive: true });
  const file = path.join(ENTRIES_DIR, `${laneId}.md`);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, `# Work-log — lane \`${laneId}\`\n\n> Append-only. Newest at the bottom. Read via \`pnpm worklog:tail\`.\n\n`);
  }
  fs.appendFileSync(file, line);
  process.stdout.write(`worklog ✎ ${laneId}: ${line}`);
}

function readEntries() {
  if (!fs.existsSync(ENTRIES_DIR)) return [];
  const files = fs.readdirSync(ENTRIES_DIR).filter((f) => f.endsWith('.md'));
  const entries = [];
  for (const f of files) {
    const text = fs.readFileSync(path.join(ENTRIES_DIR, f), 'utf8');
    for (const raw of text.split('\n')) {
      const line = raw.trimEnd();
      if (!line.startsWith('- ')) continue;
      const m = line.match(TS_RE);
      if (!m) continue;
      entries.push({ ts: m[0], line });
    }
  }
  // ISO-8601 Z timestamps sort lexicographically === chronologically.
  entries.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return entries;
}

function tail(n) {
  const count = Number.isFinite(n) && n > 0 ? n : 10;
  const entries = readEntries();
  if (!entries.length) {
    console.log('(work-log is empty — nothing recorded yet)');
    return;
  }
  for (const e of entries.slice(0, count)) console.log(e.line);
}

function main() {
  const argv = process.argv.slice(2);
  const sub = argv[0];

  if (sub === 'tail' || sub === 'read') {
    tail(Number(argv[1]));
    return;
  }

  const { positional, flags } = parseArgs(argv);
  appendEntry({
    action: positional.join(' ').trim(),
    result: typeof flags.result === 'string' ? flags.result : undefined,
    ticket: typeof flags.ticket === 'string' ? flags.ticket : undefined,
    agent: typeof flags.agent === 'string' ? flags.agent : undefined,
    commit: typeof flags.commit === 'string' ? flags.commit : undefined,
    lane: typeof flags.lane === 'string' ? flags.lane : undefined,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href || process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { appendEntry, readEntries, tail };
