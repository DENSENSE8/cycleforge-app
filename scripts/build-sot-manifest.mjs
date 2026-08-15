/**
 * SoT-by-job manifest builder (governance reset 2026-08-12).
 *
 * Projects live Source-of-Truth knowledge from:
 *   1. `AGENTS.md` — region tables + hard-law goldens
 *   2. Active codebase exports under design-system + named feature hosts
 *
 * into a machine-readable catalog `{ job → { sot, path, guard, symbols, … } }`.
 *
 * Usage:
 *   node scripts/build-sot-manifest.mjs           # regenerate sot-manifest.json
 *   node scripts/build-sot-manifest.mjs --check    # exit 1 if out of date
 *   node scripts/build-sot-manifest.mjs --stdout    # print JSON, do not write
 *
 * Retrieval: `scripts/sot-lookup.mjs`
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..');
export const MANIFEST_PATH = path.join(REPO_ROOT, 'sot-manifest.json');

/** Prose / table sources (reviewable list — not a fragile fs glob of archived rules). */
export const SOT_SOURCE_FILES = ['AGENTS.md'];

const PROSE_LAW_FILES = new Set(['AGENTS.md']);

/**
 * Directories scanned for exported SoT symbols. Feature folders are intentional —
 * the catalog must index hosts outside `src/design-system/`.
 */
export const CODE_SCAN_ROOTS = [
  'src/design-system/primitives',
  'src/design-system/components',
  'src/design-system/tokens',
  'src/design-system/motion',
  'src/design-system/shells',
  'src/components/tables',
  'src/components/dashboard',
  'src/components/station',
  'src/components/ui',
  'src/components/right-rail',
  'src/components/saved-views',
  'src/components/sidebar',
  'src/components/studio',
  'src/lib/right-rail',
  'src/lib/urgency',
  'src/lib/inventory',
  'src/lib/tenancy',
  'src/lib/routing',
  'src/lib/source-platform.ts',
  'src/lib/perf',
  'src/lib/keyboard',
  'src/lib/orders-sync',
  'src/hooks',
];

const SKIP_NAME_RE =
  /\.(test|spec|guard\.test)\.(ts|tsx)$|\/(__tests__|fixtures|stories)\/|jscpd-.*-probe/;

// ─────────────────────────────────────────────────────────────────────────────
// Markdown parsing (AGENTS.md)
// ─────────────────────────────────────────────────────────────────────────────

function splitCells(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|\s*$/, '');
  const cells = [];
  let buf = '';
  let tick = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '\\' && trimmed[i + 1] === '|') {
      buf += '|';
      i++;
      continue;
    }
    if (ch === '`') {
      tick = !tick;
      buf += ch;
      continue;
    }
    if (ch === '|' && !tick) {
      cells.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  cells.push(buf);
  return cells.map((c) => c.trim());
}

function isSeparatorRow(line) {
  return /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && /-/.test(line);
}

function isTableRow(line) {
  return /^\s*\|.*\|\s*$/.test(line.trim()) && !isSeparatorRow(line);
}

function backtickTokens(text) {
  const out = [];
  const re = /`([^`]+)`/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[1].trim());
  return out;
}

function classifyToken(raw) {
  const t = raw.trim();
  if (!t) return { kind: 'value' };
  if (/\.(?:guard\.)?test\.ts$/.test(t)) return { kind: 'guard', value: t };
  if (t.startsWith('src/') || t.startsWith('@/')) return { kind: 'path', value: t };
  if (/\/[\w.-]+\.(?:tsx?|mjs|cjs|css|sql)$/.test(t) && !/\s/.test(t)) {
    return { kind: 'path', value: t };
  }
  if (/^[\w.-]+\.(?:tsx?|mjs|cjs|css|sql)$/.test(t)) return { kind: 'path', value: t };
  const bare = t.replace(/\(\)$/, '');
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(bare)) {
    if (/[A-Z_]/.test(bare)) return { kind: 'symbol', value: bare };
    return { kind: 'value' };
  }
  return { kind: 'value' };
}

const GUARD_BARE_RE = /\b([A-Za-z0-9_.-]+\.(?:guard\.)?test\.ts)\b/;

function firstGuard(text, classified) {
  const g = classified.find((c) => c.kind === 'guard');
  if (g) return g.value;
  const m = text.match(GUARD_BARE_RE);
  return m ? m[1] : null;
}

function firstPath(classified) {
  const preferred = classified.find(
    (c) => c.kind === 'path' && (c.value.startsWith('src/') || c.value.startsWith('@/')),
  );
  if (preferred) return preferred.value;
  const any = classified.find((c) => c.kind === 'path');
  return any ? any.value : null;
}

function dedupe(arr) {
  return [...new Set(arr)];
}

function stripMd(s) {
  return s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function snippet(s, max = 240) {
  const cleaned = s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1).trimEnd()}…` : cleaned;
}

function pathBasename(p) {
  if (!p) return null;
  const base = p.replace(/\/+$/, '').split('/').pop();
  return base || p;
}

function extractTableEntries(file, lines) {
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    if (!isSeparatorRow(lines[i])) continue;
    const header = i > 0 ? lines[i - 1] : '';
    if (!isTableRow(header)) continue;
    for (let j = i + 1; j < lines.length && isTableRow(lines[j]); j++) {
      const cells = splitCells(lines[j]);
      if (cells.length < 2) continue;
      // Region tables: Region | Job | SoT  → job = "Region: Job"
      // SoT tables: Job | SoT → job = Job
      let job;
      let sourceText;
      if (cells.length >= 3 && /^(station|workbench|monitor|canvas|shared)$/i.test(cells[0])) {
        job = `${stripMd(cells[0])}: ${stripMd(cells[1])}`;
        sourceText = cells.slice(2).join('  ');
      } else {
        job = stripMd(cells[0]);
        sourceText = cells.slice(1).join('  ');
      }
      if (job.length < 2) continue;
      const tokens = backtickTokens(sourceText).map(classifyToken);
      const symbols = dedupe(tokens.filter((t) => t.kind === 'symbol').map((t) => t.value));
      const p = firstPath(tokens);
      const guard = firstGuard(sourceText, tokens);
      if (!p && !guard && symbols.length === 0) continue;
      entries.push({
        job,
        sot: symbols[0] || pathBasename(p) || guard || job,
        path: p,
        guard,
        symbols,
        kind: 'table',
        source: file,
        line: j + 1,
        snippet: snippet(sourceText),
      });
    }
  }
  return entries;
}

function extractProseEntries(file, lines) {
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\s*[-*]\s+\*\*/.test(line)) continue;
    const boldMatch = line.match(/\*\*([^*]+)\*\*/);
    if (!boldMatch) continue;
    const job = stripMd(boldMatch[1]);
    if (job.length < 2) continue;
    const tokens = backtickTokens(line).map(classifyToken);
    const symbols = dedupe(tokens.filter((t) => t.kind === 'symbol').map((t) => t.value)).slice(0, 16);
    const p = firstPath(tokens);
    const guard = firstGuard(line, tokens);
    if (!p && !guard && symbols.length === 0) continue;
    entries.push({
      job,
      sot: symbols[0] || pathBasename(p) || guard || job,
      path: p,
      guard,
      symbols,
      kind: 'law',
      source: file,
      line: i + 1,
      snippet: snippet(line.replace(/^\s*[-*]\s+/, '')),
    });
  }
  return entries;
}

// ─────────────────────────────────────────────────────────────────────────────
// Code scan
// ─────────────────────────────────────────────────────────────────────────────

const EXPORT_RE =
  /^export\s+(?:async\s+)?(?:function|const|class|type|interface|enum)\s+([A-Za-z_][A-Za-z0-9_]*)/gm;

function walkFiles(absDir, out = []) {
  if (!existsSync(absDir)) return out;
  const st = statSync(absDir);
  if (st.isFile()) {
    out.push(absDir);
    return out;
  }
  for (const entry of readdirSync(absDir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(absDir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walkFiles(full, out);
    else if (/\.(tsx?|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

function extractCodeEntries(repoRoot) {
  const entries = [];
  const seen = new Set();
  for (const relRoot of CODE_SCAN_ROOTS) {
    const absRoot = path.join(repoRoot, relRoot);
    for (const abs of walkFiles(absRoot)) {
      const rel = path.relative(repoRoot, abs).split(path.sep).join('/');
      if (SKIP_NAME_RE.test(rel)) continue;
      let text;
      try {
        text = readFileSync(abs, 'utf8');
      } catch {
        continue;
      }
      EXPORT_RE.lastIndex = 0;
      let m;
      while ((m = EXPORT_RE.exec(text)) !== null) {
        const sym = m[1];
        // Skip private-ish / type-noise prefixes and one-letter locals.
        if (sym.startsWith('_') || sym.length < 2) continue;
        if (/^(Props|State|Options|Config|Params|Args|Result|Response|Request)$/.test(sym)) continue;
        const key = `${sym}::${rel}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const line = text.slice(0, m.index).split('\n').length;
        entries.push({
          job: `Export: ${sym}`,
          sot: sym,
          path: rel,
          guard: null,
          symbols: [sym],
          kind: 'code',
          source: rel,
          line,
          snippet: `export ${sym} from ${rel}`,
        });
      }
    }
  }
  return entries;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build
// ─────────────────────────────────────────────────────────────────────────────

export function buildSotManifest(repoRoot = REPO_ROOT) {
  const entries = [];
  for (const rel of SOT_SOURCE_FILES) {
    const abs = path.join(repoRoot, rel);
    if (!existsSync(abs)) continue;
    const lines = readFileSync(abs, 'utf8').split('\n');
    entries.push(...extractTableEntries(rel, lines));
    if (PROSE_LAW_FILES.has(rel)) entries.push(...extractProseEntries(rel, lines));
  }
  entries.push(...extractCodeEntries(repoRoot));

  const order = new Map(SOT_SOURCE_FILES.map((f, idx) => [f, idx]));
  entries.sort(
    (a, b) =>
      (order.get(a.source) ?? 50) - (order.get(b.source) ?? 50) ||
      a.source.localeCompare(b.source) ||
      a.line - b.line,
  );
  return {
    $schema: 'sot-manifest/v1',
    generatedBy: 'scripts/build-sot-manifest.mjs',
    regenerate: 'node scripts/build-sot-manifest.mjs',
    lookup: 'node scripts/sot-lookup.mjs "<job>"',
    parityGuard: 'src/lib/sot-manifest/sot-manifest.guard.test.ts',
    sources: [...SOT_SOURCE_FILES, ...CODE_SCAN_ROOTS],
    count: entries.length,
    entries,
  };
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function searchManifest(manifest, query, limit = 8) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  const scored = [];
  for (const e of manifest.entries) {
    const job = e.job.toLowerCase();
    const sot = (e.sot || '').toLowerCase();
    const syms = (e.symbols || []).map((s) => s.toLowerCase());
    const symText = syms.join(' ');
    const hay = [job, sot, symText, (e.path || '').toLowerCase(), (e.guard || '').toLowerCase(), (e.snippet || '').toLowerCase()].join(' \u0001 ');
    let score = 0;
    if (job === q) score = 1000;
    else if (sot === q || syms.includes(q)) score = 900;
    else if (job.startsWith(q)) score = 800;
    else if (tokens.every((t) => job.includes(t))) score = 700;
    else if (tokens.every((t) => symText.includes(t) || sot.includes(t))) score = 600;
    else if (tokens.every((t) => hay.includes(t))) score = 500;
    else if (isSubsequence(q.replace(/\s+/g, ''), job.replace(/\s+/g, ''))) score = 200;
    if (score === 0) continue;
    // Prefer AGENTS.md / table / law entries over raw export dumps.
    if (e.kind === 'table' || e.kind === 'law') score += 40;
    if (e.path) score += 5;
    if (e.guard) score += 3;
    scored.push({ e, score });
  }
  scored.sort(
    (a, b) => b.score - a.score || a.e.source.localeCompare(b.e.source) || a.e.line - b.e.line,
  );
  return scored.slice(0, limit).map(({ e, score }) => ({ ...e, _score: score }));
}

function isSubsequence(needle, hay) {
  let i = 0;
  for (let j = 0; j < hay.length && i < needle.length; j++) {
    if (hay[j] === needle[i]) i++;
  }
  return i === needle.length;
}

function main(argv) {
  const args = argv.slice(2);
  const manifest = buildSotManifest();
  const serialized = serializeManifest(manifest);
  if (args.includes('--stdout')) {
    process.stdout.write(serialized);
    return 0;
  }
  if (args.includes('--check')) {
    const current = existsSync(MANIFEST_PATH) ? readFileSync(MANIFEST_PATH, 'utf8') : '';
    if (current !== serialized) {
      process.stderr.write(
        'sot-manifest.json is out of date. Run: node scripts/build-sot-manifest.mjs\n',
      );
      return 1;
    }
    process.stdout.write(`sot-manifest.json is up to date (${manifest.count} entries).\n`);
    return 0;
  }
  writeFileSync(MANIFEST_PATH, serialized);
  process.stdout.write(
    `Wrote ${path.relative(REPO_ROOT, MANIFEST_PATH)} — ${manifest.count} SoT entries from ${manifest.sources.length} sources.\n`,
  );
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv);
}
