import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';

/**
 * Guards the API layer's half of the four-settled-states rule
 * (`.claude/rules/display/workbench.md`): **loading / absence / no-match /
 * degraded are four different answers, and a route may not collapse the last
 * two into one empty array.**
 *
 * The failure this exists to prevent, from 2026-08-01:
 * `/api/auth/staff-picker` selected a column that did not exist, caught the
 * throw, and returned `{ staff: [] }` with HTTP 200. Sign-in was down on every
 * tenant and nothing anywhere said so — the UI's "No active staff" teaching
 * empty rendered, which is a legitimate state, so nobody filed a bug. Contrast
 * the same day's missing `rlt.condition_graded_at`, which 500'd loudly on
 * `/api/receiving-lines` and was diagnosed in a single request. **The loud
 * failure was strictly better.**
 *
 * This is deliberately NOT "every catch must 500". `display/workbench.md`'s
 * degrade-not-fail rule still holds — a failing SUB-resource renders empty
 * rather than 500-ing the whole record. The distinction is *primary vs
 * sub-resource*, not *error vs no error*. So a catch block may still answer 2xx
 * with an empty collection, as long as it says it is degraded:
 *
 *   - **primary resource** → return a real error status (see `staff-picker`);
 *   - **sub-resource**     → keep 2xx, add `degraded: true` + `error`
 *                            (see `entity-signals`, `orders/queue-counts`).
 *
 * Either shape passes. Only a *silent* empty — 2xx, empty collection, no
 * `degraded` marker — is counted. Every route in this class must also state
 * which one it is in its header docblock.
 *
 * Shrink-only. Genuine one-offs (e.g. a webhook that must ACK 200 so the sender
 * stops retrying) carry `api-allow-silent-empty` on the same line or the line
 * directly above the `catch`.
 */

const API_ROOT = join(process.cwd(), 'src', 'app', 'api');

// Shrink-only. LOWER as you migrate; never raise.
// 2026-08-02: armed at 0 after the honest-failure sweep converted the five live
// sites (auth/staff-picker, auth/workspace, entity-signals,
// orders/queue-counts, assignments).
const SILENT_EMPTY_BASELINE = 0;

const ESCAPE_MARKER = 'api-allow-silent-empty';

/** `: []`, `: {}`, or a bare `([])` argument — an empty collection literal. */
const EMPTY_COLLECTION_RE = /:\s*\[\s*\]|:\s*\{\s*\}|\(\s*\[\s*\]\s*[,)]/;
/** Any marker that makes the degraded state legible to a caller. */
const DEGRADED_RE = /\bdegraded\b|\bfallback\b/;
const STATUS_RE = /status\s*:\s*(\d{3})/g;

function walkRoutes(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkRoutes(full, out);
    else if (entry === 'route.ts' || entry === 'route.tsx') out.push(full);
  }
  return out;
}

/**
 * Returns the balanced `{...}` block beginning at the first `{` at or after
 * `from`. Brace-matching rather than a regex: a catch body routinely nests
 * objects, template literals and further blocks, none of which a regex spans.
 */
function blockAt(src: string, from: number): { end: number; text: string } | null {
  const start = src.indexOf('{', from);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return { end: i + 1, text: src.slice(start, i + 1) };
    }
  }
  return null;
}

test('no API route answers an unexpected throw with a silent empty 2xx (ratchet)', () => {
  const offenders: string[] = [];

  for (const file of walkRoutes(API_ROOT)) {
    const rel = relative(process.cwd(), file).split('\\').join('/');
    const src = readFileSync(file, 'utf8');
    const lines = src.split('\n');

    let cursor = 0;
    while (true) {
      const at = src.indexOf('catch', cursor);
      if (at < 0) break;
      cursor = at + 'catch'.length;

      const block = blockAt(src, at);
      if (!block) continue;
      cursor = block.end;

      const body = block.text;
      // Only responses count — a catch that rethrows or logs is not this bug.
      if (!/\.json\s*\(|new Response|new NextResponse/.test(body)) continue;
      if (!EMPTY_COLLECTION_RE.test(body)) continue;
      // An explicit error status is the "primary resource" shape — allowed.
      const statuses = [...body.matchAll(STATUS_RE)].map((m) => Number(m[1]));
      if (statuses.some((s) => s >= 400)) continue;
      // An explicit degraded marker is the "sub-resource" shape — allowed.
      if (DEGRADED_RE.test(body)) continue;

      const lineNo = src.slice(0, at).split('\n').length;
      const thisLine = lines[lineNo - 1] ?? '';
      const prevLine = lineNo > 1 ? lines[lineNo - 2] ?? '' : '';
      if (thisLine.includes(ESCAPE_MARKER) || prevLine.includes(ESCAPE_MARKER)) continue;

      offenders.push(`${rel}:${lineNo}`);
    }
  }

  const count = offenders.length;

  assert.ok(
    count <= SILENT_EMPTY_BASELINE,
    `silent empty 2xx responses grew: ${count} > baseline ${SILENT_EMPTY_BASELINE}.\n` +
      'A caught throw must not be indistinguishable from "nothing exists". Either return a\n' +
      'real error status (primary resource) or add `degraded: true` + `error` to the 2xx body\n' +
      '(sub-resource), and say which the route is in its docblock. Genuine one-off: mark it\n' +
      `\`${ESCAPE_MARKER}\`. Offenders:\n${offenders.join('\n')}`,
  );
  assert.equal(
    count,
    SILENT_EMPTY_BASELINE,
    `baseline drifted down to ${count} — lower SILENT_EMPTY_BASELINE in ` +
      `silent-empty-response.guard.test.ts to ${count}.`,
  );
});
