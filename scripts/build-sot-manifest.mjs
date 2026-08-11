/**
 * SoT-by-job manifest builder (DS fork-consolidation program — Phase 1 slice 1c).
 *
 * Projects the design-system Source-of-Truth knowledge that lives in prose
 * (`.claude/rules/**` tables + `AGENTS.md` hard-law goldens) into a
 * machine-readable catalog `{ job → { sot, path, guard, symbols, … } }`, so an
 * agent can ask "what is the SoT for job X?" and get the module + path + guard
 * **before** writing — the discovery-before-build half of stopping the
 * re-forking (PLAN D10 / §2 1c).
 *
 * This is a deterministic PROJECTION, not a second source of truth: the rule
 * files remain authoritative; `sot-manifest.json` is regenerated from them and
 * parity-guarded by `src/lib/sot-manifest/sot-manifest.guard.test.ts` (the same
 * prose↔artifact contract D12 asks for, applied to itself).
 *
 * Usage:
 *   node scripts/build-sot-manifest.mjs           # regenerate sot-manifest.json
 *   node scripts/build-sot-manifest.mjs --check    # exit 1 if out of date
 *   node scripts/build-sot-manifest.mjs --stdout    # print JSON, do not write
 *
 * Retrieval is `scripts/sot-lookup.mjs` (ranked search over this manifest).
 * The MCP-server exposure the PLAN also lists is a separate, opt-in dev surface
 * (the runtime `src/lib/mcp/tool-server.ts` is org-permission-gated and is NOT
 * the home for a build-time catalog); this CLI is the sanctioned retrieval tool.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..');
export const MANIFEST_PATH = path.join(REPO_ROOT, 'sot-manifest.json');

/**
 * The SoT-carrying rule files, in a fixed deterministic order. The design-system
 * knowledge surface only (AGENTS.md constitution + the DS rule set) — not the
 * backend/tenancy/workflow rules, which carry no UI-fork SoTs. New display docs
 * are added here explicitly (reviewable) rather than globbed (fs-order-fragile).
 */
export const SOT_SOURCE_FILES = [
  'AGENTS.md',
  '.claude/rules/contextual-display.md',
  '.claude/rules/kinetic-ledger.md',
  '.claude/rules/source-of-truth.md',
  '.claude/rules/ui-design-system.md',
  '.claude/rules/display/auth-step-panel.md',
  '.claude/rules/display/carton-read.md',
  '.claude/rules/display/instrument-panel.md',
  '.claude/rules/display/kiosk-shell.md',
  '.claude/rules/display/media-library.md',
  '.claude/rules/display/monitor-and-canvas.md',
  '.claude/rules/display/monitor-rollup-blocks.md',
  '.claude/rules/display/motion-crossfade.md',
  '.claude/rules/display/reference-timeline.md',
  '.claude/rules/display/right-rail-inspector.md',
  '.claude/rules/display/scan-cockpit.md',
  '.claude/rules/display/station-port-from-unbox.md',
  '.claude/rules/display/station-workbench.md',
  '.claude/rules/display/station.md',
  '.claude/rules/display/unbox-station.md',
  '.claude/rules/display/workbench-master-detail.md',
  '.claude/rules/display/workbench-ops-queue.md',
  '.claude/rules/display/workbench-service.md',
  '.claude/rules/display/workbench.md',
];

/** AGENTS.md alone carries the hard-law "Golden(s): X · Guard: y" prose bullets. */
const PROSE_LAW_FILES = new Set(['AGENTS.md']);

// ─────────────────────────────────────────────────────────────────────────────
// Token / cell parsing
// ─────────────────────────────────────────────────────────────────────────────

/** Split a markdown table row into cells, respecting backticks + escaped pipes. */
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

/** A markdown table separator row: `|---|---|` / `| :-- | --: |`. */
function isSeparatorRow(line) {
  return /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && /-/.test(line);
}

function isTableRow(line) {
  return /^\s*\|.*\|\s*$/.test(line.trim()) && !isSeparatorRow(line);
}

/** Extract the inner text of every `` `code` `` span, in order. */
function backtickTokens(text) {
  const out = [];
  const re = /`([^`]+)`/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[1].trim());
  return out;
}

/**
 * Classify a backtick token: path (module), guard (`*.test.ts`), symbol (a code
 * identifier — Pascal/camel/SCREAMING/`fn()`), or value (a plain string / class /
 * enum value we do not index).
 */
function classifyToken(raw) {
  const t = raw.trim();
  if (!t) return { kind: 'value' };
  if (/\.(?:guard\.)?test\.ts$/.test(t)) return { kind: 'guard', value: t };
  // Aliased module paths (src/…, @/…) — including barrel dirs with no file ext.
  if (t.startsWith('src/') || t.startsWith('@/')) return { kind: 'path', value: t };
  // A non-aliased module path must name a real file with an extension — this
  // rejects CSS value lists (`bg-surface-canvas/sunken/card`), enum unions
  // (`unread/read/done/snoozed`), fractions (`0/expected`) and dir stubs
  // (`display/`) that would otherwise masquerade as module paths.
  if (/\/[\w.-]+\.(?:tsx?|mjs|cjs|css|sql)$/.test(t) && !/\s/.test(t)) {
    return { kind: 'path', value: t };
  }
  // A bare module filename (presets.ts, workbench-shell.tsx) — treat as a path.
  if (/^[\w.-]+\.(?:tsx?|mjs|cjs|css|sql)$/.test(t)) return { kind: 'path', value: t };
  const bare = t.replace(/\(\)$/, '');
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(bare)) {
    // A code identifier only if it carries an uppercase letter or an underscore
    // (PascalCase / camelCase-with-cap / SCREAMING_SNAKE / a snake const); a
    // plain lowercase word (`urgent`, `stage`, `normal`) is a value, not an SoT.
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

/** Strip markdown for a human-readable job / snippet (keeps identifiers intact). */
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

// ─────────────────────────────────────────────────────────────────────────────
// Extractors
// ─────────────────────────────────────────────────────────────────────────────

/** One entry per SoT table row that names real code (a path, guard, or symbol). */
function extractTableEntries(file, lines) {
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    if (!isSeparatorRow(lines[i])) continue;
    const header = i > 0 ? lines[i - 1] : '';
    if (!isTableRow(header)) continue;
    // Consume the contiguous data rows below the separator.
    for (let j = i + 1; j < lines.length && isTableRow(lines[j]); j++) {
      const cells = splitCells(lines[j]);
      if (cells.length < 2) continue;
      const job = stripMd(cells[0]);
      if (job.length < 2) continue;
      const sourceText = cells.slice(1).join('  ');
      const tokens = backtickTokens(sourceText).map(classifyToken);
      const symbols = dedupe(tokens.filter((t) => t.kind === 'symbol').map((t) => t.value));
      const p = firstPath(tokens);
      const guard = firstGuard(sourceText, tokens);
      if (!p && !guard && symbols.length === 0) continue; // no code → not an SoT row
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
    i += 1; // advance past the separator; the loop resumes scanning after it
  }
  return entries;
}

/** One entry per AGENTS.md hard-law bullet whose bold lead names real code. */
function extractProseEntries(file, lines) {
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\s*[-*]\s+\*\*/.test(line)) continue; // a bullet with a bold lead
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
  const order = new Map(SOT_SOURCE_FILES.map((f, idx) => [f, idx]));
  entries.sort(
    (a, b) => (order.get(a.source) ?? 99) - (order.get(b.source) ?? 99) || a.line - b.line,
  );
  return {
    $schema: 'sot-manifest/v1',
    generatedBy: 'scripts/build-sot-manifest.mjs',
    regenerate: 'node scripts/build-sot-manifest.mjs',
    lookup: 'node scripts/sot-lookup.mjs "<job>"',
    parityGuard: 'src/lib/sot-manifest/sot-manifest.guard.test.ts',
    sources: SOT_SOURCE_FILES,
    count: entries.length,
    entries,
  };
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/** Ranked retrieval over the manifest (nav-search-style ladder). */
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
    const hay = [job, sot, symText, (e.path || '').toLowerCase(), (e.guard || '').toLowerCase(), (e.snippet || '').toLowerCase()].join('  ');
    let score = 0;
    if (job === q) score = 1000;
    else if (sot === q || syms.includes(q)) score = 900;
    else if (job.startsWith(q)) score = 800;
    else if (tokens.every((t) => job.includes(t))) score = 700;
    else if (tokens.every((t) => symText.includes(t) || sot.includes(t))) score = 600;
    else if (tokens.every((t) => hay.includes(t))) score = 500;
    else if (isSubsequence(q.replace(/\s+/g, ''), job.replace(/\s+/g, ''))) score = 200;
    if (score === 0) continue;
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

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

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
    `Wrote ${path.relative(REPO_ROOT, MANIFEST_PATH)} — ${manifest.count} SoT entries from ${manifest.sources.length} rule files.\n`,
  );
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Set exitCode (not process.exit) so a large --stdout payload fully drains to a
  // pipe before the process exits — process.exit() truncates piped stdout mid-write.
  process.exitCode = main(process.argv);
}
