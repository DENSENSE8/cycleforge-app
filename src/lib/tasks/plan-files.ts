import 'server-only';

/** The plan-file catalog — which markdown files in THIS codebase a task may link as a `repo` document, and the only code that reads them… */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { PlanFileEntry } from './task-documents-shared';
import { TASK_DOCUMENT_TITLE_MAX } from './task-documents-shared';

/** A plan larger than this is not read at all (refused as `invalid_path`). */
export const PLAN_FILE_MAX_BYTES = 1_048_576;
/** Longest repo-relative path the gate accepts. */
const PLAN_PATH_MAX = 500;
/** A title is the first `# ` heading within this many lines, else the file name. */
const TITLE_SCAN_LINES = 40;
/** Bytes read from the head of each file when cataloguing (title scan only). */
const TITLE_SCAN_BYTES = 8_192;
const CATALOG_TTL_MS = 60_000;

const DOCS_ROOT = 'docs';
/** `docs/<name>/` subtrees that are history, machine logs or generated specs — not plans. */
const DOCS_EXCLUDED: Readonly<Record<string, true>> = { archive: true, 'agent-log': true, openapi: true };
const MASTER_PLAN = 'master-plan.mdx';

/** Pure gate: a repo-relative, forward-slash plan path, or null when the input is not one. */
export function normalizePlanPath(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  if (raw.length === 0 || raw.length > PLAN_PATH_MAX) return null;
  if (raw.includes('\0') || raw.includes('\\')) return null;
  if (raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) return null;

  const segments = raw.split('/');
  for (const segment of segments) {
    // Empty (`a//b`, trailing `/`), `.`, `..` and hidden names are all refused.
    if (segment.length === 0 || segment.startsWith('.')) return null;
  }
  const name = segments[segments.length - 1];
  const allowed =
    segments.length === 1
      ? name === MASTER_PLAN || /\.md$/i.test(name)
      : segments[0] === DOCS_ROOT && DOCS_EXCLUDED[segments[1]] !== true && /\.mdx?$/i.test(name);
  return allowed ? raw : null;
}

/** Root-relative forward-slash form of an absolute path under `root`, or null. */
function relativeInside(root: string, absolute: string): string | null {
  const rel = path.relative(root, absolute);
  if (rel.length === 0 || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

/** Resolve a gated path to its real absolute file, re-checking the allowlist after `path.resolve` and after `fs.realpath`. */
async function resolvePlanFile(
  normalized: string,
): Promise<{ kind: 'ok'; absolute: string; sizeBytes: number } | { kind: 'missing' } | { kind: 'invalid' }> {
  const cwd = /* turbopackIgnore: true */ process.cwd();
  const resolved = path.resolve(/* turbopackIgnore: true */ cwd, normalized);
  const lexical = relativeInside(cwd, resolved);
  if (lexical === null || normalizePlanPath(lexical) !== lexical) return { kind: 'invalid' };

  let real: string;
  let realRoot: string;
  try {
    [real, realRoot] = await Promise.all([fs.realpath(resolved), fs.realpath(/* turbopackIgnore: true */ cwd)]);
  } catch {
    return { kind: 'missing' };
  }
  const realRel = relativeInside(realRoot, real);
  if (realRel === null || normalizePlanPath(realRel) === null) return { kind: 'invalid' };

  try {
    const stat = await fs.stat(real);
    if (!stat.isFile()) return { kind: 'missing' };
    return { kind: 'ok', absolute: real, sizeBytes: stat.size };
  } catch {
    return { kind: 'missing' };
  }
}

/** First `# ` heading within the first {@link TITLE_SCAN_LINES} lines, else the file name. */
function titleFrom(text: string, relPath: string): string {
  const lines = text.split('\n', TITLE_SCAN_LINES);
  for (const line of lines) {
    const match = /^#\s+(.+?)\s*#*\s*$/.exec(line.replace(/\r$/, ''));
    if (match && match[1].trim()) return match[1].trim().slice(0, TASK_DOCUMENT_TITLE_MAX);
  }
  return path.posix.basename(relPath).slice(0, TASK_DOCUMENT_TITLE_MAX);
}

async function readHead(absolute: string): Promise<string> {
  const handle = await fs.open(absolute, 'r');
  try {
    const buffer = Buffer.alloc(TITLE_SCAN_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, TITLE_SCAN_BYTES, 0);
    return buffer.toString('utf8', 0, bytesRead);
  } finally {
    await handle.close();
  }
}

// ── catalog ─────────────────────────────────────────────────────────────────

let catalogCache: { at: number; entries: Promise<PlanFileEntry[]> } | null = null;

/** Every allowed relative path under the roots. Symlinks are not followed. */
async function walkPlanPaths(): Promise<string[]> {
  const cwd = /* turbopackIgnore: true */ process.cwd();
  const found: string[] = [];

  const rootEntries = await fs.readdir(/* turbopackIgnore: true */ cwd, { withFileTypes: true }).catch(() => []);
  for (const entry of rootEntries) {
    if (entry.isFile() && normalizePlanPath(entry.name) === entry.name) found.push(entry.name);
  }

  async function walk(relDir: string): Promise<void> {
    const entries = await fs.readdir(path.join(/* turbopackIgnore: true */ cwd, relDir), { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const rel = `${relDir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (relDir === DOCS_ROOT && DOCS_EXCLUDED[entry.name] === true) continue;
        await walk(rel);
      } else if (entry.isFile() && normalizePlanPath(rel) === rel) {
        found.push(rel);
      }
    }
  }
  await walk(DOCS_ROOT);
  return found;
}

async function buildCatalog(): Promise<PlanFileEntry[]> {
  const paths = await walkPlanPaths();
  const entries: PlanFileEntry[] = [];
  for (const rel of paths) {
    const resolved = await resolvePlanFile(rel);
    if (resolved.kind !== 'ok' || resolved.sizeBytes > PLAN_FILE_MAX_BYTES) continue;
    const head = await readHead(resolved.absolute).catch(() => '');
    entries.push({ path: rel, title: titleFrom(head, rel), sizeBytes: resolved.sizeBytes });
  }
  return entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

function catalog(): Promise<PlanFileEntry[]> {
  const now = Date.now();
  if (catalogCache && now - catalogCache.at < CATALOG_TTL_MS) return catalogCache.entries;
  const entries = buildCatalog();
  catalogCache = { at: now, entries };
  // A failed walk must not pin an empty catalog for a minute.
  entries.catch(() => {
    if (catalogCache?.entries === entries) catalogCache = null;
  });
  return entries;
}

/**
 * Linkable plan files, sorted by path. `q` filters case-insensitively over
 * path and title. The walk is cached in-module for a minute.
 */
export async function listPlanFiles(q?: string, limit = 50): Promise<PlanFileEntry[]> {
  const entries = await catalog();
  const needle = q?.trim().toLowerCase() ?? '';
  const cap = Math.max(1, Math.min(Math.trunc(limit) || 50, 500));
  const out: PlanFileEntry[] = [];
  for (const entry of entries) {
    if (
      needle &&
      !entry.path.toLowerCase().includes(needle) &&
      !entry.title.toLowerCase().includes(needle)
    ) {
      continue;
    }
    out.push(entry);
    if (out.length >= cap) break;
  }
  return out;
}

// ── reads ───────────────────────────────────────────────────────────────────

export type PlanFileRead =
  | { ok: true; path: string; title: string; content: string; sizeBytes: number }
  | { ok: false; reason: 'invalid_path' | 'file_not_found' };

/**
 * Read one plan file as it is NOW. `invalid_path` for anything the gate
 * refuses (including a symlink out of the allowlist and a file over
 * {@link PLAN_FILE_MAX_BYTES}); `file_not_found` when it is not on disk.
 */
export async function readPlanFile(raw: string): Promise<PlanFileRead> {
  const normalized = normalizePlanPath(raw);
  if (normalized === null) return { ok: false, reason: 'invalid_path' };
  const resolved = await resolvePlanFile(normalized);
  if (resolved.kind === 'invalid') return { ok: false, reason: 'invalid_path' };
  if (resolved.kind === 'missing') return { ok: false, reason: 'file_not_found' };
  if (resolved.sizeBytes > PLAN_FILE_MAX_BYTES) return { ok: false, reason: 'invalid_path' };

  let content: string;
  try {
    // Shipped via `outputFileTracingIncludes`; keep the tracer from pulling the whole repo.
    content = await fs.readFile(/* turbopackIgnore: true */ resolved.absolute, 'utf8');
  } catch {
    return { ok: false, reason: 'file_not_found' };
  }
  return {
    ok: true,
    path: normalized,
    title: titleFrom(content, normalized),
    content,
    sizeBytes: Buffer.byteLength(content, 'utf8'),
  };
}

/** Size of a linkable plan file in bytes, or null when it is gone or no longer allowed. */
export async function statPlanFile(raw: string): Promise<number | null> {
  const normalized = normalizePlanPath(raw);
  if (normalized === null) return null;
  const resolved = await resolvePlanFile(normalized);
  return resolved.kind === 'ok' ? resolved.sizeBytes : null;
}
