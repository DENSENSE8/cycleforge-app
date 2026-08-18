/**
 * Ratchet: ban host-local civil-date anti-patterns that shift a day on UTC CI.
 *
 * Forbidden in production src (outside allowlisted SoT / intentional zoned bridges):
 *   new Date(`${…}T00:00:00`)     — local midnight reparse
 *   new Date('YYYY-MM-DD')        — ECMA UTC midnight then local getters
 *
 * Prefer: parseDateKey / addDaysToDateKey / formatDateKeyShort / dateKeyToLocalDate
 * from `@/utils/date`.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { test } from 'node:test';

const SRC_ROOT = join(process.cwd(), 'src');

/** Files allowed to mention the banned patterns (docs, SoT, intentional zoned bridges). */
const ALLOWLIST_PATH_RE =
  /(?:^|\/)(?:utils\/date\.ts|utils\/date\.civil\.test\.ts|utils\/date-civil\.guard\.test\.ts|lib\/staff-availability\.ts)$/;

// Local midnight from a template/key — the CI day-shift class.
const LOCAL_MIDNIGHT_RE = /new\s+Date\s*\(\s*[`'"]\$\{[^}`'"]+\}T00:00:00[`'"]\s*\)/g;
const LOCAL_MIDNIGHT_LIT_RE = /new\s+Date\s*\(\s*[`'"][^`'"]*T00:00:00[`'"]\s*\)/g;
// Bare date-only string to Date (ECMA → UTC midnight).
const BARE_DATE_KEY_RE = /new\s+Date\s*\(\s*['"]\d{4}-\d{2}-\d{2}['"]\s*\)/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (['.ts', '.tsx'].includes(extname(entry))) out.push(full);
  }
  return out;
}

function isCommentLine(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

function stripCommentsForScan(src: string): string {
  // Keep line structure for reporting; blank out pure comment lines.
  return src
    .split('\n')
    .map((line) => (isCommentLine(line) ? '' : line))
    .join('\n');
}

function collectHits(file: string, src: string, re: RegExp): string[] {
  const hits: string[] = [];
  const body = stripCommentsForScan(src);
  // Skip explicit Z / offset civil bridges (UTC noon math).
  for (const m of body.matchAll(re)) {
    const snip = m[0];
    if (/T00:00:00Z|T00:00:00\.000Z|T00:00:00[+-]/.test(snip)) continue;
    // fromZonedTime(`${key}T00:00:00`, zone) is intentional — only ban new Date(...)
    hits.push(snip);
  }
  return hits;
}

test('no host-local civil-date reparse (T00:00:00 without Z)', () => {
  const files = walk(SRC_ROOT);
  const offenders: string[] = [];

  for (const full of files) {
    const rel = relative(SRC_ROOT, full).replace(/\\/g, '/');
    if (ALLOWLIST_PATH_RE.test(rel)) continue;
    // Tests may use fixed ISO instants with Z; still ban local T00:00:00.
    const src = readFileSync(full, 'utf8');
    const hits = [
      ...collectHits(full, src, LOCAL_MIDNIGHT_RE),
      ...collectHits(full, src, LOCAL_MIDNIGHT_LIT_RE),
    ];
    for (const h of hits) {
      offenders.push(`${rel}: ${h}`);
    }
  }

  assert.equal(
    offenders.length,
    0,
    `Host-local civil-date reparse found (use @/utils/date civil helpers):\n${offenders.join('\n')}`,
  );
});

test('no bare new Date("YYYY-MM-DD") outside allowlist', () => {
  const files = walk(SRC_ROOT);
  const offenders: string[] = [];

  for (const full of files) {
    const rel = relative(SRC_ROOT, full).replace(/\\/g, '/');
    if (ALLOWLIST_PATH_RE.test(rel)) continue;
    if (rel.endsWith('.test.ts') || rel.endsWith('.test.tsx')) continue;
    const src = readFileSync(full, 'utf8');
    const hits = collectHits(full, src, BARE_DATE_KEY_RE);
    for (const h of hits) offenders.push(`${rel}: ${h}`);
  }

  assert.equal(
    offenders.length,
    0,
    `Bare date-key Date() found (use parseDateKey / dateKeyToLocalDate):\n${offenders.join('\n')}`,
  );
});
