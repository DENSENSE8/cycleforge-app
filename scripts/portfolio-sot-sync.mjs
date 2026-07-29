#!/usr/bin/env node
/**
 * Portfolio SoT sync — rebuilds docs/portfolio/DOC-CATALOG.md and the
 * worktree snapshot block in docs/portfolio/INDEX.md from real disk + git.
 *
 *   node scripts/portfolio-sot-sync.mjs
 *   node scripts/portfolio-sot-sync.mjs --check   # exit 1 if catalog stale
 *
 * Does NOT invent workstreams — only indexes files and live worktrees.
 * Workstream assignment uses the path→WS map below (edit map, re-run).
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const DOCS = path.join(REPO, 'docs');
const PORTFOLIO = path.join(DOCS, 'portfolio');
const CATALOG_PATH = path.join(PORTFOLIO, 'DOC-CATALOG.md');
const INDEX_PATH = path.join(PORTFOLIO, 'INDEX.md');
const WORKTREES_JSON = path.join(REPO, 'dev-worktrees.json');

const DOC_EXTS = new Set(['.md', '.mdx', '.html', '']);

/** path prefix (posix, under docs/) → default workstream id */
const PATH_WS = [
  ['portfolio/', 'WS-PORTFOLIO'],
  ['archive/', 'WS-PORTFOLIO'],
  ['README.md', 'WS-PORTFOLIO'],
  ['todo/GLASS', 'WS-GLASS'],
  ['todo/studio-', 'WS-STUDIO'],
  ['todo/agentic-loop', 'WS-ALP'],
  ['todo/connections-mdx', 'WS-CONN'],
  ['todo/highest-roi', 'WS-ROI'],
  ['todo/sourcing', 'WS-SRC'],
  ['todo/warehouse-map', 'WS-WH'],
  ['todo/contextual-my-day', 'WS-HOME'],
  ['todo/org-login-gate', 'WS-LOGIN'],
  ['todo/unbox-receive', 'WS-UNBOX'],
  ['todo/schema-wide-polymorphic', 'WS-POLY'],
  ['todo/polymorphic-tables', 'WS-POLY'],
  ['todo/polymorphic-receiving', 'WS-POLY'],
  ['todo/integrations-oauth', 'WS-INT'],
  ['todo/production-integrations', 'WS-INT'],
  ['todo/reversibility', 'WS-INT'],
  ['todo/saas-', 'WS-SAAS'],
  ['todo/beta-intake', 'WS-BETA'],
  ['todo/nextiva', 'WS-VOICE'],
  ['todo/onboarding', 'WS-ONB'],
  ['todo/ops-events', 'WS-ENGINE'],
  ['todo/serial-label', 'WS-SERIAL'],
  ['todo/tech-substitution', 'WS-SUB'],
  ['todo/cycleforge-sync', 'WS-SYNC'],
  ['todo/README.md', 'WS-PORTFOLIO'],
  ['todo/', 'WS-TODO-MISC'],
  ['master-connections-and-refactor/', 'WS-CONN'],
  ['operations-studio/', 'WS-STUDIO'],
  ['integrations/', 'WS-INT'],
  ['tenancy/', 'WS-TENANCY'],
  ['roadmap/', 'WS-ROADMAP'],
  ['partial/', 'WS-PARTIAL'],
  ['diagrams/', 'WS-DIAG'],
  ['design-system/', 'WS-DS'],
  ['design-system-token-simplification.md', 'WS-DS'],
  ['dev-workflow/', 'WS-DEV'],
  ['new-additions/', 'WS-NEW'],
  ['skills/', 'WS-SKILLS'],
  ['security/', 'WS-SEC'],
  ['portfolio/', 'WS-PORTFOLIO'],
];

function areaOf(rel) {
  const top = rel.split('/')[0] || 'root';
  const map = {
    portfolio: 'PORT',
    todo: 'TODO',
    'master-connections-and-refactor': 'CONN',
    'operations-studio': 'OPS',
    integrations: 'INT',
    tenancy: 'TEN',
    roadmap: 'ROAD',
    partial: 'PART',
    diagrams: 'DIAG',
    'design-system': 'DS',
    'dev-workflow': 'DEV',
    'new-additions': 'NEW',
    skills: 'SKILL',
    security: 'SEC',
  };
  return map[top] || 'ROOT';
}

function slugOf(rel) {
  const base = path.basename(rel, path.extname(rel))
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toUpperCase()
    .slice(0, 48);
  return base || 'FILE';
}

function docId(rel) {
  const area = areaOf(rel);
  const slug = slugOf(rel);
  // Disambiguate collisions with short path hash
  const h = crypto.createHash('sha1').update(rel).digest('hex').slice(0, 4).toUpperCase();
  return `DOC-${area}-${slug}-${h}`;
}

function workstreamOf(rel) {
  const posix = rel.split(path.sep).join('/');
  for (const [prefix, ws] of PATH_WS) {
    if (posix.startsWith(prefix) || posix.includes('/' + prefix)) {
      // only prefix match from start
    }
    if (posix.startsWith(prefix)) return ws;
  }
  // root-level specials
  if (/^CYCLE-FORGE-ROADMAP/.test(posix)) return 'WS-ROADMAP';
  if (/design-system/i.test(posix)) return 'WS-DS';
  if (/receiving|unbox|triage/i.test(posix)) return 'WS-RECV';
  if (/outbound|shipstation|fulfillment/i.test(posix)) return 'WS-SHIP';
  if (/branding|auth-coverage|architecture|settings|qa-org|tier0|second-tenant/i.test(posix)) return 'WS-PLATFORM';
  if (/search|ai-|unit-event|visual-receiving/i.test(posix)) return 'WS-SEARCH';
  if (/station-chassis|testing-vs/i.test(posix)) return 'WS-STATION';
  if (/zoho|BOSE|nango|nas-|google-drive|edge-rewrites/i.test(posix)) return 'WS-INT';
  return 'WS-DOCS-MISC';
}

function walkDocs(dir, base = DOCS, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkDocs(full, base, out);
    else {
      const ext = path.extname(name);
      const bare = !ext && name === 'CYCLE-FORGE-ROADMAP';
      if (DOC_EXTS.has(ext) || bare) {
        // skip binary-ish generated json in tenancy
        if (name.endsWith('.json')) continue;
        const rel = path.relative(base, full).split(path.sep).join('/');
        // Generated catalog must not index itself (would thrash --check / mtimes)
        if (rel === 'portfolio/DOC-CATALOG.md') continue;
        out.push(rel);
      }
    }
  }
  return out;
}

function gitWorktrees() {
  try {
    const out = execSync('git worktree list --porcelain', {
      cwd: REPO,
      encoding: 'utf8',
    });
    const trees = [];
    let cur = null;
    for (const line of out.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (cur) trees.push(cur);
        cur = {
          path: line.slice(9).trim(),
          head: null,
          branch: null,
          bare: false,
        };
      } else if (line.startsWith('HEAD ') && cur) {
        cur.head = line.slice(5).trim();
      } else if (line.startsWith('branch ') && cur) {
        cur.branch = line.slice(7).replace(/^refs\/heads\//, '').trim();
      } else if (line === 'bare' && cur) {
        cur.bare = true;
      } else if (line === '' && cur) {
        trees.push(cur);
        cur = null;
      }
    }
    if (cur) trees.push(cur);
    return trees.filter((t) => !t.bare);
  } catch {
    return [{ path: REPO, head: 'unknown', branch: 'main' }];
  }
}

function switcherIds() {
  try {
    const j = JSON.parse(fs.readFileSync(WORKTREES_JSON, 'utf8'));
    return new Map((j.trees || []).map((t) => [t.id, t]));
  } catch {
    return new Map();
  }
}

function idForWorktree(absPath, branch) {
  if (path.resolve(absPath) === REPO) return 'main';
  // Prefer topic/* branch names as WT-IDs (topic/fba → fba)
  if (branch && branch.startsWith('topic/')) {
    return branch.slice('topic/'.length).replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'topic';
  }
  if (branch === 'glass-design-system') return 'glass';
  if (branch === 'studio-catalog-followups') return 'studio';
  const base = path
    .basename(absPath)
    .replace(/^cycleforge-/, '')
    .replace(/[^a-z0-9-]/gi, '-')
    .toLowerCase();
  return base || 'tree';
}

function buildCatalogRows(files) {
  const rows = files.map((rel) => {
    const id = docId(rel);
    const ws = workstreamOf(rel);
    const full = path.join(DOCS, rel);
    const st = fs.statSync(full);
    return {
      id,
      rel,
      ws,
      bytes: st.size,
      mtime: st.mtime.toISOString().slice(0, 10),
    };
  });
  // sort by DOC id
  rows.sort((a, b) => a.id.localeCompare(b.id));
  // detect id collisions
  const seen = new Map();
  for (const r of rows) {
    if (seen.has(r.id)) {
      r.id = `${r.id}-X`;
    }
    seen.set(r.id, r.rel);
  }
  rows.sort((a, b) => a.id.localeCompare(b.id));
  return rows;
}

function renderCatalog(rows, worktrees, generatedAt) {
  const byWs = new Map();
  for (const r of rows) {
    if (!byWs.has(r.ws)) byWs.set(r.ws, []);
    byWs.get(r.ws).push(r);
  }
  const wsKeys = [...byWs.keys()].sort();

  let md = `# DOC catalog — machine-generated SoT

> **Do not hand-edit.** Regenerate: \`node scripts/portfolio-sot-sync.mjs\`  
> Generated: \`${generatedAt}\` · Files: **${rows.length}** · Repo: \`cycleforge-app\`  
> Parent index: [INDEX.md](./INDEX.md)

Every file under \`docs/\` (and extensionless roadmap files) gets a stable **DOC-*** id  
(\`DOC-{AREA}-{SLUG}-{hash4}\`). Sorted by **DOC id**. Workstream tags are path-derived.

---

## Live git worktrees (from \`git worktree list\`)

| WT-ID | Absolute path | Branch | HEAD (short) | Exists |
|-------|---------------|--------|--------------|--------|
`;

  for (const t of worktrees) {
    const id = idForWorktree(t.path, t.branch);
    const short = (t.head || '').slice(0, 9);
    const exists = fs.existsSync(t.path) ? 'yes' : 'NO';
    md += `| \`${id}\` | \`${t.path}\` | \`${t.branch || 'detached'}\` | \`${short}\` | ${exists} |\n`;
  }

  md += `
---

## Full file index (sorted by DOC id)

| DOC id | Workstream | Path |
|--------|------------|------|
`;

  for (const r of rows) {
    md += `| \`${r.id}\` | \`${r.ws}\` | [\`${r.rel}\`](../${r.rel}) |\n`;
  }

  md += `
---

## By workstream (sorted)

`;

  for (const ws of wsKeys) {
    const list = byWs.get(ws).slice().sort((a, b) => a.id.localeCompare(b.id));
    md += `### \`${ws}\` (${list.length})\n\n`;
    for (const r of list) {
      md += `- \`${r.id}\` — [\`${r.rel}\`](../${r.rel})\n`;
    }
    md += '\n';
  }

  md += `---

*End of catalog.*
`;
  return md;
}

function renderWorktreeBlock(worktrees, switcher) {
  const lines = [
    '## 1. Worktree / branch registry (live)',
    '',
    '> Snapshot from `git worktree list` + `dev-worktrees.json`. Refresh via',
    '> `node scripts/portfolio-sot-sync.mjs`.',
    '',
    '| WT-ID | Absolute path | Branch | HEAD | Switcher card | Unlock parked | Workstreams |',
    '|-------|---------------|--------|------|---------------|---------------|-------------|',
  ];

  for (const t of worktrees) {
    const id = idForWorktree(t.path, t.branch);
    const card = switcher.get(id);
    const relHint =
      path.resolve(t.path) === REPO
        ? '`.` (this repo)'
        : path.relative(path.dirname(REPO), t.path).startsWith('..')
          ? t.path
          : `../${path.basename(t.path)}`;
    const sw = card
      ? `yes · :${card.appPort ?? 3000}`
      : id === 'main'
        ? 'yes · :3000'
        : '**missing** — add to dev-worktrees.json';
    const unlock = card ? (card.unlockParked ? 'yes' : 'no') : id === 'main' ? 'no' : '—';
    const wsByWt = {
      main: 'WS-DOGFOOD + lane=main',
      glass: 'WS-GLASS',
      studio: 'WS-STUDIO',
      fba: 'WS-FBA',
      inventory: 'WS-INV',
      warehouse: 'WS-WH',
      sourcing: 'WS-SRC',
      'ai-chat': 'WS-AI',
      home: 'WS-HOME',
    };
    const ws = wsByWt[id] || '—';
    lines.push(
      `| \`${id}\` | \`${t.path}\` | \`${t.branch || 'detached'}\` | \`${(t.head || '').slice(0, 9)}\` | ${sw} | ${unlock} | ${ws} |`,
    );
  }

  lines.push('');
  lines.push('**Relative paths (for switcher / docs):**');
  lines.push('');
  lines.push('| WT-ID | Path relative to monorepo parent |');
  lines.push('|-------|----------------------------------|');
  for (const t of worktrees) {
    const id = idForWorktree(t.path, t.branch);
    const parent = path.dirname(REPO);
    const rel = path.relative(parent, t.path).split(path.sep).join('/') || path.basename(t.path);
    const fromApp = path.resolve(t.path) === REPO ? '.' : `../${path.basename(t.path)}`;
    lines.push(`| \`${id}\` | \`${fromApp}\` (parent: \`${rel}\`) |`);
  }

  lines.push('');
  lines.push('**Add a tree:**');
  lines.push('');
  lines.push('1. `git worktree add ../cycleforge-<id> -b <branch> main`');
  lines.push('2. Row appears after re-run of `portfolio-sot-sync.mjs`');
  lines.push('3. Card in `dev-worktrees.json` (registry only \u2014 the per-lane port');
  lines.push('   resolver was removed 2026-07-29; `pnpm dev` is a plain `next dev -p 3050`,');
  lines.push('   so a second checkout that wants its own server passes `-p` explicitly)');
  lines.push('4. Workstream row in \u00a72 with matching WT-ID');
  lines.push('');
  return lines.join('\n');
}

function patchIndexWorktreeSection(indexText, block) {
  const start = indexText.indexOf('## 1. Worktree');
  if (start < 0) {
    // insert after section 0
    const anchor = indexText.indexOf('\n## 2.');
    if (anchor < 0) return `${indexText}\n\n${block}\n`;
    return indexText.slice(0, anchor) + '\n' + block + '\n' + indexText.slice(anchor);
  }
  const next = indexText.indexOf('\n## 2.', start);
  if (next < 0) {
    return indexText.slice(0, start) + block + '\n';
  }
  return indexText.slice(0, start) + block + '\n' + indexText.slice(next + 1);
}

function main() {
  const check = process.argv.includes('--check');
  const generatedAt = new Date().toISOString();

  const files = walkDocs(DOCS).sort((a, b) => a.localeCompare(b));
  const rows = buildCatalogRows(files);
  const worktrees = gitWorktrees();
  const switcher = switcherIds();

  // Ensure switcher JSON has every live worktree
  const swCfg = fs.existsSync(WORKTREES_JSON)
    ? JSON.parse(fs.readFileSync(WORKTREES_JSON, 'utf8'))
    : { port: 3099, script: 'dev:tunnel', appPort: 3000, trees: [] };
  const byId = new Map((swCfg.trees || []).map((t) => [t.id, t]));
  let swChanged = false;
  for (const t of worktrees) {
    const id = idForWorktree(t.path, t.branch);
    if (!byId.has(id)) {
      const fromApp =
        path.resolve(t.path) === REPO ? '.' : `../${path.basename(t.path)}`;
      const labels = {
        main: 'Main · dogfood',
        glass: 'Glass design system',
        studio: 'Studio catalog',
        fba: 'FBA prep',
        inventory: 'Inventory',
        warehouse: 'Warehouse',
        sourcing: 'Sourcing',
        'ai-chat': 'AI chat',
        home: 'Home / My Day',
      };
      byId.set(id, {
        id,
        label: labels[id] || `${id} · ${t.branch || 'detached'}`,
        path: fromApp,
        appPort: 3000,
        unlockParked: id !== 'main',
        note: `WS · ${t.branch || 'detached'} · docs/portfolio/WORKTREE-LANES.md`,
      });
      swChanged = true;
      console.log(`+ dev-worktrees.json card: ${id}`);
    } else {
      // refresh path if wrong
      const fromApp =
        path.resolve(t.path) === REPO ? '.' : `../${path.basename(t.path)}`;
      const cur = byId.get(id);
      if (cur.path !== fromApp) {
        cur.path = fromApp;
        swChanged = true;
      }
    }
  }
  // sort trees: main first
  swCfg.trees = [...byId.values()].sort((a, b) => {
    if (a.id === 'main') return -1;
    if (b.id === 'main') return 1;
    return a.id.localeCompare(b.id);
  });
  if (swChanged && !check) {
    fs.writeFileSync(WORKTREES_JSON, JSON.stringify(swCfg, null, 2) + '\n');
  }

  const catalog = renderCatalog(rows, worktrees, generatedAt);

  if (check) {
    if (!fs.existsSync(CATALOG_PATH)) {
      console.error('DOC-CATALOG.md missing');
      process.exit(1);
    }
    const existing = fs.readFileSync(CATALOG_PATH, 'utf8');
    // compare without volatile timestamp
    const norm = (s) =>
      s
        .replace(/Generated: `[^`]+`/g, 'Generated: _')
        .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '_TS_');
    if (norm(existing) !== norm(catalog)) {
      console.error('DOC-CATALOG.md is stale — run: node scripts/portfolio-sot-sync.mjs');
      process.exit(1);
    }
    console.log('DOC-CATALOG.md up to date (%d files)', rows.length);
    process.exit(0);
  }

  fs.mkdirSync(PORTFOLIO, { recursive: true });
  fs.writeFileSync(CATALOG_PATH, catalog);
  console.log('wrote', path.relative(REPO, CATALOG_PATH), `(${rows.length} docs)`);

  if (fs.existsSync(INDEX_PATH)) {
    let index = fs.readFileSync(INDEX_PATH, 'utf8');
    const block = renderWorktreeBlock(worktrees, byId);
    index = patchIndexWorktreeSection(index, block);
    // stamp
    index = index.replace(
      /\*\*Catalog:\*\*.*/,
      `**Catalog:** [\`DOC-CATALOG.md\`](./DOC-CATALOG.md) (${rows.length} files, regenerated ${generatedAt.slice(0, 10)}) · run \`node scripts/portfolio-sot-sync.mjs\``,
    );
    if (!index.includes('**Catalog:**')) {
      index = index.replace(
        /\*\*Local trees:\*\*.*/,
        (m) =>
          `${m}\n> **Catalog:** [\`DOC-CATALOG.md\`](./DOC-CATALOG.md) (${rows.length} files, regenerated ${generatedAt.slice(0, 10)}) · run \`node scripts/portfolio-sot-sync.mjs\``,
      );
    }
    fs.writeFileSync(INDEX_PATH, index);
    console.log('patched worktree section in INDEX.md');
  }

  // coverage report
  const unmapped = rows.filter((r) => r.ws === 'WS-DOCS-MISC' || r.ws === 'WS-TODO-MISC');
  if (unmapped.length) {
    console.log(`note: ${unmapped.length} files on misc workstreams (still indexed)`);
  }
}

main();
